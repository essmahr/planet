import { existsSync, readFileSync } from "node:fs";
import { paths } from "./store.ts";
import type { PhaseMeta, PhaseStatus } from "../schema/types.ts";

const PHASES_HEADING_RE = /^## Phases[ \t]*$/m;
const STARTED: readonly PhaseStatus[] = ["planned", "in-progress", "shipped", "reviewed"];

export function isShipped(status: PhaseStatus): boolean {
  return status === "shipped" || status === "reviewed";
}

function byId(phases: PhaseMeta[]): Map<number, PhaseMeta> {
  return new Map(phases.map((p) => [p.id, p]));
}

/** Finds each cycle in the blocked_by graph once, as a sorted list of phase ids. Missing ids are ignored. */
function findCycles(phases: PhaseMeta[]): number[][] {
  const known = byId(phases);
  const cycles = new Map<string, number[]>();
  const visiting: number[] = [];
  const done = new Set<number>();
  const visit = (id: number): void => {
    const at = visiting.indexOf(id);
    if (at >= 0) {
      const ids = visiting.slice(at).sort((a, b) => a - b);
      cycles.set(ids.join(","), ids);
      return;
    }
    if (done.has(id)) return;
    visiting.push(id);
    for (const b of known.get(id)?.blocked_by ?? []) if (known.has(b)) visit(b);
    visiting.pop();
    done.add(id);
  };
  for (const p of phases) visit(p.id);
  return [...cycles.values()];
}

export function graphErrors(phases: PhaseMeta[]): string[] {
  const known = byId(phases);
  const errors: string[] = [];
  for (const p of phases) {
    for (const b of p.blocked_by) {
      if (!known.has(b)) errors.push(`phase ${p.id} is blocked by missing phase ${b}`);
    }
  }
  for (const ids of findCycles(phases)) errors.push(`phases ${ids.join(", ")} form a cycle`);
  return errors;
}

/** True when giving phase `id` these blockers would create a cycle. */
export function wouldCycle(phases: PhaseMeta[], id: number, blockers: number[]): boolean {
  const next = phases.map((p) => (p.id === id ? { ...p, blocked_by: blockers } : p));
  return findCycles(next).length > 0;
}

/** Counts the transitive phases blocked by `id` that aren't shipped, each once. */
export function dependentsCount(phases: PhaseMeta[], id: number): number {
  const seen = new Set<number>();
  const stack = [id];
  while (stack.length) {
    const current = stack.pop()!;
    for (const p of phases) {
      if (!p.blocked_by.includes(current) || seen.has(p.id) || p.id === id) continue;
      seen.add(p.id);
      stack.push(p.id);
    }
  }
  return [...seen].filter((s) => !isShipped(byId(phases).get(s)!.status)).length;
}

export function unshippedBlockers(phases: PhaseMeta[], id: number): number[] {
  const known = byId(phases);
  const phase = known.get(id);
  if (!phase) return [];
  return phase.blocked_by.filter((b) => {
    const blocker = known.get(b);
    return !blocker || !isShipped(blocker.status);
  });
}

export function isLegacy(home: string, epic: string): boolean {
  const plan = paths.plan(home, epic);
  if (!existsSync(plan)) return false;
  return PHASES_HEADING_RE.test(readFileSync(plan, "utf8"));
}

export function readyLists(phases: PhaseMeta[], legacy: boolean): { plannable: number[]; ready: number[] } {
  const known = byId(phases);
  const lowest = (status: PhaseStatus): number[] => {
    const first = phases.filter((p) => p.status === status).sort((a, b) => a.id - b.id)[0];
    if (!first) return [];
    return [first.id];
  };
  if (legacy) return { plannable: lowest("draft"), ready: lowest("planned") };
  const blockersAre = (p: PhaseMeta, ok: (b: PhaseMeta) => boolean): boolean =>
    p.blocked_by.every((b) => {
      const blocker = known.get(b);
      return blocker !== undefined && ok(blocker);
    });
  const order = (list: PhaseMeta[]): number[] =>
    list
      .map((p) => ({ id: p.id, count: dependentsCount(phases, p.id) }))
      .sort((a, b) => b.count - a.count || a.id - b.id)
      .map((p) => p.id);
  return {
    plannable: order(phases.filter((p) => p.status === "draft" && blockersAre(p, (b) => STARTED.includes(b.status)))),
    ready: order(phases.filter((p) => p.status === "planned" && blockersAre(p, (b) => isShipped(b.status)))),
  };
}
