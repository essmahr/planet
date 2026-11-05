import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Command, CommandResult, Ctx } from "../lib/context.ts";
import { need, needInt, optString, parse } from "../lib/args.ts";
import type { PrFeedback } from "../lib/gh.ts";
import { GhUnavailable } from "../lib/gh.ts";
import { readPhase } from "../lib/phase.ts";
import { claimOwner, feedbackItems, liveOwner, readMarks } from "../lib/pr-items.ts";
import { commit, paths } from "../lib/store.ts";

const MAX_FAILURES = 5;
const MAX_BACKOFF_SECONDS = 900;

type Event = "feedback" | "merged" | "closed" | "stopped";

function intOption(value: string | undefined, name: string, fallback: number, min: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw new Error(`--${name} must be an integer of at least ${min}`);
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

interface PidLine {
  pid: number;
  session: string | null;
}

function readPidLine(file: string): PidLine | null {
  if (!existsSync(file)) return null;
  const [pidText, session] = readFileSync(file, "utf8").trim().split(/\s+/);
  const pid = Number(pidText);
  if (!Number.isInteger(pid) || pid <= 0) return null;
  return { pid, session: session ?? null };
}

function runningWatcher(file: string, ctx: Ctx): PidLine | null {
  const line = readPidLine(file);
  if (!line || line.pid === ctx.pid) return null;
  return ctx.isAlive(line.pid) ? line : null;
}

function release(file: string, ctx: Ctx): void {
  if (readPidLine(file)?.pid === ctx.pid) rmSync(file);
}

/** An exit that wakes the session without naming the skill, so it does nothing there. */
function quiet(epic: string, id: number, text: string, extra: Record<string, unknown> = {}): CommandResult {
  return { json: { epic, phase: id, event: null, ...extra }, text };
}

/**
 * Exits for a watcher that no longer belongs to its session, or null to keep polling.
 *
 * A take by another session hands the pid file to that session's watcher, or moves the owner before its watcher starts.
 */
function lostWatch(epic: string, id: number, pidFile: string, session: string | null, ctx: Ctx): CommandResult | null {
  const line = readPidLine(pidFile);
  if (line && line.pid !== ctx.pid) return quiet(epic, id, `phase ${id}: watcher handed to session ${line.session ?? "unknown"}`, { handed_to: line.session });
  if (!session) return null;
  const owner = liveOwner(ctx.home, readMarks(ctx.home, epic, id));
  if (owner && owner.session !== session) return quiet(epic, id, `phase ${id}: owned by session ${owner.session}`, { owner: owner.session });
  return null;
}

export const watchCommand: Command = async (args, ctx) => {
  const { positionals, values } = parse(args, { interval: { type: "string" }, "max-polls": { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const interval = intOption(optString(values, "interval"), "interval", 60, 1);
  const maxPolls = intOption(optString(values, "max-polls"), "max-polls", 0, 0);
  const session = ctx.env.CLAUDE_CODE_SESSION_ID ?? null;
  const pidFile = paths.watchPid(ctx.home, epic, id);
  if (session) {
    let claimed;
    try {
      readPhase(ctx.home, epic, id);
      claimed = claimOwner(ctx.home, epic, id, session, ctx.now());
    } catch (err) {
      return storeStop(epic, id, err);
    }
    if (!claimed.ok) return quiet(epic, id, `phase ${id}: owned by session ${claimed.owner.session}`, { owner: claimed.owner.session });
    commit(ctx.home, `${epic}: phase ${id} feedback owned by session ${session}`);
  }
  const running = runningWatcher(pidFile, ctx);
  if (running !== null && (!session || running.session === session)) return quiet(epic, id, `phase ${id}: watcher already running (pid ${running.pid})`, { running: running.pid });
  mkdirSync(dirname(pidFile), { recursive: true });
  writeFileSync(pidFile, session ? `${ctx.pid} ${session}\n` : `${ctx.pid}\n`);
  try {
    return await poll(epic, id, interval, maxPolls, pidFile, session, ctx);
  } finally {
    release(pidFile, ctx);
  }
};

async function poll(epic: string, id: number, interval: number, maxPolls: number, pidFile: string, session: string | null, ctx: Ctx): Promise<CommandResult> {
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
    try {
      const lost = lostWatch(epic, id, pidFile, session, ctx);
      if (lost) return lost;
    } catch (err) {
      return storeStop(epic, id, err);
    }
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
      for (const f of prs.filter((pr) => pr.state === "open")) {
        const fresh = feedbackItems(f).filter((item) => !notified.has(item.id));
        if (fresh.length) lines.push(`phase ${id}: ${fresh.length} new feedback items on ${f.url}`);
      }
      if (lines.length) return finish(epic, id, "feedback", lines);
    }
    if (maxPolls && poll >= maxPolls) return finish(epic, id, "stopped", [`phase ${id}: max polls reached`]);
    await ctx.sleep(delaySeconds * 1000);
  }
}
