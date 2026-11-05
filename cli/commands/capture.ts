import { appendFileSync, mkdirSync } from "node:fs";
import type { Command, Ctx } from "../lib/context.ts";
import type { SessionMarker } from "../schema/types.ts";
import { pendingNote } from "../lib/pending-note.ts";
import { listPhases } from "../lib/phase.ts";
import { readMarks, releaseOwner, setAwaitingReply } from "../lib/pr-items.ts";
import { PR_URL_RE, linkPrs } from "../lib/link.ts";
import { createProposal, findProposalByToolUse, latestPending, latestProposalId, markApproved, markRejected, sameText } from "../lib/proposal.ts";
import { endSession, readMarker } from "../lib/session.ts";
import { commit, paths } from "../lib/store.ts";
import { rejectionFeedback } from "../lib/transcript.ts";

export interface HookInput {
  hook_event_name: string;
  session_id: string;
  transcript_path?: string;
  agent_id?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
  tool_error?: unknown;
  user_input?: string;
  prompt?: string;
}

const TEXT_KEYS = ["text", "stdout", "stderr", "output", "content", "error", "message"];

export function responseText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(responseText).filter(Boolean).join("\n");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const parts = TEXT_KEYS.map((k) => record[k]).filter((v): v is string => typeof v === "string" && v !== "");
    return parts.length ? parts.join("\n") : JSON.stringify(value);
  }
  return String(value);
}

export const APPROVED_RE = /^User has approved your plan/m;
export const APPROVED_PLAN_HEADING = "## Approved Plan:\n";
export const REJECTED_RE = /User chose to stay in plan mode|doesn't want to proceed|rejected the plan|was rejected/i;

export function approvedPlanText(response: string, fallback: string): string {
  const at = response.indexOf(APPROVED_PLAN_HEADING);
  if (at === -1) return fallback;
  return response.slice(at + APPROVED_PLAN_HEADING.length);
}

/**
 * The approved plan when Claude Code reports ExitPlanMode success as a structured
 * object, which is what PostToolUse actually carries: `{ plan, filePath, isAgent }`.
 * The sentence form (`User has approved your plan ...`) is what the model sees, not
 * the hook, but stays supported as a fallback.
 */
export function structuredPlan(response: unknown): string | null {
  if (typeof response !== "object" || response === null) return null;
  const plan = (response as { plan?: unknown }).plan;
  return typeof plan === "string" && plan.trim() !== "" ? plan : null;
}

const REJECTION_NOT_CAPTURED = "rejected before the next plan was proposed; message not captured";

/**
 * Claude Code wraps everything it injects into UserPromptSubmit in a tag that opens at
 * a line start: IDE state prepended to Scott's prompt, task notifications and subagent
 * hand-backs that arrive alone, bash-mode output. Every such block is removed whatever
 * its tag, so a wrapper added by a newer Claude Code is dropped too. Inline tags typed
 * mid-sentence (`<b>`, `<input`) are not at a line start and stay. Bash mode puts its
 * blocks on one line (`<bash-input>…</bash-input><bash-stdout>…</bash-stdout>`), so a
 * block directly after another block counts as at a line start.
 */
const INJECTED_BLOCK_RE = /(^|(?<=>))<([a-z][a-z0-9_-]*)\b[^>]*>([\s\S]*?)<\/\2>[ \t]*/gm;

/** Wrappers whose inner text is Scott's own: a paste the harness wrapped, or the command typed in bash mode. */
const KEEP_INNER = new Set(["pasted_content", "bash-input"]);

/** Wrappers seen so far. Stripping any other tag is logged, so a new wrapper or a wrongly stripped user block is visible in hook.log. */
const KNOWN_WRAPPERS = new Set([
  "task-notification", "system-reminder", "ide_opened_file", "ide_selection",
  "agent-message", "bash-stdout", "bash-stderr", "pr-created", "create-pr-command",
]);

export function stripInjected(prompt: string): { text: string; stripped: string[] } {
  const stripped: string[] = [];
  const text = prompt.replace(INJECTED_BLOCK_RE, (_whole, _start: string, tag: string, inner: string) => {
    if (KEEP_INNER.has(tag)) return inner.trim();
    stripped.push(tag);
    return "";
  });
  return { text: text.trim(), stripped };
}

export function userText(prompt: string): string {
  return stripInjected(prompt).text;
}

function awaitsThisSession(home: string, epic: string, phase: number, session: string): boolean {
  try {
    return readMarks(home, epic, phase).awaiting_reply === session;
  } catch {
    return false;
  }
}

