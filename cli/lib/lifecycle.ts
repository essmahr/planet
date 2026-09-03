import type { Epic, PhaseMeta } from "../schema/types.ts";

/** Derives the epic status from its phases. Mutates `epic`, returns true when it changed. */
export function recomputeEpicStatus(epic: Epic, phases: PhaseMeta[], now: string): boolean {
  if (epic.status === "planning" && phases.some((p) => p.prs.length > 0)) {
    epic.status = "active";
    epic.updated = now;
    return true;
  }
  if (epic.status === "active" && phases.length > 0 && phases.every((p) => p.status === "reviewed")) {
    epic.status = "shipped";
    epic.shipped_at = now;
    epic.updated = now;
    return true;
  }
  return false;
}
