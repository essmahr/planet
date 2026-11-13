import type { Command, CommandResult, Ctx } from "../lib/context.ts";
import { need, needInt, parse } from "../lib/args.ts";
import type { PrFeedback, PrFile } from "../lib/gh.ts";
import { ownPrs } from "../lib/owner.ts";
import { readPhase } from "../lib/phase.ts";
import { sessionIdFrom } from "../lib/session.ts";
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

export const prCommand: Command = async (args, ctx) => {
  const [sub, ...rest] = args;
  if (sub === "feedback") return prFeedback(rest, ctx);
  if (sub === "own") return prOwn(rest, ctx);
  if (sub !== "files") throw new Error("usage: planet pr files|feedback|own <epic> <phase>");
  const { positionals } = parse(rest, {});
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const result = await phasePrFiles(ctx, epic, id);
  return {
    json: { phase: id, ...result },
    text: result.files.length ? renderTable(["PATH", "+", "-"], result.files.map((f) => [f.path, String(f.additions), String(f.deletions)])) : "no linked prs",
  };
};
