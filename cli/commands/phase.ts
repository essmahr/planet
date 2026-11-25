import { readFileSync } from "node:fs";
import type { Command, CommandResult, Ctx } from "../lib/context.ts";
import { flag, need, needInt, needString, optList, optString, parse } from "../lib/args.ts";
import { readEpic } from "../lib/epic.ts";
import { EVENT_KINDS, appendEvent } from "../lib/events.ts";
import type { EventKind } from "../lib/events.ts";
import { isLegacy, readyLists } from "../lib/graph.ts";
import { touchEpic } from "../lib/lifecycle.ts";
import { dropPhase, listPhases, movePhase, newPhases, phaseRepo, readPhase, setBlockers, setPhaseLinear, setPhaseRepo, setPhaseStatus, writeBody } from "../lib/phase.ts";
import type { NewPhaseInput } from "../lib/phase.ts";
import { optProposal, resolveProposalId } from "../lib/proposal.ts";
import { sessionIdFrom } from "../lib/session.ts";
import { commit } from "../lib/store.ts";

function parseId(text: string, what: string): number {
  const id = Number(text);
  if (!Number.isInteger(id) || id < 1) throw new Error(`${what} must be a positive integer, got '${text}'`);
  return id;
}

function parseIds(text: string | undefined, what: string): number[] {
  if (text === undefined) return [];
  return text.split(",").map((t) => parseId(t.trim(), what));
}

async function phaseNew(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, {
    title: { type: "string" },
    linear: { type: "string", multiple: true },
    phase: { type: "string", multiple: true },
    manual: { type: "boolean" },
    repo: { type: "string" },
    milestone: { type: "string" },
    "blocked-by": { type: "string" },
    blocks: { type: "string" },
    proposal: { type: "string" },
  });
  const epic = need(positionals, 0, "epic slug");
  const milestoneText = optString(values, "milestone");
  const milestone = milestoneText === undefined ? null : parseId(milestoneText, "--milestone");
  const blockedBy = parseIds(optString(values, "blocked-by"), "--blocked-by");
  const blocks = parseIds(optString(values, "blocks"), "--blocks");
  const inputs: NewPhaseInput[] = [];
  const slug = positionals[1];
  const manual = flag(values, "manual");
  const repo = optString(values, "repo") ?? null;
  if (manual && optList(values, "phase").length > 0) throw new Error("--manual applies to the single form only");
  if (slug !== undefined) inputs.push({ slug, title: needString(values, "title"), linear: optList(values, "linear"), kind: manual ? "manual" : "pr", repo, milestone, blockedBy, blocks });
  for (const pair of optList(values, "phase")) {
    const colon = pair.indexOf(":");
    if (colon <= 0 || colon === pair.length - 1) throw new Error(`--phase must be slug:title, got '${pair}'`);
    inputs.push({ slug: pair.slice(0, colon), title: pair.slice(colon + 1), repo, milestone, blockedBy, blocks });
  }
  if (inputs.length === 0) throw new Error("pass <slug> --title or --phase slug:title");
  readEpic(ctx.home, epic);
  const proposal = blocks.length === 0 ? undefined : optProposal(ctx, epic, values);
  const created = newPhases(ctx.home, epic, inputs, proposal);
  touchEpic(ctx.home, epic, ctx.now());
  commit(ctx.home, `${epic}: add phase${created.length > 1 ? "s" : ""} ${created.map((p) => p.meta.slug).join(", ")}`);
  return { json: created.map((p) => p.meta), text: created.map((p) => `created phase ${p.meta.id} ${p.meta.slug}`).join("\n") };
}

