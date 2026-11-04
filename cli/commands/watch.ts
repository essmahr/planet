import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Command, CommandResult, Ctx } from "../lib/context.ts";
import { need, needInt, optString, parse } from "../lib/args.ts";
import type { PrFeedback } from "../lib/gh.ts";
import { GhUnavailable } from "../lib/gh.ts";
import { readPhase } from "../lib/phase.ts";
import { feedbackItems, readMarks } from "../lib/pr-items.ts";
import { paths } from "../lib/store.ts";

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

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).split("\n")[0];
}

function storeStop(epic: string, id: number, err: unknown) {
  return finish(epic, id, "stopped", [`phase ${id}: store error (${errorMessage(err)})`]);
}

function ghReason(err: unknown): string {
  if (err instanceof GhUnavailable) return `gh unavailable (${errorMessage(err)})`;
  return `gh failed (${errorMessage(err)})`;
}

function runningWatcher(file: string, ctx: Ctx): number | null {
  if (!existsSync(file)) return null;
  const pid = Number(readFileSync(file, "utf8").trim());
  if (!Number.isInteger(pid) || pid <= 0 || pid === ctx.pid) return null;
  return ctx.isAlive(pid) ? pid : null;
}

function release(file: string, ctx: Ctx): void {
  if (existsSync(file) && readFileSync(file, "utf8").trim() === String(ctx.pid)) rmSync(file);
}

export const watchCommand: Command = async (args, ctx) => {
  const { positionals, values } = parse(args, { interval: { type: "string" }, "max-polls": { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const interval = intOption(optString(values, "interval"), "interval", 60);
  const maxPolls = intOption(optString(values, "max-polls"), "max-polls", 0);
  const pidFile = paths.watchPid(ctx.home, epic, id);
  const running = runningWatcher(pidFile, ctx);
  if (running !== null) return { json: { epic, phase: id, event: null, running }, text: `phase ${id}: watcher already running (pid ${running})` };
  mkdirSync(dirname(pidFile), { recursive: true });
  writeFileSync(pidFile, `${ctx.pid}\n`);
  try {
    return await poll(epic, id, interval, maxPolls, ctx);
  } finally {
    release(pidFile, ctx);
  }
};

async function poll(epic: string, id: number, interval: number, maxPolls: number, ctx: Ctx): Promise<CommandResult> {
  let urls: string[];
  try {
    urls = readPhase(ctx.home, epic, id).meta.prs.map((pr) => pr.url);
  } catch (err) {
    return storeStop(epic, id, err);
  }
  if (!urls.length) return finish(epic, id, "stopped", [`phase ${id}: no linked pr`]);

  let failures = 0;
  let delaySeconds = interval;
  for (let poll = 1; ; poll++) {
    let prs: PrFeedback[] | null = null;
    try {
      prs = await pollAll(urls, ctx);
    } catch (err) {
      failures++;
      if (failures >= MAX_FAILURES) return finish(epic, id, "stopped", [`phase ${id}: ${ghReason(err)}`]);
      delaySeconds = Math.min(interval * 2 ** (failures - 1), MAX_BACKOFF_SECONDS);
    }
    if (prs) {
      failures = 0;
      delaySeconds = interval;
      if (prs.every((f) => f.state !== "open")) {
        const merged = prs.some((f) => f.state === "merged");
        const event = merged ? "merged" : "closed";
        return finish(epic, id, event, [`phase ${id}: ${event}`]);
      }
      let notified: Set<string>;
      try {
        notified = new Set(readMarks(ctx.home, epic, id).notified);
      } catch (err) {
        return storeStop(epic, id, err);
      }
      const lines: string[] = [];
      for (const f of prs) {
        const fresh = feedbackItems(f).filter((item) => !notified.has(item.id));
        if (fresh.length) lines.push(`phase ${id}: ${fresh.length} new feedback items on ${f.url}`);
      }
      if (lines.length) return finish(epic, id, "feedback", lines);
    }
    if (maxPolls && poll >= maxPolls) return finish(epic, id, "stopped", [`phase ${id}: max polls reached`]);
    await ctx.sleep(delaySeconds * 1000);
  }
}
