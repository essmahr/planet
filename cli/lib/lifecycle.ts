import type { Epic, PhaseMeta } from "../schema/types.ts";

const STARTED: ReadonlySet<PhaseMeta["status"]> = new Set(["in-progress", "shipped", "reviewed"]);

/**
 * Derives the epic status from its phases. Mutates `epic`, returns true when it changed.
 *
 * Shipped is checked before active so an epic whose phases are all manual, which never
 * link a PR, still ships once every phase is reviewed instead of staying in planning.
 *
 * Shipped reverses too. A re-cut that adds phases after the epic shipped puts it back to
 * active, because `planet sync` skips a shipped epic outright and `planet status` and
 * `planet open` hide it, so the new phases would go unsynced and unlisted. Paused and
 * abandoned are set by hand and never move on their own.
 */
export function recomputeEpicStatus(epic: Epic, phases: PhaseMeta[], now: string): boolean {
  if (epic.status === "shipped" && phases.some((p) => p.status !== "reviewed")) {
    epic.status = "active";
    epic.shipped_at = null;
    epic.updated = now;
    return true;
  }
  const open = epic.status === "planning" || epic.status === "active";
  if (open && phases.length > 0 && phases.every((p) => p.status === "reviewed")) {
    epic.status = "shipped";
    epic.shipped_at = now;
    epic.updated = now;
    return true;
  }
  if (epic.status === "planning" && phases.some((p) => p.prs.length > 0 || STARTED.has(p.status))) {
    epic.status = "active";
    epic.updated = now;
    return true;
  }
  return false;
}
