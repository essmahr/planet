import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Epic, PhaseMeta, Step } from "../schema/types.ts";
import { readEpic } from "./epic.ts";
import { listPhases } from "./phase.ts";
import { listProposals } from "./proposal.ts";
import { listRetros } from "./retro.ts";
import type { RetroSkill } from "./retro.ts";
import { paths } from "./store.ts";

export interface EpicLesson {
  phase: number;
  skill: RetroSkill;
  text: string;
}

export interface EpicView {
  epic: Epic;
  phases: Array<PhaseMeta & { path: string }>;
  last_approved_step: Step | null;
  lessons: EpicLesson[];
  paths: {
    dir: string;
    plan: string | null;
    retros: string[];
    latest_proposal: string | null;
    prompts: string | null;
    notes: string | null;
  };
}

/** What the router needs to pick the next step: statuses and paths, no PR detail, no retro or proposal paths. */
export interface EpicBrief {
  epic: Pick<Epic, "slug" | "title" | "repo" | "status">;
  phases: Array<Pick<PhaseMeta, "id" | "slug" | "title" | "status" | "kind" | "linear"> & { open_prs: string[] }>;
  last_approved_step: Step | null;
  paths: { dir: string; plan: string | null };
}

const PLANNING_STEPS: ReadonlySet<string> = new Set<Step>(["intake", "scoping", "phasing", "phase-plan"]);

/**
 * Only the planning chain moves `last_approved_step`. A plan approved mid-implement or
 * mid-retro (plain plan mode in a Planet session) would otherwise mask where planning stands.
 */
function isPlanningStep(step: Step | "unknown"): boolean {
  return PLANNING_STEPS.has(step);
}

function ifExists(path: string): string | null {
  return existsSync(path) ? path : null;
}

function lastApprovedStep(home: string, slug: string): Step | null {
  const approved = listProposals(home, slug).filter((p) => p.meta.outcome === "approved" && isPlanningStep(p.meta.step));
  return approved.length ? (approved[approved.length - 1].meta.step as Step) : null;
}

/** Every lesson marked apply across the epic's retros, in phase order, so a later phase-plan can apply all of them. */
export function epicLessons(home: string, slug: string): EpicLesson[] {
  return listRetros(home, slug).flatMap((r) => r.meta.lessons.filter((l) => l.apply).map((l) => ({ phase: r.meta.phase, skill: l.skill, text: l.text })));
}

export function epicView(home: string, slug: string): EpicView {
  const epic = readEpic(home, slug);
  const phases = listPhases(home, slug);
  const proposals = listProposals(home, slug);
  const retrosDir = paths.retros(home, slug);
  const retros = existsSync(retrosDir)
    ? readdirSync(retrosDir).filter((f) => f.endsWith(".md")).sort().map((f) => join(retrosDir, f))
    : [];
  return {
    epic,
    phases: phases.map((p) => ({ ...p.meta, path: p.path })),
    last_approved_step: lastApprovedStep(home, slug),
    lessons: epicLessons(home, slug),
    paths: {
      dir: paths.epic(home, slug),
      plan: ifExists(paths.plan(home, slug)),
      retros,
      latest_proposal: proposals.length ? proposals[proposals.length - 1].path : null,
      prompts: ifExists(paths.prompts(home, slug)),
      notes: ifExists(paths.notes(home, slug)),
    },
  };
}

export function epicBrief(home: string, slug: string): EpicBrief {
  const epic = readEpic(home, slug);
  return {
    epic: { slug: epic.slug, title: epic.title, repo: epic.repo, status: epic.status },
    phases: listPhases(home, slug).map(({ meta }) => ({
      id: meta.id,
      slug: meta.slug,
      title: meta.title,
      status: meta.status,
      kind: meta.kind,
      linear: meta.linear,
      open_prs: meta.prs.filter((pr) => pr.state === "open").map((pr) => pr.url),
    })),
    last_approved_step: lastApprovedStep(home, slug),
    paths: { dir: paths.epic(home, slug), plan: ifExists(paths.plan(home, slug)) },
  };
}
