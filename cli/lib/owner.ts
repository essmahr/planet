import { listEpics } from "./epic.ts";
import { listPhases, readPhase, writePhase } from "./phase.ts";

export interface OwnedPr {
  epic: string;
  phase: number;
  url: string;
}

export function ownPrs(home: string, epic: string, phase: number, session: string): string[] {
  const p = readPhase(home, epic, phase);
  for (const pr of p.meta.prs) pr.session = session;
  writePhase(p);
  return p.meta.prs.map((pr) => pr.url);
}

export function ownedOpenPrs(home: string, session: string): OwnedPr[] {
  const owned: OwnedPr[] = [];
  let epics: ReturnType<typeof listEpics> = [];
  try {
    epics = listEpics(home);
  } catch {
    return owned;
  }
  for (const epic of epics) {
    let phases: ReturnType<typeof listPhases> = [];
    try {
      phases = listPhases(home, epic.slug);
    } catch {
      continue;
    }
    for (const phase of phases) {
      for (const pr of phase.meta.prs) {
        if (pr.state === "open" && pr.session === session) owned.push({ epic: epic.slug, phase: phase.meta.id, url: pr.url });
      }
    }
  }
  return owned;
}
