import type { Command } from "../lib/context.ts";
import { need, needInt, parse } from "../lib/args.ts";
import type { PrFile } from "../lib/gh.ts";
import { readPhase } from "../lib/phase.ts";
import { renderTable } from "../lib/table.ts";

export const prCommand: Command = async (args, ctx) => {
  const [sub, ...rest] = args;
  if (sub !== "files") throw new Error("usage: planet pr files <epic> <phase>");
  const { positionals } = parse(rest, {});
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const phase = readPhase(ctx.home, epic, id);
  const merged = phase.meta.prs.filter((pr) => pr.state === "merged").map((pr) => pr.url);
  const source = merged.length ? "merged" : "all";
  const urls = merged.length ? merged : phase.meta.prs.map((pr) => pr.url);
  const byPath = new Map<string, PrFile>();
  for (const url of urls) {
    for (const f of await ctx.gh.prFiles(url)) {
      const cur = byPath.get(f.path) ?? { path: f.path, additions: 0, deletions: 0 };
      cur.additions += f.additions;
      cur.deletions += f.deletions;
      byPath.set(f.path, cur);
    }
  }
  const files = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  return {
    json: { phase: id, source, prs: urls, files },
    text: files.length ? renderTable(["PATH", "+", "-"], files.map((f) => [f.path, String(f.additions), String(f.deletions)])) : "no linked prs",
  };
};