function epicPhases(home: string, epic: string): number[] {
  try {
    return listPhases(home, epic).map((p) => p.meta.id);
  } catch {
    return [];
  }
}

/**
 * The phase whose batch this session showed and is waiting for a reply on, with its flag cleared, so only this session's next prompt counts as the reply.
 *
 * A broken phase or marks file means no awaited phase; the pending note already logs those.
 */
function takeAwaitedPhase(home: string, epic: string, session: string): number | null {
  const phase = epicPhases(home, epic).find((id) => awaitsThisSession(home, epic, id, session));
  if (phase === undefined) return null;
  setAwaitingReply(home, epic, phase, null);
  return phase;
}

/** Releases the feedback ownership an ending session held on the epic's phases, so another session can claim them. */
function releaseOwnership(home: string, epic: string, session: string): string[] {
  const released: string[] = [];
  for (const id of epicPhases(home, epic)) {
    try {
      if (releaseOwner(home, epic, id, session)) released.push(`released phase ${id} feedback`);
    } catch {
      // a corrupt marks file keeps its owner; liveOwner ignores it once the marker is gone
    }
  }
  return released;
}

function promptKind(marker: SessionMarker): string {
  if (marker.step === "pr-feedback") return "review";
  if (marker.step === "implement") return "implementation";
  return "planning";
}

async function onPrompt(input: HookInput, marker: SessionMarker, ctx: Ctx): Promise<HookResult> {
  const { text, stripped } = stripInjected(input.user_input ?? input.prompt ?? "");
  for (const tag of stripped) {
    if (!KNOWN_WRAPPERS.has(tag)) appendFileSync(paths.hookLog(ctx.home), `${ctx.now()} stripped <${tag}> from a prompt in ${marker.epic}\n`);
  }
  if (!text) return { actions: ["empty prompt"], context: null };
  const context = await pendingNote(ctx, marker.epic, input.session_id);
  const awaited = takeAwaitedPhase(ctx.home, marker.epic, input.session_id);
  const line = {
    ts: ctx.now(),
    session: input.session_id,
    kind: awaited === null ? promptKind(marker) : "review",
    phase: awaited ?? marker.phase,
    proposal: latestProposalId(ctx.home, marker.epic),
    text,
  };
  mkdirSync(paths.feedback(ctx.home, marker.epic), { recursive: true });
  appendFileSync(paths.prompts(ctx.home, marker.epic), `${JSON.stringify(line)}\n`);
  commit(ctx.home, `${marker.epic}: capture prompt`);
  return { actions: ["prompt captured"], context };
}

/**
 * A rejected plan fires no hook event. The only signal is a new ExitPlanMode arriving while
 * the previous proposal from this session is still pending, so that is when it is marked
 * rejected, with the message read from the transcript when it can be. This also means a
 * proposal whose approval event failed to record would be misfiled as rejected here.
 */
function rejectPending(input: HookInput, marker: SessionMarker, ctx: Ctx): string[] {
  const pending = latestPending(ctx.home, marker.epic, input.session_id);
  if (!pending) return [];
  const feedback = rejectionFeedback(input.transcript_path, pending.meta.tool_use) ?? REJECTION_NOT_CAPTURED;
  markRejected(ctx.home, marker.epic, pending.meta.id, feedback);
  commit(ctx.home, `${marker.epic}: reject proposal ${pending.meta.id}`);
  return [`proposal ${pending.meta.id} rejected`];
}

function onPlanProposed(input: HookInput, marker: SessionMarker, ctx: Ctx): string[] {
  if (input.agent_id) return ["subagent plan ignored"];
  const plan = input.tool_input?.plan;
  if (typeof plan !== "string") return ["no plan text"];
  const actions = rejectPending(input, marker, ctx);
  const planFile = typeof input.tool_input?.planFilePath === "string" ? input.tool_input.planFilePath : null;
  const proposal = createProposal(
    ctx.home,
    marker.epic,
    { step: marker.step ?? "unknown", phase: marker.phase, session: input.session_id, toolUse: input.tool_use_id ?? null, planFile, body: plan },
    ctx.now(),
  );
  commit(ctx.home, `${marker.epic}: snapshot proposal ${proposal.meta.id}`);
  actions.push(`proposal ${proposal.meta.id} created`);
  return actions;
}

