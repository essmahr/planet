import { appendFileSync } from "node:fs";
import type { Ctx } from "./context.ts";
import { listPhases } from "./phase.ts";
import { feedbackItems, liveOwner, readMarks, recordCheck } from "./pr-items.ts";
import { paths } from "./store.ts";

const FRESH_MS = 5 * 60 * 1000;
const GH_TIMEOUT_MS = 4000;

async function pendingCount(ctx: Ctx, epic: string, phase: number, urls: string[], session: string): Promise<number> {
  const marks = readMarks(ctx.home, epic, phase);
  const owner = liveOwner(ctx.home, marks);
  if (owner && owner.session !== session) return 0;
  const age = marks.checked_at === null ? Infinity : Date.parse(ctx.now()) - Date.parse(marks.checked_at);
  if (age >= 0 && age < FRESH_MS) return marks.pending;
  const notified = new Set(marks.notified);
  try {
    const feedback = await Promise.all(urls.map((url) => ctx.gh.prFeedback(url, { timeoutMs: GH_TIMEOUT_MS })));
    const count = feedback.flatMap(feedbackItems).filter((item) => !notified.has(item.id)).length;
    recordCheck(ctx.home, epic, phase, count, ctx.now());
    return count;
  } catch (err) {
    recordCheck(ctx.home, epic, phase, marks.pending, ctx.now());
    throw err;
  }
}

function logSkip(ctx: Ctx, what: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  appendFileSync(paths.hookLog(ctx.home), `${ctx.now()} pending note skipped ${what}: ${message.split("\n")[0]}\n`);
}

/**
 * One line per phase whose open PRs have review items the user has not been told about, or null when there are none.
 *
 * A phase another live session owns is skipped: that session's watcher brings its feedback.
 *
 * Phases are checked concurrently so the whole check stays near one gh timeout, well inside the hook's own limit.
 * A failed check still records its time, so the next prompts within five minutes skip gh instead of re-paying the timeout.
 */
export async function pendingNote(ctx: Ctx, epic: string, session: string): Promise<string | null> {
  try {
    const phases = listPhases(ctx.home, epic).filter((p) => p.meta.prs.some((pr) => pr.state === "open"));
    const counts = await Promise.allSettled(
      phases.map((p) => pendingCount(ctx, epic, p.meta.id, p.meta.prs.filter((pr) => pr.state === "open").map((pr) => pr.url), session)),
    );
    const lines: string[] = [];
    counts.forEach((result, i) => {
      const id = phases[i].meta.id;
      if (result.status === "rejected") return logSkip(ctx, `phase ${id}`, result.reason);
      if (result.value === 0) return;
      lines.push(`Planet: phase ${id} PR has ${result.value} new review items. Mention this in one line; handle them only when the user asks (/planet:go ${epic} pr feedback ${id}).`);
    });
    return lines.length === 0 ? null : lines.join("\n");
  } catch (err) {
    logSkip(ctx, epic, err);
    return null;
  }
}