async function phaseWrite(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { "body-file": { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const body = readFileSync(needString(values, "body-file"), "utf8");
  const phase = writeBody(ctx.home, epic, id, body);
  commit(ctx.home, `${epic}: write phase ${id} body`);
  return { json: phase.meta, text: `wrote ${phase.path}` };
}

async function phaseSet(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { status: { type: "string" }, linear: { type: "string", multiple: true }, repo: { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const status = optString(values, "status");
  const linear = optList(values, "linear");
  const repo = optString(values, "repo");
  if (status === undefined && linear.length === 0 && repo === undefined) throw new Error("nothing to set: pass --status, --linear, or --repo");
  const changes: string[] = [];
  if (status !== undefined) {
    if (status !== "planned" && status !== "reviewed" && status !== "shipped") throw new Error("--status must be planned, reviewed, or shipped");
    setPhaseStatus(ctx.home, epic, id, status, ctx.now());
    changes.push(`status ${status}`);
  }
  if (linear.length) {
    setPhaseLinear(ctx.home, epic, id, linear);
    changes.push("linear");
  }
  if (repo !== undefined) {
    setPhaseRepo(ctx.home, epic, id, repo);
    changes.push(`repo ${repo}`);
  }
  touchEpic(ctx.home, epic, ctx.now());
  commit(ctx.home, `${epic}: set phase ${id} ${changes.join(", ")}`);
  const phase = listPhases(ctx.home, epic).find((p) => p.meta.id === id);
  return { json: phase?.meta ?? null, text: `updated phase ${id}: ${changes.join(", ")}` };
}

async function phaseDrop(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { proposal: { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const proposal = optProposal(ctx, epic, values);
  const dropped = dropPhase(ctx.home, epic, id, proposal);
  touchEpic(ctx.home, epic, ctx.now());
  commit(ctx.home, `${epic}: drop phase ${id}`);
  return { json: dropped.meta, text: `dropped phase ${id} ${dropped.meta.slug}` };
}

async function phaseBlock(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { by: { type: "string" }, remove: { type: "boolean" }, proposal: { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const by = parseIds(needString(values, "by"), "--by");
  const remove = flag(values, "remove");
  const proposal = resolveProposalId(ctx.home, epic, needString(values, "proposal"));
  const phase = setBlockers(ctx.home, epic, id, by, remove, proposal);
  touchEpic(ctx.home, epic, ctx.now());
  const message = `${remove ? "unblock" : "block"} phase ${id} by ${by.join(", ")}`;
  commit(ctx.home, `${epic}: ${message}`);
  return { json: phase.meta, text: message };
}

async function phaseMove(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { milestone: { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const target = needString(values, "milestone");
  const milestone = target === "none" ? null : parseId(target, "--milestone");
  const phase = movePhase(ctx.home, epic, id, milestone);
  touchEpic(ctx.home, epic, ctx.now());
  const label = milestone === null ? "no milestone" : `milestone ${milestone}`;
  commit(ctx.home, `${epic}: move phase ${id} to ${label}`);
  return { json: phase.meta, text: `moved phase ${id} to ${label}` };
}

async function phaseReady(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { repo: { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const epicDoc = readEpic(ctx.home, epic);
  const repo = optString(values, "repo");
  const phases = listPhases(ctx.home, epic).map((p) => p.meta);
  const lists = readyLists(phases, isLegacy(ctx.home, epic));
  const pick = (ids: number[]) => phases.filter((p) => ids.includes(p.id) && (repo === undefined || phaseRepo(epicDoc, p) === repo)).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const plannable = pick(lists.plannable);
  const ready = pick(lists.ready);
  const line = (p: { id: number; slug: string }) => `  ${p.id} ${p.slug}`;
  const text = ["plannable:", ...plannable.map(line), "ready:", ...ready.map(line)].join("\n");
  return { json: { plannable, ready }, text };
}

async function phaseEvent(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { sha: { type: "string" }, session: { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const kind = need(positionals, 2, "event kind");
  if (!(EVENT_KINDS as readonly string[]).includes(kind)) throw new Error(`kind must be one of ${EVENT_KINDS.join(", ")}`);
  readPhase(ctx.home, epic, id);
  const session = sessionIdFrom(ctx.env, optString(values, "session"));
  const event = appendEvent(ctx.home, epic, { phase: id, kind: kind as EventKind, text: positionals[3] ?? null, sha: optString(values, "sha") ?? null, session }, ctx.now());
  commit(ctx.home, `${epic}: phase ${id} ${kind}`);
  return { json: event, text: `phase ${id} ${kind}` };
}

export const phaseCommand: Command = async (args, ctx) => {
  const [sub, ...rest] = args;
  switch (sub) {
    case "new": return phaseNew(rest, ctx);
    case "write": return phaseWrite(rest, ctx);
    case "set": return phaseSet(rest, ctx);
    case "drop": return phaseDrop(rest, ctx);
    case "block": return phaseBlock(rest, ctx);
    case "move": return phaseMove(rest, ctx);
    case "ready": return phaseReady(rest, ctx);
    case "event": return phaseEvent(rest, ctx);
    default: throw new Error("usage: planet phase new|write|set|block|move|drop|ready|event");
  }
};
