import { readFileSync } from "node:fs";
import type { Command, CommandResult, Ctx } from "../lib/context.ts";
import { flag, need, needInt, needString, optList, optString, parse } from "../lib/args.ts";
import { readEpic, writeEpic } from "../lib/epic.ts";
import { EVENT_KINDS, appendEvent } from "../lib/events.ts";
import type { EventKind } from "../lib/events.ts";
import { recomputeEpicStatus } from "../lib/lifecycle.ts";
import { dropPhase, listPhases, newPhases, readPhase, setPhaseLinear, setPhaseStatus, writeBody } from "../lib/phase.ts";
import type { NewPhaseInput } from "../lib/phase.ts";
import { sessionIdFrom } from "../lib/session.ts";
import { commit } from "../lib/store.ts";

async function phaseNew(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, {
    title: { type: "string" },
    linear: { type: "string", multiple: true },
    phase: { type: "string", multiple: true },
    manual: { type: "boolean" },
  });
  const epic = need(positionals, 0, "epic slug");
  const inputs: NewPhaseInput[] = [];
  const slug = positionals[1];
  const manual = flag(values, "manual");
  if (manual && optList(values, "phase").length > 0) throw new Error("--manual applies to the single form only");
  if (slug !== undefined) inputs.push({ slug, title: needString(values, "title"), linear: optList(values, "linear"), kind: manual ? "manual" : "pr" });
  for (const pair of optList(values, "phase")) {
    const colon = pair.indexOf(":");
    if (colon <= 0 || colon === pair.length - 1) throw new Error(`--phase must be slug:title, got '${pair}'`);
    inputs.push({ slug: pair.slice(0, colon), title: pair.slice(colon + 1) });
  }
  if (inputs.length === 0) throw new Error("pass <slug> --title or --phase slug:title");
  readEpic(ctx.home, epic);
  const created = newPhases(ctx.home, epic, inputs);
  const epicDoc = readEpic(ctx.home, epic);
  epicDoc.updated = ctx.now();
  recomputeEpicStatus(epicDoc, listPhases(ctx.home, epic).map((p) => p.meta), ctx.now());
  writeEpic(ctx.home, epicDoc);
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
  const { positionals, values } = parse(args, { status: { type: "string" }, linear: { type: "string", multiple: true } });
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const status = optString(values, "status");
  const linear = optList(values, "linear");
  if (status === undefined && linear.length === 0) throw new Error("nothing to set: pass --status or --linear");
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
  const epicDoc = readEpic(ctx.home, epic);
  epicDoc.updated = ctx.now();
  recomputeEpicStatus(epicDoc, listPhases(ctx.home, epic).map((p) => p.meta), ctx.now());
  writeEpic(ctx.home, epicDoc);
  commit(ctx.home, `${epic}: set phase ${id} ${changes.join(", ")}`);
  const phase = listPhases(ctx.home, epic).find((p) => p.meta.id === id);
  return { json: phase?.meta ?? null, text: `updated phase ${id}: ${changes.join(", ")}` };
}

async function phaseDrop(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals } = parse(args, {});
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const dropped = dropPhase(ctx.home, epic, id);
  const epicDoc = readEpic(ctx.home, epic);
  epicDoc.updated = ctx.now();
  recomputeEpicStatus(epicDoc, listPhases(ctx.home, epic).map((p) => p.meta), ctx.now());
  writeEpic(ctx.home, epicDoc);
  commit(ctx.home, `${epic}: drop phase ${id}`);
  return { json: dropped.meta, text: `dropped phase ${id} ${dropped.meta.slug}` };
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
    case "event": return phaseEvent(rest, ctx);
    default: throw new Error("usage: planet phase new|write|set|drop|event");
  }
};
