import type { Command } from "../lib/context.ts";
import { flag, parse } from "../lib/args.ts";
import { commitSync, syncAll, syncEpic } from "../lib/sync.ts";
import type { SyncResult } from "../lib/sync.ts";

export function describeSync(results: SyncResult[]): string {
  return results
    .map((r) => {
      if (r.stale) return `${r.epic}: gh unavailable, state is stale`;
      if (r.skipped) return `${r.epic}: skipped`;
      if (r.changes.length === 0) return `${r.epic}: no changes`;
      return [`${r.epic}:`, ...r.changes.map((c) => `  ${c}`)].join("\n");
    })
    .join("\n");
}

export const syncCommand: Command = async (args, ctx) => {
  const { positionals, values } = parse(args, { force: { type: "boolean" } });
  const opts = { force: flag(values, "force") };
  const results = positionals[0]
    ? [await syncEpic(ctx.home, positionals[0], ctx.gh, ctx.now(), opts)]
    : await syncAll(ctx.home, ctx.gh, ctx.now(), opts);
  commitSync(ctx.home, results);
  return { json: results, text: describeSync(results) };
};