function onPlanResult(input: HookInput, marker: SessionMarker, ctx: Ctx, text: string, forceReject: boolean): string[] {
  if (input.agent_id) return ["subagent plan ignored"];
  const byId = input.tool_use_id ? findProposalByToolUse(ctx.home, marker.epic, input.tool_use_id) : null;
  const proposal = byId ?? latestPending(ctx.home, marker.epic, input.session_id);
  if (!proposal) return ["no pending proposal"];
  if (proposal.meta.outcome !== "pending") return [`proposal ${proposal.meta.id} already ${proposal.meta.outcome}`];
  const planFromResult = forceReject ? null : structuredPlan(input.tool_response);
  if (planFromResult !== null || APPROVED_RE.test(text)) {
    const approvedPlan = planFromResult ?? approvedPlanText(text, proposal.body);
    markApproved(ctx.home, marker.epic, proposal.meta.id);
    if (!sameText(approvedPlan, proposal.body)) {
      appendFileSync(paths.hookLog(ctx.home), `${ctx.now()} approved text for proposal ${proposal.meta.id} differs from its snapshot; approve --to writes the snapshot\n`);
    }
    commit(ctx.home, `${marker.epic}: approve proposal ${proposal.meta.id}`);
    return [`proposal ${proposal.meta.id} approved`];
  }
  if (!forceReject && !REJECTED_RE.test(text)) {
    const id = proposal.meta.id;
    appendFileSync(paths.hookLog(ctx.home), `${ctx.now()} unrecognized ExitPlanMode result for proposal ${id}: ${text.slice(0, 500)}\n`);
    return [`proposal ${id} left pending: unrecognized result`];
  }
  markRejected(ctx.home, marker.epic, proposal.meta.id, text);
  commit(ctx.home, `${marker.epic}: reject proposal ${proposal.meta.id}`);
  return [`proposal ${proposal.meta.id} rejected`];
}

export const GH_PR_CREATE_RE = /\bgh\s+pr\s+create\b/;

function onBash(input: HookInput, marker: SessionMarker, ctx: Ctx): string[] {
  const command = typeof input.tool_input?.command === "string" ? input.tool_input.command : "";
  if (!GH_PR_CREATE_RE.test(command)) return ["ignored"];
  if (marker.phase === null) return ["no phase in session; not linking"];
  const match = PR_URL_RE.exec(responseText(input.tool_response));
  if (!match) return ["no PR url in output"];
  const url = match[0];
  const result = linkPrs(ctx.home, marker.epic, marker.phase, [url], ctx.now());
  if (result.added.length === 0) return ["already linked"];
  commit(ctx.home, `${marker.epic}: link phase ${marker.phase} to ${url}`);
  return [`linked ${url} to phase ${marker.phase}`];
}

export interface HookResult {
  actions: string[];
  context: string | null;
}

export async function handleHook(raw: string, ctx: Ctx): Promise<HookResult> {
  const input = JSON.parse(raw) as HookInput;
  const marker = readMarker(ctx.home, input.session_id);
  if (!marker) return { actions: ["no marker"], context: null };
  if (input.hook_event_name === "UserPromptSubmit") return onPrompt(input, marker, ctx);
  return { actions: onOtherEvent(input, marker, ctx), context: null };
}

function onOtherEvent(input: HookInput, marker: SessionMarker, ctx: Ctx): string[] {
  switch (input.hook_event_name) {
    case "PreToolUse":
      return input.tool_name === "ExitPlanMode" ? onPlanProposed(input, marker, ctx) : ["ignored"];
    case "PostToolUse":
      if (input.tool_name === "ExitPlanMode") return onPlanResult(input, marker, ctx, responseText(input.tool_response), false);
      if (input.tool_name === "Bash") return onBash(input, marker, ctx);
      return ["ignored"];
    case "SessionEnd":
      const released = releaseOwnership(ctx.home, marker.epic, input.session_id);
      endSession(ctx.home, input.session_id);
      commit(ctx.home, `${marker.epic}: end session`);
      return ["session ended", ...released];
    case "PostToolUseFailure":
    case "PermissionDenied":
      if (input.tool_name !== "ExitPlanMode") return ["ignored"];
      return onPlanResult(input, marker, ctx, responseText(input.tool_error) || "rejected without a message", true);
    default:
      return ["ignored"];
  }
}

export const captureCommand: Command = async (_args, ctx) => {
  try {
    const raw = ctx.stdin();
    if (raw.trim() === "") return { json: { actions: ["no input"] }, text: "capture reads a Claude Code hook payload on stdin; nothing to do" };
    const { actions, context } = await handleHook(raw, ctx);
    return { json: { actions }, text: context ?? "" };
  } catch (err) {
    const message = err instanceof Error ? err.stack ?? err.message : String(err);
    try {
      appendFileSync(paths.hookLog(ctx.home), `${ctx.now()} ${message}\n`);
    } catch {
      // the log itself is best effort
    }
    return { json: { error: message }, text: "", exitCode: 0 };
  }
};
