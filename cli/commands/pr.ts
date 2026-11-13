import type { Command, CommandResult, Ctx } from "../lib/context.ts";
import { need, needInt, optList, parse } from "../lib/args.ts";
import { readDrafts, worktreePath } from "../lib/drafts.ts";
import { readEpic } from "../lib/epic.ts";
import type { PrFeedback, PrFile, Reaction } from "../lib/gh.ts";
import { ownPrs } from "../lib/owner.ts";
import { phaseRepo, readPhase } from "../lib/phase.ts";
import { findCheckout } from "../lib/repos.ts";
import { sessionIdFrom } from "../lib/session.ts";
import type { Signal } from "../lib/signals.ts";
import { prSignals } from "../lib/signals.ts";
import type { PrRef, PrState } from "../schema/types.ts";
import { commit } from "../lib/store.ts";
import { renderTable } from "../lib/table.ts";

export async function phasePrFiles(ctx: Ctx, epic: string, id: number): Promise<{ source: "merged" | "all"; prs: string[]; files: PrFile[] }> {
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
  return { source, prs: urls, files: [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path)) };
}

async function prFeedback(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals } = parse(args, {});
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const phase = readPhase(ctx.home, epic, id);
  const prs: PrFeedback[] = [];
  for (const pr of phase.meta.prs) prs.push(await ctx.gh.prFeedback(pr.url));
  const lines: string[] = [];
  for (const f of prs) {
    lines.push(`${f.url} head ${f.head_sha}`);
    for (const r of f.reviews) lines.push(`  review ${r.author} ${r.state}${r.body ? `: ${r.body}` : ""}`);
    for (const c of f.comments) lines.push(`  ${c.resolved ? "resolved" : "open"} ${c.path}:${c.line ?? "-"} ${c.author}: ${c.body}`);
    for (const c of f.failed_checks) lines.push(`  check ${c.name} ${c.state} ${c.url}`);
  }
  return { json: { phase: id, prs }, text: prs.length ? lines.join("\n") : "no linked prs" };
}

async function prOwn(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals } = parse(args, {});
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const session = sessionIdFrom(ctx.env);
  const urls = ownPrs(ctx.home, epic, id, session);
  commit(ctx.home, `${epic}: phase ${id} feedback owned by session ${session}`);
  return { json: { phase: id, session, prs: urls }, text: `phase ${id}: feedback owned by this session` };
}

export interface PhasePrSignals {
  url: string;
  state: PrState;
  session: string | null;
  head_ref: string;
  head_sha: string;
  checkout: string | null;
  worktree: string | null;
  failed_checks: { name: string; url: string }[];
  signals: Signal[];
  orphans: string[];
}

/** The viewer's signals on each open PR of a phase, limited to the PRs `only` accepts. */
export async function phaseSignals(ctx: Ctx, epic: string, phase: number, only: (pr: PrRef) => boolean = () => true): Promise<PhasePrSignals[]> {
  const { meta } = readPhase(ctx.home, epic, phase);
  const checkout = findCheckout(ctx.home, phaseRepo(readEpic(ctx.home, epic), meta), process.cwd());
  const out: PhasePrSignals[] = [];
  for (const ref of meta.prs.filter(only)) {
    const f = await ctx.gh.prFeedback(ref.url);
    if (f.state !== "open") continue;
    const worktree = checkout ? worktreePath(checkout, epic, phase, ref.url) : null;
    const drafts = checkout && worktree ? readDrafts(ctx, checkout, worktree, f.head_ref) : { drafted: [], pushed: [] };
    out.push({
      url: ref.url,
      state: f.state,
      session: ref.session,
      head_ref: f.head_ref,
      head_sha: f.head_sha,
      checkout,
      worktree,
      failed_checks: f.failed_checks.map((c) => ({ name: c.name, url: c.url })),
      ...prSignals(f, drafts),
    });
  }
  return out;
}

function signalLine(s: Signal): string {
  const where = s.path ? `${s.path}:${s.line ?? "-"}` : s.kind;
  return `${s.signal} ${s.state} ${s.author} ${where} ${s.body.replace(/\s+/g, " ").slice(0, 60)}`;
}

async function prSignalsCommand(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals } = parse(args, {});
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const prs = await phaseSignals(ctx, epic, id);
  const lines = prs.flatMap((pr) => pr.signals.map(signalLine));
  return { json: { phase: id, prs }, text: lines.length ? lines.join("\n") : "no signals" };
}

const REACTIONS: Record<string, Reaction> = { thumbs_up: "THUMBS_UP", eyes: "EYES", rocket: "ROCKET" };

function reactionNamed(name: string): Reaction {
  const reaction = REACTIONS[name];
  if (!reaction) throw new Error(`unknown reaction '${name}': use ${Object.keys(REACTIONS).join(", ")}`);
  return reaction;
}

async function prReact(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { add: { type: "string", multiple: true }, remove: { type: "string", multiple: true } });
  const id = need(positionals, 0, "item id");
  const add = optList(values, "add").map(reactionNamed);
  const remove = optList(values, "remove").map(reactionNamed);
  if (!add.length && !remove.length) throw new Error("pass --add or --remove");
  for (const reaction of remove) await ctx.gh.react(id, reaction, false);
  for (const reaction of add) await ctx.gh.react(id, reaction, true);
  return { json: { id, added: add, removed: remove }, text: "reactions updated" };
}

export const prCommand: Command = async (args, ctx) => {
  const [sub, ...rest] = args;
  if (sub === "feedback") return prFeedback(rest, ctx);
  if (sub === "own") return prOwn(rest, ctx);
  if (sub === "signals") return prSignalsCommand(rest, ctx);
  if (sub === "react") return prReact(rest, ctx);
  if (sub !== "files") throw new Error("usage: planet pr files|feedback|own|signals <epic> <phase> | pr react <item-id>");
  const { positionals } = parse(rest, {});
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const result = await phasePrFiles(ctx, epic, id);
  return {
    json: { phase: id, ...result },
    text: result.files.length ? renderTable(["PATH", "+", "-"], result.files.map((f) => [f.path, String(f.additions), String(f.deletions)])) : "no linked prs",
  };
};
