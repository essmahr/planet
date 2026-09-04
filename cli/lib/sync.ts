import type { PrInfo } from "./gh.ts";
import type { Gh } from "./gh.ts";
import { listEpics, readEpic, writeEpic } from "./epic.ts";
import { recomputeEpicStatus } from "./lifecycle.ts";
import { listPhases, writePhase } from "./phase.ts";
import { commit } from "./store.ts";

export const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

export interface SyncOptions {
  force?: boolean;
  maxAgeMs?: number;
}

export interface SyncResult {
  epic: string;
  skipped: boolean;
  stale: boolean;
  stale_reason: string | null;
  changes: string[];
}

export async function syncEpic(home: string, slug: string, gh: Gh, now: string, opts: SyncOptions = {}): Promise<SyncResult> {
  const epic = readEpic(home, slug);
  const result: SyncResult = { epic: slug, skipped: false, stale: false, stale_reason: null, changes: [] };
  if (epic.status === "shipped" || epic.status === "abandoned") return { ...result, skipped: true };
  const maxAge = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  if (!opts.force && epic.synced_at !== null && Date.parse(now) - Date.parse(epic.synced_at) < maxAge) {
    return { ...result, skipped: true };
  }
  const phases = listPhases(home, slug);
  const openUrls = phases.flatMap((p) => p.meta.prs.filter((pr) => pr.state === "open").map((pr) => pr.url));
  let infos: PrInfo[] = [];
  if (openUrls.length > 0) {
    try {
      infos = await gh.prStates(openUrls);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ...result, stale: true, stale_reason: message };
    }
  }
  const byUrl = new Map(infos.map((i) => [i.url, i]));
  for (const phase of phases) {
    let changed = false;
    for (const pr of phase.meta.prs) {
      if (pr.state === "open" && !byUrl.has(pr.url)) {
        result.changes.push(`phase ${phase.meta.id}: ${pr.url} not found on github`);
        continue;
      }
      const info = byUrl.get(pr.url);
      if (!info || info.state === pr.state) continue;
      result.changes.push(`phase ${phase.meta.id}: ${pr.url} ${pr.state} -> ${info.state}`);
      pr.state = info.state;
      pr.merged_at = info.merged_at;
      changed = true;
    }
    const allMerged = phase.meta.prs.length > 0 && phase.meta.prs.every((pr) => pr.state === "merged");
    const shippable = phase.meta.status === "draft" || phase.meta.status === "planned" || phase.meta.status === "in-progress";
    if (allMerged && shippable) {
      phase.meta.status = "shipped";
      phase.meta.shipped_at = now;
      result.changes.push(`phase ${phase.meta.id}: shipped`);
      changed = true;
    }
    if (changed) writePhase(phase);
  }
  if (recomputeEpicStatus(epic, phases.map((p) => p.meta), now)) result.changes.push(`epic: ${epic.status}`);
  epic.synced_at = now;
  if (result.changes.length) epic.updated = now;
  writeEpic(home, epic);
  return result;
}

export async function syncAll(home: string, gh: Gh, now: string, opts: SyncOptions = {}): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const epic of listEpics(home)) results.push(await syncEpic(home, epic.slug, gh, now, opts));
  return results;
}

export function commitSync(home: string, results: SyncResult[]): void {
  const changed = results.filter((r) => r.changes.length > 0).map((r) => r.epic);
  if (changed.length === 0) {
    commit(home, "sync");
    return;
  }
  commit(home, `sync: ${changed.join(", ")}`);
}
