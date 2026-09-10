import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { paths } from "./store.ts";

export type EventKind = "blocked" | "implemented" | "reviewed";
export const EVENT_KINDS: readonly EventKind[] = ["blocked", "implemented", "reviewed"];

export interface PlanetEvent {
  ts: string;
  phase: number;
  kind: EventKind;
  text: string | null;
  sha: string | null;
  session: string;
}

export interface NewEventInput {
  phase: number;
  kind: EventKind;
  text?: string | null;
  sha?: string | null;
  session: string;
}

export function appendEvent(home: string, epic: string, input: NewEventInput, now: string): PlanetEvent {
  const event: PlanetEvent = { ts: now, phase: input.phase, kind: input.kind, text: input.text ?? null, sha: input.sha ?? null, session: input.session };
  mkdirSync(paths.feedback(home, epic), { recursive: true });
  appendFileSync(paths.events(home, epic), `${JSON.stringify(event)}\n`);
  return event;
}

export function listEvents(home: string, epic: string, phase?: number): PlanetEvent[] {
  const file = paths.events(home, epic);
  if (!existsSync(file)) return [];
  const all = readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as PlanetEvent);
  if (phase === undefined) return all;
  return all.filter((e) => e.phase === phase);
}
