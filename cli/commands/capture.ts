import { appendFileSync, mkdirSync } from "node:fs";
import type { Command, Ctx } from "../lib/context.ts";
import type { SessionMarker } from "../schema/types.ts";
import { createProposal, findProposalByToolUse, latestPending, latestProposalId, markApproved, markRejected } from "../lib/proposal.ts";
import { readMarker } from "../lib/session.ts";
import { commit, paths } from "../lib/store.ts";

export interface HookInput {
  hook_event_name: string;
  session_id: string;
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

export function approvedPlanText(response: string, fallback: string): string {
  const at = response.indexOf(APPROVED_PLAN_HEADING);
  if (at === -1) return fallback;
  return response.slice(at + APPROVED_PLAN_HEADING.length);
}

function onPrompt(input: HookInput, marker: SessionMarker, ctx: Ctx): string[] {
  const text = input.user_input ?? input.prompt ?? "";
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

function onPlanProposed(input: HookInput, marker: SessionMarker, ctx: Ctx): string[] {
  if (input.agent_id) return ["subagent plan ignored"];
  const plan = input.tool_input?.plan;
  if (typeof plan !== "string") return ["no plan text"];
  const planFile = typeof input.tool_input?.planFilePath === "string" ? input.tool_input.planFilePath : null;
  const proposal = createProposal(
    ctx.home,
    marker.epic,
    { step: marker.step ?? "unknown", phase: marker.phase, session: input.session_id, toolUse: input.tool_use_id ?? null, planFile, body: plan },
    ctx.now(),
  );
  commit(ctx.home, `${marker.epic}: snapshot proposal ${proposal.meta.id}`);
  return [`proposal ${proposal.meta.id} created`];
}

function onPlanResult(input: HookInput, marker: SessionMarker, ctx: Ctx, text: string): string[] {
  if (input.agent_id) return ["subagent plan ignored"];
  const byId = input.tool_use_id ? findProposalByToolUse(ctx.home, marker.epic, input.tool_use_id) : null;
  const proposal = byId ?? latestPending(ctx.home, marker.epic, input.session_id);
  if (!proposal) return ["no pending proposal"];
  if (proposal.meta.outcome !== "pending") return [`proposal ${proposal.meta.id} already ${proposal.meta.outcome}`];
  if (APPROVED_RE.test(text)) {
    const approved = markApproved(ctx.home, marker.epic, proposal.meta.id, approvedPlanText(text, proposal.body));
    const suffix = approved.meta.edited ? " with edits" : "";
    commit(ctx.home, `${marker.epic}: approve proposal ${proposal.meta.id}${suffix}`);
    return [`proposal ${proposal.meta.id} approved${approved.meta.edited ? " (edited)" : ""}`];
  }
  markRejected(ctx.home, marker.epic, proposal.meta.id, text);
  commit(ctx.home, `${marker.epic}: reject proposal ${proposal.meta.id}`);
  return [`proposal ${proposal.meta.id} rejected`];
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
      if (input.tool_name === "ExitPlanMode") return onPlanResult(input, marker, ctx, responseText(input.tool_response));
      return ["ignored"];
    case "PostToolUseFailure":
    case "PermissionDenied":
      if (input.tool_name !== "ExitPlanMode") return ["ignored"];
      return onPlanResult(input, marker, ctx, responseText(input.tool_error) || "rejected without a message");
    default:
      return ["ignored"];
  }
}

export const captureCommand: Command = async (_args, ctx) => {
  try {
    const actions = handleHook(ctx.stdin(), ctx);
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
