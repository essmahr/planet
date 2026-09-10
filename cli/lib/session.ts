import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import type { SessionMarker, Step } from "../schema/types.ts";
import { validateMarker } from "../schema/validate.ts";
import { readEpic, writeEpic } from "./epic.ts";
import { readPhase } from "./phase.ts";
import { paths } from "./store.ts";

export function sessionIdFrom(env: NodeJS.ProcessEnv, override?: string): string {
  const id = override ?? env.CLAUDE_CODE_SESSION_ID;
  if (!id) throw new Error("no session id: set CLAUDE_CODE_SESSION_ID or pass --session");
  return id;
}

export function readMarker(home: string, id: string): SessionMarker | null {
  const file = paths.session(home, id);
  if (!existsSync(file)) return null;
  return validateMarker(JSON.parse(readFileSync(file, "utf8")), file);
}

export function writeMarker(home: string, id: string, marker: SessionMarker): void {
  writeFileSync(paths.session(home, id), `${JSON.stringify(marker)}\n`);
}

export interface StartOptions {
  phase?: number | null;
  step?: Step | null;
}

export function startSession(home: string, id: string, epicSlug: string, opts: StartOptions, now: string): SessionMarker {
  const epic = readEpic(home, epicSlug);
  const phase = opts.phase ?? null;
  if (phase !== null) readPhase(home, epicSlug, phase);
  const marker: SessionMarker = { epic: epicSlug, phase, step: opts.step ?? null, started: now };
  writeMarker(home, id, marker);
  if (!epic.sessions.includes(id)) {
    epic.sessions.push(id);
    epic.updated = now;
    writeEpic(home, epic);
  }
  return marker;
}

export function setSessionStep(home: string, id: string, step: Step, phase?: number | null): SessionMarker {
  const marker = readMarker(home, id);
  if (!marker) throw new Error("no active planet session; run planet session start first");
  marker.step = step;
  if (phase !== undefined) {
    if (phase !== null) readPhase(home, marker.epic, phase);
    marker.phase = phase;
  }
  writeMarker(home, id, marker);
  return marker;
}

export function endSession(home: string, id: string): boolean {
  const file = paths.session(home, id);
  if (!existsSync(file)) return false;
  unlinkSync(file);
  return true;
}
