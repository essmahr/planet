import type { Command, CommandResult, Ctx } from "../lib/context.ts";
import { need, optString, parse } from "../lib/args.ts";
import { endSession, readMarker, sessionIdFrom, setSessionStep, startSession } from "../lib/session.ts";
import { commit } from "../lib/store.ts";
import type { Step } from "../schema/types.ts";
import { STEPS } from "../schema/types.ts";

export function parseStep(value: string): Step {
  if (!(STEPS as readonly string[]).includes(value)) throw new Error(`step must be one of ${STEPS.join(", ")}`);
  return value as Step;
}

async function sessionStart(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { phase: { type: "string" }, step: { type: "string" }, session: { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const id = sessionIdFrom(ctx.env, optString(values, "session"));
  const phaseText = optString(values, "phase");
  const phase = phaseText === undefined ? null : Number(phaseText);
  if (phase !== null && !Number.isInteger(phase)) throw new Error("--phase must be an integer");
  const stepText = optString(values, "step");
  const marker = startSession(ctx.home, id, epic, { phase, step: stepText === undefined ? null : parseStep(stepText) }, ctx.now());
  commit(ctx.home, `${epic}: start session`);
  return { json: { session: id, marker }, text: `session ${id} on ${epic}` };
}

async function sessionStep(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { session: { type: "string" } });
  const step = parseStep(need(positionals, 0, "step name"));
  const id = sessionIdFrom(ctx.env, optString(values, "session"));
  const marker = setSessionStep(ctx.home, id, step);
  commit(ctx.home, `${marker.epic}: session step ${step}`);
  return { json: { session: id, marker }, text: `step ${step}` };
}

async function sessionEnd(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { values } = parse(args, { session: { type: "string" } });
  const id = sessionIdFrom(ctx.env, optString(values, "session"));
  const marker = readMarker(ctx.home, id);
  const existed = endSession(ctx.home, id);
  if (existed && marker) commit(ctx.home, `${marker.epic}: end session`);
  return { json: { session: id, ended: existed }, text: existed ? "session ended" : "no active session" };
}

export const sessionCommand: Command = async (args, ctx) => {
  const [sub, ...rest] = args;
  switch (sub) {
    case "start": return sessionStart(rest, ctx);
    case "step": return sessionStep(rest, ctx);
    case "end": return sessionEnd(rest, ctx);
    default: throw new Error("usage: planet session start|step|end");
  }
};
