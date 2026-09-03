import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Phase, PhaseMeta, PhaseStatus } from "../schema/types.ts";
import { assertSlug, validatePhaseMeta } from "../schema/validate.ts";
import { NotFound } from "./epic.ts";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.ts";
import { paths } from "./store.ts";

export interface NewPhaseInput {
  slug: string;
  title: string;
  linear?: string[];
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
    .filter((f) => /^\d{2}-[a-z0-9-]+\.md$/.test(f))
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

export function newPhases(home: string, epic: string, inputs: NewPhaseInput[]): Phase[] {
  const existing = listPhases(home, epic);
  const existingTaken = new Set(existing.map((p) => p.meta.slug));
  let nextId = existing.reduce((max, p) => Math.max(max, p.meta.id), 0) + 1;
  const dir = paths.phases(home, epic);

  // Validation pass: check all inputs before any writes
  const batchTaken = new Set<string>();
  for (const input of inputs) {
    assertSlug(input.slug, "phase slug");
    if (existingTaken.has(input.slug)) throw new Error(`phase '${input.slug}' already exists in epic '${epic}'`);
    if (batchTaken.has(input.slug)) throw new Error(`phase '${input.slug}' already exists in epic '${epic}'`);
    batchTaken.add(input.slug);
  }

  // Write pass: create directories and write files
  mkdirSync(dir, { recursive: true });
  const created: Phase[] = [];
  for (const input of inputs) {
    const meta: PhaseMeta = { id: nextId++, slug: input.slug, title: input.title, status: "draft", linear: input.linear ?? [], prs: [], shipped_at: null };
    const phase: Phase = { meta, body: "", path: join(dir, phaseFileName(meta.id, meta.slug)) };
    writePhase(phase);
    created.push(phase);
  }
  return created;
}

export function writeBody(home: string, epic: string, id: number, body: string): Phase {
  const phase = readPhase(home, epic, id);
  phase.body = body.endsWith("\n") ? body : `${body}\n`;
  writePhase(phase);
  return phase;
}

const MANUAL_TRANSITIONS: Record<"planned" | "reviewed", readonly PhaseStatus[]> = {
  planned: ["draft", "planned"],
  reviewed: ["shipped"],
};

export function setPhaseStatus(home: string, epic: string, id: number, status: "planned" | "reviewed"): Phase {
  const phase = readPhase(home, epic, id);
  if (!MANUAL_TRANSITIONS[status].includes(phase.meta.status)) {
    throw new Error(`cannot set phase ${id} to ${status} from ${phase.meta.status}`);
  }
  phase.meta.status = status;
  writePhase(phase);
  return phase;
}

export function setPhaseLinear(home: string, epic: string, id: number, linear: string[]): Phase {
  const phase = readPhase(home, epic, id);
  phase.meta.linear = linear;
  writePhase(phase);
  return phase;
}

export function currentPhase(phases: PhaseMeta[]): PhaseMeta | null {
  for (const status of ["in-progress", "planned", "draft"] as const) {
    const found = phases.find((p) => p.status === status);
    if (found) return found;
  }
  return null;
}
