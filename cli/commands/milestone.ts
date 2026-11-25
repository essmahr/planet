import type { Command, CommandResult, Ctx } from "../lib/context.ts";
import { need, needInt, needString, optString, parse } from "../lib/args.ts";
import { readEpic, writeEpic } from "../lib/epic.ts";
import { recomputeEpicStatus } from "../lib/lifecycle.ts";
import { dropMilestone, newMilestone } from "../lib/milestone.ts";
import { listPhases } from "../lib/phase.ts";
import { resolveProposalId } from "../lib/proposal.ts";
import { commit } from "../lib/store.ts";

function touchEpic(ctx: Ctx, epic: string): void {
  const epicDoc = readEpic(ctx.home, epic);
  epicDoc.updated = ctx.now();
  recomputeEpicStatus(epicDoc, listPhases(ctx.home, epic).map((p) => p.meta), ctx.now());
  writeEpic(ctx.home, epicDoc);
}

function proposalFrom(ctx: Ctx, epic: string, text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  return resolveProposalId(ctx.home, epic, text);
}

async function milestoneNew(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { title: { type: "string" }, proposal: { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const slug = need(positionals, 1, "milestone slug");
  const title = needString(values, "title");
  readEpic(ctx.home, epic);
  const proposal = proposalFrom(ctx, epic, optString(values, "proposal"));
  const milestone = newMilestone(ctx.home, epic, { slug, title }, proposal);
  touchEpic(ctx, epic);
  commit(ctx.home, `${epic}: add milestone ${slug}`);
  return { json: milestone, text: `created milestone ${milestone.id} ${milestone.slug}` };
}

async function milestoneDrop(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { proposal: { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "milestone id");
  readEpic(ctx.home, epic);
  const proposal = proposalFrom(ctx, epic, optString(values, "proposal"));
  const dropped = dropMilestone(ctx.home, epic, id, proposal);
  touchEpic(ctx, epic);
  commit(ctx.home, `${epic}: drop milestone ${id}`);
  return { json: dropped, text: `dropped milestone ${id} ${dropped.slug}` };
}

export const milestoneCommand: Command = async (args, ctx) => {
  const [sub, ...rest] = args;
  switch (sub) {
    case "new": return milestoneNew(rest, ctx);
    case "drop": return milestoneDrop(rest, ctx);
    default: throw new Error("usage: planet milestone new|drop");
  }
};
