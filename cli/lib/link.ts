import type { Epic, Phase } from "../schema/types.ts";
import { readEpic, writeEpic } from "./epic.ts";
import { recomputeEpicStatus } from "./lifecycle.ts";
import { listPhases, readPhase, writePhase } from "./phase.ts";

export const PR_URL_RE = /https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/;

export interface LinkResult {
  epic: Epic;
  phase: Phase;
  added: string[];
}

export function linkPrs(home: string, epicSlug: string, phaseId: number, urls: string[], now: string): LinkResult {
  const epic = readEpic(home, epicSlug);
  const phase = readPhase(home, epicSlug, phaseId);
  const added: string[] = [];
  for (const raw of urls) {
    const m = PR_URL_RE.exec(raw);
    if (!m) throw new Error(`not a GitHub PR url: ${raw}`);
    if (m[1] !== epic.repo) throw new Error(`${raw} is not in ${epic.repo}`);
    const url = m[0];
    if (phase.meta.prs.some((pr) => pr.url === url)) continue;
    phase.meta.prs.push({ url, state: "open", merged_at: null });
    added.push(url);
  }
  if (added.length === 0) return { epic, phase, added };
  if (phase.meta.status === "draft" || phase.meta.status === "planned") phase.meta.status = "in-progress";
  writePhase(phase);
  epic.updated = now;
  recomputeEpicStatus(epic, listPhases(home, epicSlug).map((p) => p.meta), now);
  writeEpic(home, epic);
  return { epic, phase, added };
}

export function unlinkPr(home: string, epicSlug: string, phaseId: number, url: string, now: string): LinkResult {
  const epic = readEpic(home, epicSlug);
  const phase = readPhase(home, epicSlug, phaseId);
  const before = phase.meta.prs.length;
  phase.meta.prs = phase.meta.prs.filter((pr) => pr.url !== url);
  if (phase.meta.prs.length === before) throw new Error(`${url} is not linked to phase ${phaseId}`);
  if (phase.meta.prs.length === 0 && phase.meta.status === "in-progress") phase.meta.status = "planned";
  writePhase(phase);
  epic.updated = now;
  writeEpic(home, epic);
  return { epic, phase, added: [] };
}
