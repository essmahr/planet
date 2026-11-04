import { appendFileSync } from "node:fs";
import type { Ctx } from "./context.ts";
import { listPhases } from "./phase.ts";
import { feedbackItems, readMarks, recordCheck } from "./pr-items.ts";
import { paths } from "./store.ts";

const FRESH_MS = 5 * 60 * 1000;
const GH_TIMEOUT_MS = 4000;

async function pendingCount(ctx: Ctx, epic: string, phase: number, urls: string[]): Promise<number> {
  const marks = readMarks(ctx.home, epic, phase);
  const age = marks.checked_at === null ? Infinity : Date.parse(ctx.now()) - Date.parse(marks.checked_at);
  if (age >= 0 && age < FRESH_MS) return marks.pending;
  const notified = new Set(marks.notified);
  let count = 0;
  for (const url of urls) {
    const feedback = await ctx.gh.prFeedback(url, { timeoutMs: GH_TIMEOUT_MS });
    count += feedbackItems(feedback).filter((item) => !notified.has(item.id)).length;
  }
  recordCheck(ctx.home, epic, phase, count, ctx.now());
  return count;
}

/** One line per phase whose open PRs have review items the user has not been told about, or null when there are none. */
export async function pendingNote(ctx: Ctx, epic: string): Promise<string | null> {
  const lines: string[] = [];
  for (const phase of listPhases(ctx.home, epic)) {
    const urls = phase.meta.prs.filter((pr) => pr.state === "open").map((pr) => pr.url);
    if (urls.length === 0) continue;
    try {
      const count = await pendingCount(ctx, epic, phase.meta.id, urls);
      if (count === 0) continue;
      lines.push(`Planet: phase ${phase.meta.id} PR has ${count} new review items. Mention this in one line; handle them only when the user asks (/planet:go ${epic} pr feedback ${phase.meta.id}).`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendFileSync(paths.hookLog(ctx.home), `${ctx.now()} pending note skipped phase ${phase.meta.id}: ${message.split("\n")[0]}\n`);
    }
  }
  return lines.length === 0 ? null : lines.join("\n");
}
