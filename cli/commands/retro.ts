import { existsSync, readFileSync } from "node:fs";
import type { Command, CommandResult, Ctx } from "../lib/context.ts";
import { need, needInt, needString, optString, parse } from "../lib/args.ts";
import { appendEvent, listEvents } from "../lib/events.ts";
import type { PrFeedback, PrFile } from "../lib/gh.ts";
import { GhUnavailable } from "../lib/gh.ts";
import { readPhase } from "../lib/phase.ts";
import { writeRetro } from "../lib/retro.ts";
import { sessionIdFrom } from "../lib/session.ts";
import { commit, paths } from "../lib/store.ts";
import type { PhaseMeta } from "../schema/types.ts";
import { phasePrFiles } from "./pr.ts";

export interface RetroInputs {
  phase: PhaseMeta;
  phase_path: string;
  plan_path: string;
  events: ReturnType<typeof listEvents>;
  implemented_sha: string | null;
  implemented_at: string | null;
  prs: PrFeedback[];
  files: { source: "merged" | "all"; prs: string[]; files: PrFile[] };
  gh_unavailable: boolean;
  prompts: { ts: string; text: string }[];
}

type GhPart = Pick<RetroInputs, "prs" | "files" | "gh_unavailable">;

/** PR feedback and changed files for the phase, or empty ones when `gh` cannot answer. */
async function ghPart(ctx: Ctx, epic: string, id: number, urls: string[]): Promise<GhPart> {
  try {
    const prs: PrFeedback[] = [];
    for (const url of urls) prs.push(await ctx.gh.prFeedback(url));
    return { prs, files: await phasePrFiles(ctx, epic, id), gh_unavailable: false };
  } catch (err) {
    if (!(err instanceof GhUnavailable)) throw err;
    return { prs: [], files: { source: "all", prs: [], files: [] }, gh_unavailable: true };
  }
}

export async function retroInputs(ctx: Ctx, epic: string, id: number): Promise<RetroInputs> {
  const phase = readPhase(ctx.home, epic, id);
  const events = listEvents(ctx.home, epic, id);
  const implemented = [...events].reverse().find((e) => e.kind === "implemented") ?? null;
  const gh = await ghPart(ctx, epic, id, phase.meta.prs.map((pr) => pr.url));
  const promptsFile = paths.prompts(ctx.home, epic);
  const prompts = existsSync(promptsFile)
    ? readFileSync(promptsFile, "utf8")
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((l) => JSON.parse(l) as { ts: string; phase: number | null; text: string })
        .filter((p) => p.phase === id && (implemented === null || p.ts > implemented.ts))
        .map((p) => ({ ts: p.ts, text: p.text }))
    : [];
  return {
    phase: phase.meta,
    phase_path: phase.path,
    plan_path: paths.plan(ctx.home, epic),
    events,
    implemented_sha: implemented?.sha ?? null,
    implemented_at: implemented?.ts ?? null,
    ...gh,
    prompts,
  };
}

async function inputs(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals } = parse(args, {});
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const bundle = await retroInputs(ctx, epic, id);
  const text = [
    `phase ${id} ${bundle.phase.slug} ${bundle.phase.status} ${bundle.phase.kind}`,
    `implemented ${bundle.implemented_sha ?? "none"}${bundle.implemented_at ? ` at ${bundle.implemented_at}` : ""}`,
    `events ${bundle.events.length}, prs ${bundle.prs.length}, files ${bundle.files.files.length}, prompts after implemented ${bundle.prompts.length}`,
  ].join("\n");
  return { json: bundle, text };
}

async function write(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { file: { type: "string" }, head: { type: "string" }, session: { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const draft = readFileSync(needString(values, "file"), "utf8");
  const retro = writeRetro(ctx.home, epic, id, draft, ctx.now(), optString(values, "head") ?? null);
  const session = sessionIdFrom(ctx.env, optString(values, "session"));
  appendEvent(ctx.home, epic, { phase: id, kind: "reviewed", text: retro.path, session }, ctx.now());
  commit(ctx.home, `${epic}: retro phase ${id}`);
  return { json: { path: retro.path, meta: retro.meta }, text: `wrote ${retro.path}` };
}

export const retroCommand: Command = async (args, ctx) => {
  const [sub, ...rest] = args;
  if (sub === "inputs") return inputs(rest, ctx);
  if (sub === "write") return write(rest, ctx);
  throw new Error("usage: planet retro inputs <epic> <phase> | planet retro write <epic> <phase> --file <path> [--head <sha>]");
};
