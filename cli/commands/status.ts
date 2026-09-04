import type { Command, Ctx } from "../lib/context.ts";
import type { Parsed } from "../lib/args.ts";
import { flag, parse } from "../lib/args.ts";
import { listEpics } from "../lib/epic.ts";
import { currentPhase, listPhases } from "../lib/phase.ts";
import { commitSync, syncAll } from "../lib/sync.ts";
import { renderTable } from "../lib/table.ts";
import type { EpicStatus } from "../schema/types.ts";

export interface StatusRow {
  slug: string;
  title: string;
  repo: string;
  status: EpicStatus;
  shipped: number;
  total: number;
  current: string | null;
  open_prs: number;
  closed_prs: number;
  unreviewed: number;
  synced_at: string | null;
  stale: boolean;
}

export function buildRows(home: string, stale: Set<string>): StatusRow[] {
  return listEpics(home).map((epic) => {
    const metas = listPhases(home, epic.slug).map((p) => p.meta);
    const prs = metas.flatMap((m) => m.prs);
    const current = currentPhase(metas);
    return {
      slug: epic.slug,
      title: epic.title,
      repo: epic.repo,
      status: epic.status,
      shipped: metas.filter((m) => m.status === "shipped" || m.status === "reviewed").length,
      total: metas.length,
      current: current ? `${current.id} ${current.slug}` : null,
      open_prs: prs.filter((pr) => pr.state === "open").length,
      closed_prs: prs.filter((pr) => pr.state === "closed").length,
      unreviewed: metas.filter((m) => m.status === "shipped").length,
      synced_at: epic.synced_at,
      stale: stale.has(epic.slug),
    };
  });
}

export function renderStatus(rows: StatusRow[]): string {
  if (rows.length === 0) return "no active epics";
  return renderTable(
    ["EPIC", "REPO", "STATUS", "PHASES", "CURRENT", "OPEN", "REVIEW", "SYNCED"],
    rows.map((r) => [
      r.slug,
      r.repo,
      r.stale ? `${r.status} (stale)` : r.status,
      `${r.shipped}/${r.total}`,
      r.current ?? "-",
      r.closed_prs ? `${r.open_prs} (${r.closed_prs} closed)` : String(r.open_prs),
      r.unreviewed ? String(r.unreviewed) : "-",
      r.synced_at ? r.synced_at.slice(0, 16).replace("T", " ") : "never",
    ]),
  );
}

export async function syncForRead(ctx: Ctx, values: Parsed["values"]): Promise<Set<string>> {
  const stale = new Set<string>();
  if (flag(values, "no-sync")) return stale;
  const results = await syncAll(ctx.home, ctx.gh, ctx.now(), { force: flag(values, "force") });
  for (const r of results) if (r.stale) stale.add(r.epic);
  commitSync(ctx.home, results);
  return stale;
}

export const READ_OPTIONS = {
  "no-sync": { type: "boolean" as const },
  force: { type: "boolean" as const },
};

export const statusCommand: Command = async (args, ctx) => {
  const { values } = parse(args, { ...READ_OPTIONS, all: { type: "boolean" } });
  const stale = await syncForRead(ctx, values);
  let rows = buildRows(ctx.home, stale);
  if (!flag(values, "all")) rows = rows.filter((r) => r.status !== "shipped" && r.status !== "abandoned");
  return { json: rows, text: renderStatus(rows) };
};
