import { existsSync, readdirSync } from "node:fs";
import { readEpic } from "./epic.ts";
import { listPhases, readPhase, writePhase } from "./phase.ts";
import { paths } from "./store.ts";

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

function epicSlugs(home: string): string[] {
  const root = paths.epics(home);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

function openPrsOf(home: string, slug: string, session: string): OwnedPr[] {
  readEpic(home, slug);
  return listPhases(home, slug).flatMap((phase) =>
    phase.meta.prs.filter((pr) => pr.state === "open" && pr.session === session).map((pr) => ({ epic: slug, phase: phase.meta.id, url: pr.url })),
  );
}

export function ownedOpenPrs(home: string, session: string): OwnedPr[] {
  const owned: OwnedPr[] = [];
  for (const slug of epicSlugs(home)) {
    try {
      owned.push(...openPrsOf(home, slug, session));
    } catch {
      // an unreadable epic owns nothing
    }
  }
  return owned;
}
