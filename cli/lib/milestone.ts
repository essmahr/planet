import type { Milestone, PhaseMeta } from "../schema/types.ts";
import { assertSlug } from "../schema/validate.ts";
import { readEpic, writeEpic } from "./epic.ts";
import { isShipped } from "./graph.ts";
import { listPhases } from "./phase.ts";
import { assertPhasingApproval } from "./proposal.ts";

function assertMilestoneChangeAllowed(home: string, epic: string, proposal: number | undefined): void {
  if (listPhases(home, epic).length === 0) return;
  if (proposal === undefined) throw new Error("changing milestones after phases exist needs --proposal of an approved phasing proposal");
  assertPhasingApproval(home, epic, proposal);
}

export function newMilestone(home: string, epic: string, input: { slug: string; title: string }, proposal?: number): Milestone {
  assertSlug(input.slug, "milestone slug");
  const doc = readEpic(home, epic);
  if (doc.milestones.some((m) => m.slug === input.slug)) throw new Error(`milestone '${input.slug}' already exists in epic '${epic}'`);
  assertMilestoneChangeAllowed(home, epic, proposal);
  const id = doc.milestones.reduce((max, m) => Math.max(max, m.id), 0) + 1;
  const milestone: Milestone = { id, slug: input.slug, title: input.title };
  doc.milestones.push(milestone);
  writeEpic(home, doc);
  return milestone;
}

export function dropMilestone(home: string, epic: string, id: number, proposal?: number): Milestone {
  const doc = readEpic(home, epic);
  const milestone = doc.milestones.find((m) => m.id === id);
  if (!milestone) throw new Error(`no milestone ${id} in epic '${epic}'`);
  if (listPhases(home, epic).some((p) => p.meta.milestone === id)) throw new Error(`milestone ${id} still has phases: move them first`);
  assertMilestoneChangeAllowed(home, epic, proposal);
  doc.milestones = doc.milestones.filter((m) => m.id !== id);
  writeEpic(home, doc);
  return milestone;
}

export function milestoneStatus(id: number, phases: PhaseMeta[]): "open" | "done" {
  const inMilestone = phases.filter((p) => p.milestone === id);
  if (inMilestone.length === 0) return "open";
  if (inMilestone.every((p) => isShipped(p.status))) return "done";
  return "open";
}
