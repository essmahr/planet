import { appendFileSync, mkdirSync } from "node:fs";
import type { Command, Ctx } from "../lib/context.ts";
import type { SessionMarker } from "../schema/types.ts";
import { PR_URL_RE, linkPrs } from "../lib/link.ts";
import { createProposal, findProposalByToolUse, latestPending, latestProposalId, markApproved, markRejected } from "../lib/proposal.ts";
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
 * Claude Code wraps its own context in these tags inside UserPromptSubmit: IDE state is
 * prepended to Scott's real prompt, and task notifications arrive alone. The blocks are
 * removed and whatever remains is Scott's text; nothing left means nothing to record.
 */
const INJECTED_BLOCK_RE = /<(task-notification|system-reminder|ide_opened_file|ide_selection)\b[^>]*>[\s\S]*?<\/\1>\s*/g;

export function userText(prompt: string): string {
  return prompt.replace(INJECTED_BLOCK_RE, "").trim();
}

function onPrompt(input: HookInput, marker: SessionMarker, ctx: Ctx): string[] {
  const text = userText(input.user_input ?? input.prompt ?? "");
  if (!text) return ["empty prompt"];
  const line = {
    ts: ctx.now(),
    session: input.session_id,
    kind: marker.phase === null ? "planning" : "implementation",
    phase: marker.phase,
    proposal: latestProposalId(ctx.home, marker.epic),
    text,
  };
  mkdirSync(paths.feedback(ctx.home, marker.epic), { recursive: true });
  appendFileSync(paths.prompts(ctx.home, marker.epic), `${JSON.stringify(line)}\n`);
  commit(ctx.home, `${marker.epic}: capture prompt`);
  return ["prompt captured"];
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
    const approved = markApproved(ctx.home, marker.epic, proposal.meta.id, planFromResult ?? approvedPlanText(text, proposal.body));
    const suffix = approved.meta.edited ? " with edits" : "";
    commit(ctx.home, `${marker.epic}: approve proposal ${proposal.meta.id}${suffix}`);
    return [`proposal ${proposal.meta.id} approved${approved.meta.edited ? " (edited)" : ""}`];
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

export function handleHook(raw: string, ctx: Ctx): string[] {
  const input = JSON.parse(raw) as HookInput;
  const marker = readMarker(ctx.home, input.session_id);
  if (!marker) return ["no marker"];
  switch (input.hook_event_name) {
    case "UserPromptSubmit":
      return onPrompt(input, marker, ctx);
    case "PreToolUse":
      return input.tool_name === "ExitPlanMode" ? onPlanProposed(input, marker, ctx) : ["ignored"];
    case "PostToolUse":
      if (input.tool_name === "ExitPlanMode") return onPlanResult(input, marker, ctx, responseText(input.tool_response), false);
      if (input.tool_name === "Bash") return onBash(input, marker, ctx);
      return ["ignored"];
    case "SessionEnd":
      endSession(ctx.home, input.session_id);
      commit(ctx.home, `${marker.epic}: end session`);
      return ["session ended"];
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
    const actions = handleHook(raw, ctx);
    return { json: { actions }, text: "" };
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
