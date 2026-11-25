import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Epic, Phase, PhaseKind, PhaseMeta, PhaseStatus } from "../schema/types.ts";
import { assertSlug, validatePhaseMeta } from "../schema/validate.ts";
import { NotFound, readEpic } from "./epic.ts";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.ts";
import { isShipped, readyLists, wouldCycle } from "./graph.ts";
import { assertPhasingApproval } from "./proposal.ts";
import { paths } from "./store.ts";

export interface NewPhaseInput {
  slug: string;
  title: string;
  linear?: string[];
  kind?: PhaseKind;
  repo?: string | null;
  milestone?: number | null;
  blockedBy?: number[];
  blocks?: number[];
}

/** The repo a phase's PRs land in: its own, else the epic's primary repo. */
export function phaseRepo(epic: Epic, meta: PhaseMeta): string {
  return meta.repo ?? epic.repos[0];
}

function assertEpicRepo(epic: Epic, repo: string): void {
  if (!epic.repos.includes(repo)) throw new Error(`${repo} is not one of epic '${epic.slug}' repos: ${epic.repos.join(", ")}`);
}

export function phaseFileName(id: number, slug: string): string {
  return `${String(id).padStart(2, "0")}-${slug}.md`;
}

export function readPhaseFile(path: string): Phase {
  const { data, body } = parseFrontmatter(readFileSync(path, "utf8"));
  return { meta: validatePhaseMeta(data, path), body, path };
}

export function listPhases(home: string, epic: string): Phase[] {
  const dir = paths.phases(home, epic);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{2,}-[a-z0-9-]+\.md$/.test(f))
    .map((f) => readPhaseFile(join(dir, f)))
    .sort((a, b) => a.meta.id - b.meta.id);
}

export function readPhase(home: string, epic: string, id: number): Phase {
  const phase = listPhases(home, epic).find((p) => p.meta.id === id);
  if (!phase) throw new NotFound(`no phase ${id} in epic '${epic}'`);
  return phase;
}

export function writePhase(phase: Phase): void {
  writeFileSync(phase.path, serializeFrontmatter({ ...phase.meta }, phase.body));
}

function assertPhaseIds(known: PhaseMeta[], ids: number[]): void {
  for (const id of ids) if (!known.some((p) => p.id === id)) throw new NotFound(`no phase ${id}`);
}

function assertMilestone(epic: Epic, milestone: number): void {
  if (!epic.milestones.some((m) => m.id === milestone)) throw new NotFound(`no milestone ${milestone} in epic '${epic.slug}'`);
}

export function newPhases(home: string, epic: string, inputs: NewPhaseInput[], proposal?: number): Phase[] {
  const existing = listPhases(home, epic);
  const existingTaken = new Set(existing.map((p) => p.meta.slug));
  const firstId = existing.reduce((max, p) => Math.max(max, p.meta.id), 0) + 1;
  const dir = paths.phases(home, epic);

  // Validation pass: check all inputs before any writes
  const epicDoc = readEpic(home, epic);
  const metas = existing.map((p) => ({ ...p.meta, blocked_by: [...p.meta.blocked_by] }));
  const batchTaken = new Set<string>();
  const created: PhaseMeta[] = [];
  const hasBlocks = inputs.some((i) => (i.blocks ?? []).length > 0);
  if (hasBlocks) {
    if (proposal === undefined) throw new Error("--blocks needs --proposal of an approved phasing proposal");
    assertPhasingApproval(home, epic, proposal);
  }
  for (const input of inputs) {
    assertSlug(input.slug, "phase slug");
    if (existingTaken.has(input.slug)) throw new Error(`phase '${input.slug}' already exists in epic '${epic}'`);
    if (batchTaken.has(input.slug)) throw new Error(`phase '${input.slug}' already exists in epic '${epic}'`);
    batchTaken.add(input.slug);
    if (input.repo) assertEpicRepo(epicDoc, input.repo);
    if (input.milestone != null) assertMilestone(epicDoc, input.milestone);
    assertPhaseIds(metas, input.blockedBy ?? []);
    assertPhaseIds(existing.map((p) => p.meta), input.blocks ?? []);
    for (const target of input.blocks ?? []) {
      if (isShipped(existing.find((p) => p.meta.id === target)!.meta.status)) throw new Error(`phase ${target} has shipped: it cannot gain a blocker`);
    }
    const meta: PhaseMeta = {
      id: firstId + created.length,
      slug: input.slug,
      title: input.title,
      status: "draft",
      kind: input.kind ?? "pr",
      repo: input.repo ?? null,
      linear: input.linear ?? [],
      prs: [],
      shipped_at: null,
      milestone: input.milestone ?? null,
      blocked_by: input.blockedBy ?? [],
    };
    created.push(meta);
    metas.push(meta);
    for (const target of input.blocks ?? []) {
      const targetMeta = metas.find((p) => p.id === target)!;
      if (!targetMeta.blocked_by.includes(meta.id)) targetMeta.blocked_by.push(meta.id);
    }
  }
  for (const meta of created) {
    if (wouldCycle(metas, meta.id, meta.blocked_by)) throw new Error(`phase ${meta.id} would form a cycle`);
  }

  // Write pass: create directories and write files
  mkdirSync(dir, { recursive: true });
  for (const p of existing) {
    const updated = metas.find((m) => m.id === p.meta.id)!;
    if (updated.blocked_by.length === p.meta.blocked_by.length) continue;
    writePhase({ ...p, meta: updated });
  }
  return created.map((meta) => {
    const phase: Phase = { meta, body: "", path: join(dir, phaseFileName(meta.id, meta.slug)) };
    writePhase(phase);
    return phase;
  });
}

