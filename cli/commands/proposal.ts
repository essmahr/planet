import { readFileSync } from "node:fs";
import type { Command, CommandResult, Ctx } from "../lib/context.ts";
import { need, needString, optString, parse } from "../lib/args.ts";
import { readEpic, writeEpic } from "../lib/epic.ts";
import { approveTo, createProposal, parseDestination, readProposal, resolveProposalId, tagProposal } from "../lib/proposal.ts";
import { sessionIdFrom } from "../lib/session.ts";
import { commit } from "../lib/store.ts";
import { FEEDBACK_TAGS } from "../schema/types.ts";
import type { Tag } from "../schema/types.ts";
import { parseStep } from "./session.ts";

export const proposeCommand: Command = async (args, ctx) => {
  const { positionals, values } = parse(args, { file: { type: "string" }, phase: { type: "string" }, session: { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const step = parseStep(need(positionals, 1, "step name"));
  const body = readFileSync(needString(values, "file"), "utf8");
  const phaseText = optString(values, "phase");
  const phase = phaseText === undefined ? null : Number(phaseText);
  if (phase !== null && !Number.isInteger(phase)) throw new Error("--phase must be an integer");
  const session = sessionIdFrom(ctx.env, optString(values, "session"));
  const proposal = createProposal(ctx.home, epic, { step, phase, session, toolUse: null, planFile: null, body }, ctx.now());
  commit(ctx.home, `${epic}: snapshot proposal ${proposal.meta.id}`);
  return { json: proposal.meta, text: `proposal ${proposal.meta.id}` };
};

async function proposalApprove(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { to: { type: "string" }, from: { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const idArg = need(positionals, 1, "proposal id");
  const id = resolveProposalId(ctx.home, epic, idArg);
  if (!/^\d+$/.test(idArg) && ctx.env.CLAUDE_CODE_SESSION_ID && readProposal(ctx.home, epic, id).meta.session !== ctx.env.CLAUDE_CODE_SESSION_ID) {
    throw new Error(`proposal ${id} is from another session; pass the id explicitly`);
  }
  const dest = parseDestination(needString(values, "to"));
  const from = optString(values, "from");
  const result = approveTo(ctx.home, epic, id, dest, from === undefined ? undefined : readFileSync(from, "utf8"));
  const epicDoc = readEpic(ctx.home, epic);
  epicDoc.updated = ctx.now();
  writeEpic(ctx.home, epicDoc);
  const where = dest.kind === "plan" ? "plan" : `phase ${dest.id}`;
  commit(ctx.home, `${epic}: approve proposal ${id} to ${where}`);
  return { json: { proposal: result.proposal.meta, wrote: result.wrote }, text: `wrote ${result.wrote}` };
}

async function proposalTag(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals } = parse(args, {});
  const epic = need(positionals, 0, "epic slug");
  const id = resolveProposalId(ctx.home, epic, need(positionals, 1, "proposal id"));
  const tag = need(positionals, 2, "tag");
  if (!(FEEDBACK_TAGS as readonly string[]).includes(tag)) throw new Error(`tag must be one of ${FEEDBACK_TAGS.join(", ")}`);
  const line = tagProposal(ctx.home, epic, id, tag as Tag);
  commit(ctx.home, `${epic}: tag proposal ${id} ${tag}`);
  return { json: { proposal: id, tag, line }, text: line };
}

export const proposalCommand: Command = async (args, ctx) => {
  const [sub, ...rest] = args;
  if (sub === "approve") return proposalApprove(rest, ctx);
  if (sub === "tag") return proposalTag(rest, ctx);
  throw new Error("usage: planet proposal approve <epic> <id> --to plan|phase:<n> | planet proposal tag <epic> <id> <tag>");
};
