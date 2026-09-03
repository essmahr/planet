import type { Command } from "../lib/context.ts";
import { need, needInt, parse } from "../lib/args.ts";
import { linkPrs, unlinkPr } from "../lib/link.ts";
import { commit } from "../lib/store.ts";

export const linkCommand: Command = async (args, ctx) => {
  const { positionals } = parse(args, {});
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const urls = positionals.slice(2);
  if (urls.length === 0) throw new Error("missing pr url");
  const result = linkPrs(ctx.home, epic, id, urls, ctx.now());
  if (result.added.length) commit(ctx.home, `${epic}: link phase ${id} to ${result.added.join(", ")}`);
  return {
    json: { phase: result.phase.meta, epic: result.epic, added: result.added },
    text: result.added.length ? `linked ${result.added.join(", ")} to phase ${id}` : "already linked",
  };
};

export const unlinkCommand: Command = async (args, ctx) => {
  const { positionals } = parse(args, {});
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const url = need(positionals, 2, "pr url");
  const result = unlinkPr(ctx.home, epic, id, url, ctx.now());
  commit(ctx.home, `${epic}: unlink ${url} from phase ${id}`);
  return { json: { phase: result.phase.meta, epic: result.epic }, text: `unlinked ${url} from phase ${id}` };
};
