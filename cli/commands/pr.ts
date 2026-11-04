import type { Command, CommandResult, Ctx } from "../lib/context.ts";
import { need, needInt, parse } from "../lib/args.ts";
import type { PrFeedback, PrFile } from "../lib/gh.ts";
import { readPhase } from "../lib/phase.ts";
import { addMarks, feedbackItems, readMarks } from "../lib/pr-items.ts";
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

function markFeedback(positionals: string[], ctx: Ctx): CommandResult {
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const mark = need(positionals, 2, "notified|handled");
  if (mark !== "notified" && mark !== "handled") throw new Error("mark must be notified or handled");
  const ids = positionals.slice(3);
  if (!ids.length) throw new Error("missing item ids");
  readPhase(ctx.home, epic, id);
  const marks = addMarks(ctx.home, epic, id, mark, ids);
  commit(ctx.home, `${epic}: mark ${ids.length} feedback items ${mark}`);
  return { json: { phase: id, ...marks }, text: `marked ${ids.length} ${mark}` };
}

async function newFeedback(epic: string, id: number, ctx: Ctx): Promise<CommandResult> {
  const phase = readPhase(ctx.home, epic, id);
  const marks = readMarks(ctx.home, epic, id);
  const prs = [];
  const items = [];
  for (const pr of phase.meta.prs) {
    const f = await ctx.gh.prFeedback(pr.url);
    prs.push({ url: f.url, state: f.state, head_ref: f.head_ref, head_sha: f.head_sha });
    for (const item of feedbackItems(f)) {
      if (marks.handled.includes(item.id)) continue;
      items.push({ ...item, notified: marks.notified.includes(item.id) });
    }
  }
  const lines = items.map((i) => {
    const where = i.path ? `${i.path}:${i.line ?? "-"}` : i.kind;
    return `${i.id} ${i.notified ? "shown" : "new"} ${i.author} ${where} ${i.body.replace(/\s+/g, " ").slice(0, 80)}`;
  });
  return { json: { phase: id, prs, items }, text: lines.length ? lines.join("\n") : "no new feedback" };
}

async function prFeedback(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { new: { type: "boolean" } });
  if (positionals[0] === "mark") return markFeedback(positionals.slice(1), ctx);
  if (values.new) return newFeedback(need(positionals, 0, "epic slug"), needInt(positionals, 1, "phase id"), ctx);
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

export const prCommand: Command = async (args, ctx) => {
  const [sub, ...rest] = args;
  if (sub === "feedback") return prFeedback(rest, ctx);
  if (sub !== "files") throw new Error("usage: planet pr files|feedback <epic> <phase> [--new] | pr feedback mark <epic> <phase> notified|handled <id>...");
  const { positionals } = parse(rest, {});
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const result = await phasePrFiles(ctx, epic, id);
  return {
    json: { phase: id, ...result },
    text: result.files.length ? renderTable(["PATH", "+", "-"], result.files.map((f) => [f.path, String(f.additions), String(f.deletions)])) : "no linked prs",
  };
};
