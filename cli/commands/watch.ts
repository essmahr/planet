import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Command, CommandResult, Ctx } from "../lib/context.ts";
import { need, needInt, optString, parse } from "../lib/args.ts";
import type { PrFeedback } from "../lib/gh.ts";
import { readPhase } from "../lib/phase.ts";
import { openKeys } from "../lib/signals.ts";
import type { PrRef } from "../schema/types.ts";
import { phaseCheckout, prSignalsFor } from "./pr.ts";
import { paths } from "../lib/store.ts";

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

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).split("\n")[0];
}

function storeStop(epic: string, id: number, err: unknown) {
  return finish(epic, id, "stopped", [`phase ${id}: store error (${errorMessage(err)})`]);
}

export interface PidLine {
  pid: number;
  session: string | null;
}

export function readPidLine(file: string): PidLine | null {
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

export const watchCommand: Command = async (args, ctx) => {
  const { positionals, values } = parse(args, { interval: { type: "string" }, "max-polls": { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const interval = intOption(optString(values, "interval"), "interval", 60, 1);
  const maxPolls = intOption(optString(values, "max-polls"), "max-polls", 0, 0);
  const session = ctx.env.CLAUDE_CODE_SESSION_ID ?? null;
  let refs: PrRef[];
  let checkout: string | null;
  try {
    const { meta } = readPhase(ctx.home, epic, id);
    if (!meta.prs.length) return finish(epic, id, "stopped", [`phase ${id}: no linked pr`]);
    refs = session ? meta.prs.filter((pr) => pr.session === session) : meta.prs;
    checkout = phaseCheckout(ctx, epic, meta);
  } catch (err) {
    return storeStop(epic, id, err);
  }
  if (!refs.length) return quiet(epic, id, `phase ${id}: no PR owned by this session`);
  const pidFile = paths.watchPid(ctx.home, epic, id, session);
  const running = runningWatcher(pidFile, ctx);
  if (running !== null && (!session || running.session === session)) return quiet(epic, id, `phase ${id}: watcher already running (pid ${running.pid})`, { running: running.pid });
  mkdirSync(dirname(pidFile), { recursive: true });
  writeFileSync(pidFile, session ? `${ctx.pid} ${session}\n` : `${ctx.pid}\n`);
  try {
    return await poll(epic, id, refs, checkout, interval, maxPolls, ctx);
  } finally {
    release(pidFile, ctx);
  }
};

/** Every watched PR's feedback, or null when gh fails. */
async function fetchAll(refs: PrRef[], ctx: Ctx): Promise<[PrRef, PrFeedback][] | null> {
  try {
    const fetched: [PrRef, PrFeedback][] = [];
    for (const ref of refs) fetched.push([ref, await ctx.gh.prFeedback(ref.url)]);
    return fetched;
  } catch {
    return null;
  }
}

async function poll(epic: string, id: number, refs: PrRef[], checkout: string | null, interval: number, maxPolls: number, ctx: Ctx): Promise<CommandResult> {
  let failures = 0;
  let delaySeconds = interval;
  let previous: string | null = null;
  for (let poll = 1; ; poll++) {
    const fetched = await fetchAll(refs, ctx);
    if (!fetched) {
      failures++;
      previous = null;
      delaySeconds = Math.min(interval * 2 ** (failures - 1), MAX_BACKOFF_SECONDS);
    }
    if (fetched) {
      failures = 0;
      delaySeconds = interval;
      const open = fetched.filter(([, f]) => f.state === "open");
      if (!open.length) {
        const event = fetched.some(([, f]) => f.state === "merged") ? "merged" : "closed";
        return finish(epic, id, event, [`phase ${id}: ${event}`]);
      }
      let perPr: { url: string; keys: string[] }[];
      try {
        perPr = open.map(([ref, f]) => ({ url: ref.url, keys: openKeys(prSignalsFor(ctx, epic, id, checkout, ref, f)) }));
      } catch (err) {
        return finish(epic, id, "stopped", [`phase ${id}: signal error (${errorMessage(err)})`]);
      }
      const current = perPr.flatMap((p) => p.keys).sort().join("\n");
      if (current && current === previous) {
        const lines = perPr.filter((p) => p.keys.length).map((p) => `phase ${id}: ${p.keys.length} open signals on ${p.url}`);
        return finish(epic, id, "feedback", lines);
      }
      previous = current;
    }
    if (maxPolls && poll >= maxPolls) return finish(epic, id, "stopped", [`phase ${id}: max polls reached`]);
    await ctx.sleep(delaySeconds * 1000);
  }
}
