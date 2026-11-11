import type { Command, CommandResult, Ctx } from "../lib/context.ts";
import { need, optString, parse } from "../lib/args.ts";
import { findCheckout, recordCheckout } from "../lib/repos.ts";

const NOT_FOUND = 3;

async function repoPath(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { from: { type: "string" } });
  const repo = need(positionals, 0, "repo");
  const path = findCheckout(ctx.home, repo, optString(values, "from") ?? process.cwd());
  if (path) return { json: { repo, path }, text: path };
  return {
    json: { repo, path: null },
    text: `no local checkout of ${repo}; run planet repo seen --path <dir>`,
    exitCode: NOT_FOUND,
  };
}

async function repoSeen(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { values } = parse(args, { path: { type: "string" } });
  const checkout = recordCheckout(ctx.home, optString(values, "path") ?? process.cwd());
  return { json: checkout, text: `${checkout.repo} ${checkout.path}` };
}

export const repoCommand: Command = async (args, ctx) => {
  const [sub, ...rest] = args;
  switch (sub) {
    case "path": return repoPath(rest, ctx);
    case "seen": return repoSeen(rest, ctx);
    default: throw new Error("usage: planet repo path <owner/name> [--from <dir>] | planet repo seen [--path <dir>]");
  }
};
