import type { Command, CommandResult, Ctx } from "../lib/context.ts";
import { need, needInt, needString, parse } from "../lib/args.ts";
import { readEpic } from "../lib/epic.ts";
import { touchEpic } from "../lib/lifecycle.ts";
import { dropMilestone, newMilestone } from "../lib/milestone.ts";
import { optProposal } from "../lib/proposal.ts";
import { commit } from "../lib/store.ts";

async function milestoneNew(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { title: { type: "string" }, proposal: { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const slug = need(positionals, 1, "milestone slug");
  const title = needString(values, "title");
  readEpic(ctx.home, epic);
  const proposal = optProposal(ctx, epic, values);
  const milestone = newMilestone(ctx.home, epic, { slug, title }, proposal);
  touchEpic(ctx.home, epic, ctx.now());
  commit(ctx.home, `${epic}: add milestone ${slug}`);
  return { json: milestone, text: `created milestone ${milestone.id} ${milestone.slug}` };
}

async function milestoneDrop(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { proposal: { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "milestone id");
  readEpic(ctx.home, epic);
  const proposal = optProposal(ctx, epic, values);
  const dropped = dropMilestone(ctx.home, epic, id, proposal);
  touchEpic(ctx.home, epic, ctx.now());
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