/** Adds or removes blockers on one unshipped phase, checking ids and cycles before writing. */
export function setBlockers(home: string, epic: string, id: number, by: number[], remove: boolean, proposal: number): Phase {
  assertPhasingApproval(home, epic, proposal);
  const phases = listPhases(home, epic);
  const phase = phases.find((p) => p.meta.id === id);
  if (!phase) throw new NotFound(`no phase ${id} in epic '${epic}'`);
  if (isShipped(phase.meta.status)) throw new Error(`phase ${id} has shipped: it cannot change blockers`);
  const metas = phases.map((p) => p.meta);
  assertPhaseIds(metas, by);
  const next = remove
    ? phase.meta.blocked_by.filter((b) => !by.includes(b))
    : [...phase.meta.blocked_by, ...by.filter((b) => !phase.meta.blocked_by.includes(b))];
  if (!remove && wouldCycle(metas, id, next)) throw new Error(`blocking phase ${id} by ${by.join(", ")} would form a cycle`);
  phase.meta.blocked_by = next;
  writePhase(phase);
  return phase;
}

export function movePhase(home: string, epic: string, id: number, milestone: number | null): Phase {
  const phase = readPhase(home, epic, id);
  if (milestone !== null) assertMilestone(readEpic(home, epic), milestone);
  phase.meta.milestone = milestone;
  writePhase(phase);
  return phase;
}

export function writeBody(home: string, epic: string, id: number, body: string): Phase {
  const phase = readPhase(home, epic, id);
  phase.body = body.endsWith("\n") ? body : `${body}\n`;
  writePhase(phase);
  return phase;
}

const MANUAL_TRANSITIONS: Record<"planned" | "reviewed" | "shipped", readonly PhaseStatus[]> = {
  planned: ["draft", "planned"],
  reviewed: ["shipped"],
  shipped: ["draft", "planned", "in-progress"],
};

export function setPhaseStatus(home: string, epic: string, id: number, status: "planned" | "reviewed" | "shipped", now: string): Phase {
  const phase = readPhase(home, epic, id);
  if (!MANUAL_TRANSITIONS[status].includes(phase.meta.status)) {
    throw new Error(`cannot set phase ${id} to ${status} from ${phase.meta.status}`);
  }
  if (status === "shipped") {
    if (phase.meta.kind !== "manual" || phase.meta.prs.length > 0) throw new Error("only a manual phase with no linked prs can be shipped by hand");
    phase.meta.shipped_at = now;
  }
  phase.meta.status = status;
  writePhase(phase);
  return phase;
}

export function dropPhase(home: string, epic: string, id: number, proposal?: number): Phase {
  const phases = listPhases(home, epic);
  const phase = phases.find((p) => p.meta.id === id);
  if (!phase) throw new NotFound(`no phase ${id} in epic '${epic}'`);
  if (phase.meta.status !== "draft") throw new Error(`cannot drop phase ${id}: status is ${phase.meta.status}`);
  const dependents = phases.filter((p) => p.meta.blocked_by.includes(id));
  const open = dependents.filter((p) => !isShipped(p.meta.status));
  if (open.length > 0) {
    if (proposal === undefined) throw new Error(`cannot drop phase ${id}: it blocks phase ${open.map((p) => p.meta.id).join(", ")}; pass --proposal`);
    assertPhasingApproval(home, epic, proposal);
  }
  // shipped dependents are cleaned too, so no dangling ids remain
  for (const d of dependents) {
    d.meta.blocked_by = d.meta.blocked_by.filter((b) => b !== id);
    writePhase(d);
  }
  unlinkSync(phase.path);
  return phase;
}

export function setPhaseLinear(home: string, epic: string, id: number, linear: string[]): Phase {
  const phase = readPhase(home, epic, id);
  phase.meta.linear = linear;
  writePhase(phase);
  return phase;
}

/** Moves a phase to another of the epic's repos, only before any work or PR exists for it. */
export function setPhaseRepo(home: string, epic: string, id: number, repo: string): Phase {
  const phase = readPhase(home, epic, id);
  assertEpicRepo(readEpic(home, epic), repo);
  if (phase.meta.status !== "draft" && phase.meta.status !== "planned") throw new Error(`cannot move phase ${id} to ${repo}: status is ${phase.meta.status}`);
  if (phase.meta.prs.length > 0) throw new Error(`cannot move phase ${id} to ${repo}: it has linked prs`);
  phase.meta.repo = repo;
  writePhase(phase);
  return phase;
}

export function currentPhase(phases: PhaseMeta[], legacy: boolean): PhaseMeta | null {
  const inProgress = phases.find((p) => p.status === "in-progress");
  if (inProgress) return inProgress;
  const { plannable, ready } = readyLists(phases, legacy);
  const id = ready[0] ?? plannable[0];
  return phases.find((p) => p.id === id) ?? null;
}
