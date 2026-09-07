import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Epic, PhaseMeta, Step } from "../schema/types.ts";
import { readEpic } from "./epic.ts";
import { listPhases } from "./phase.ts";
import { listProposals } from "./proposal.ts";
import { paths } from "./store.ts";

export interface EpicView {
  epic: Epic;
  phases: Array<PhaseMeta & { path: string }>;
  last_approved_step: Step | null;
  paths: {
    dir: string;
    plan: string | null;
    retros: string[];
    latest_proposal: string | null;
    prompts: string | null;
    notes: string | null;
  };
}

function ifExists(path: string): string | null {
  return existsSync(path) ? path : null;
}

export function epicView(home: string, slug: string): EpicView {
  const epic = readEpic(home, slug);
  const phases = listPhases(home, slug);
  const proposals = listProposals(home, slug);
  const retrosDir = paths.retros(home, slug);
  const retros = existsSync(retrosDir)
    ? readdirSync(retrosDir).filter((f) => f.endsWith(".md")).sort().map((f) => join(retrosDir, f))
    : [];
  const approved = proposals.filter((p) => p.meta.outcome === "approved");
  const lastStep = approved.length ? approved[approved.length - 1].meta.step : null;
  const last_approved_step: Step | null = lastStep === null || lastStep === "unknown" ? null : lastStep;
  return {
    epic,
    phases: phases.map((p) => ({ ...p.meta, path: p.path })),
    last_approved_step,
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
