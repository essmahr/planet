import type { Command, CommandResult, Ctx } from "../lib/context.ts";
import { need, needString, optList, optString, parse } from "../lib/args.ts";
import { createEpic, listEpics, readEpic, resolveEpics, writeEpic } from "../lib/epic.ts";
import { listPhases } from "../lib/phase.ts";
import { commit } from "../lib/store.ts";
import { epicView } from "../lib/view.ts";

const MANUAL_STATUSES = ["paused", "abandoned", "active"] as const;
type ManualStatus = (typeof MANUAL_STATUSES)[number];

async function epicNew(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, {
    title: { type: "string" },
    repo: { type: "string" },
    linear: { type: "string", multiple: true },
  });
  const slug = need(positionals, 0, "epic slug");
  const epic = createEpic(ctx.home, { slug, title: needString(values, "title"), repo: needString(values, "repo"), linear: optList(values, "linear") }, ctx.now());
  commit(ctx.home, `${slug}: create epic`);
  return { json: epic, text: `created epic ${slug}` };
}

async function epicSet(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, {
    status: { type: "string" },
    title: { type: "string" },
    linear: { type: "string", multiple: true },
  });
  const slug = need(positionals, 0, "epic slug");
  const epic = readEpic(ctx.home, slug);
  const changes: string[] = [];
  const status = optString(values, "status");
  if (status !== undefined) {
    if (!(MANUAL_STATUSES as readonly string[]).includes(status)) throw new Error("--status must be paused, abandoned, or active");
    epic.status = status as ManualStatus;
    changes.push(`status ${status}`);
  }
  const title = optString(values, "title");
  if (title !== undefined) {
    epic.title = title;
    changes.push("title");
  }
  const linear = optList(values, "linear");
  if (linear.length) {
    epic.linear = linear;
    changes.push("linear");
  }
  if (changes.length === 0) throw new Error("nothing to set: pass --status, --title, or --linear");
  epic.updated = ctx.now();
  writeEpic(ctx.home, epic);
  commit(ctx.home, `${slug}: set ${changes.join(", ")}`);
  return { json: epic, text: `updated ${slug}: ${changes.join(", ")}` };
}

async function epicShow(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals } = parse(args, {});
  const view = epicView(ctx.home, need(positionals, 0, "epic slug"));
  const lines = [
    `${view.epic.slug}  ${view.epic.title}  [${view.epic.status}]  ${view.epic.repo}`,
    ...view.phases.map((p) => `  ${String(p.id).padStart(2, "0")} ${p.slug}  ${p.status}  prs=${p.prs.length}`),
    `  plan: ${view.paths.plan ?? "none"}`,
  ];
  return { json: view, text: lines.join("\n") };
}

async function epicResolve(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals } = parse(args, {});
  const text = need(positionals, 0, "text to resolve");
  const matches = resolveEpics(listEpics(ctx.home), text, (slug) => listPhases(ctx.home, slug).map((p) => p.meta));
  const candidates = matches.map((e) => e.slug);
  return {
    json: { query: text, candidates, epics: matches },
    text: candidates.length ? candidates.join("\n") : `no epic matches '${text}'`,
  };
}

export const epicCommand: Command = async (args, ctx) => {
  const [sub, ...rest] = args;
  switch (sub) {
    case "new": return epicNew(rest, ctx);
    case "set": return epicSet(rest, ctx);
    case "show": return epicShow(rest, ctx);
    case "resolve": return epicResolve(rest, ctx);
    default: throw new Error("usage: planet epic new|set|show|resolve");
  }
};
