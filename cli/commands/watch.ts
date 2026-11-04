import type { Command, Ctx } from "../lib/context.ts";
import { need, needInt, optString, parse } from "../lib/args.ts";
import type { PrFeedback } from "../lib/gh.ts";
import { GhUnavailable } from "../lib/gh.ts";
import { readPhase } from "../lib/phase.ts";
import { feedbackItems, readMarks } from "../lib/pr-items.ts";

const MAX_FAILURES = 5;
const MAX_BACKOFF_SECONDS = 900;

type Event = "feedback" | "merged" | "closed" | "stopped";

function intOption(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`--${name} must be a non-negative integer`);
  return n;
}

function finish(epic: string, id: number, event: Event, lines: string[]) {
  const text = [...lines, `invoke planet:planet-pr-feedback epic: ${epic} phase: ${id} event: ${event}`].join("\n");
  return { json: { epic, phase: id, event, lines }, text };
}

async function pollAll(urls: string[], ctx: Ctx): Promise<PrFeedback[]> {
  const all: PrFeedback[] = [];
  for (const url of urls) all.push(await ctx.gh.prFeedback(url));
  return all;
}

export const watchCommand: Command = async (args, ctx) => {
  const { positionals, values } = parse(args, { interval: { type: "string" }, "max-polls": { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const interval = intOption(optString(values, "interval"), "interval", 60);
  const maxPolls = intOption(optString(values, "max-polls"), "max-polls", 0);
  const urls = readPhase(ctx.home, epic, id).meta.prs.map((pr) => pr.url);
  if (!urls.length) return finish(epic, id, "stopped", [`phase ${id}: no linked pr`]);

  let failures = 0;
  let delaySeconds = interval;
  for (let poll = 1; ; poll++) {
    try {
      const prs = await pollAll(urls, ctx);
      failures = 0;
      delaySeconds = interval;
      if (prs.every((f) => f.state !== "open")) {
        const merged = prs.some((f) => f.state === "merged");
        const event = merged ? "merged" : "closed";
        return finish(epic, id, event, [`phase ${id}: ${event}`]);
      }
      const notified = new Set(readMarks(ctx.home, epic, id).notified);
      const lines: string[] = [];
      for (const f of prs) {
        const fresh = feedbackItems(f).filter((item) => !notified.has(item.id));
        if (fresh.length) lines.push(`phase ${id}: ${fresh.length} new feedback items on ${f.url}`);
      }
      if (lines.length) return finish(epic, id, "feedback", lines);
    } catch (err) {
      if (!(err instanceof GhUnavailable)) throw err;
      failures++;
      if (failures >= MAX_FAILURES) return finish(epic, id, "stopped", [`phase ${id}: gh unavailable (${err.message})`]);
      delaySeconds = Math.min(interval * 2 ** (failures - 1), MAX_BACKOFF_SECONDS);
    }
    if (maxPolls && poll >= maxPolls) return finish(epic, id, "stopped", [`phase ${id}: max polls reached`]);
    await ctx.sleep(delaySeconds * 1000);
  }
};
