import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Proposal } from "../schema/types.ts";
import { listProposals, editedPath } from "./proposal.ts";
import { paths } from "./store.ts";

export interface PlanComment {
  quote: string;
  comment: string;
}

export const COMMENT_RE = /^\[Re: "(.*)"\]\s*(.*)$/;

export function parseComments(text: string): PlanComment[] {
  const out: PlanComment[] = [];
  for (const line of text.split("\n")) {
    const m = COMMENT_RE.exec(line);
    if (m) out.push({ quote: m[1], comment: m[2] });
  }
  return out;
}

export const NOTE_RE = /^-\s*proposal\s+(\d+)\s*·\s*([a-z-]+)/;

export function parseTags(notes: string): Record<string, number> {
  const tags: Record<string, number> = {};
  for (const line of notes.split("\n")) {
    const m = NOTE_RE.exec(line);
    if (m) tags[m[2]] = (tags[m[2]] ?? 0) + 1;
  }
  return tags;
}

/** The snapshot body written to a temp file, so the diff against the edited plan excludes frontmatter. */
function snapshotBodyFile(proposal: Proposal): string {
  const file = join(mkdtempSync(join(tmpdir(), "planet-diff-")), "snapshot.md");
  writeFileSync(file, proposal.body);
  return file;
}

/** Unified diff between two files, hunks only. git exits 1 when the files differ, so the status is ignored. */
export function diffFiles(a: string, b: string): string {
  const result = spawnSync("git", ["diff", "--no-index", "--no-color", "--unified=1", "--", a, b], { encoding: "utf8" });
  const lines = result.stdout.split("\n");
  const first = lines.findIndex((l) => l.startsWith("@@"));
  return first === -1 ? "" : lines.slice(first).join("\n").trimEnd();
}

export interface StepStats {
  step: string;
  proposals: number;
  approved: number;
  rejected: number;
  pending: number;
  edited: number;
  proposals_per_approval: number | null;
}

export interface Rejection {
  epic: string;
  id: number;
  step: string;
  feedback: string;
  comments: PlanComment[];
}

export interface Edit {
  epic: string;
  id: number;
  step: string;
  diff: string;
}

export interface FeedbackReport {
  epics: string[];
  steps: StepStats[];
  rejections: Rejection[];
  edits: Edit[];
  tags: Record<string, number>;
  prompts: Record<string, number>;
}

export function buildReport(home: string, epics: string[]): FeedbackReport {
  const stats = new Map<string, StepStats>();
  const rejections: Rejection[] = [];
  const edits: Edit[] = [];
  const tags: Record<string, number> = {};
  const prompts: Record<string, number> = {};

  for (const epic of epics) {
    for (const p of listProposals(home, epic)) {
      const s = stats.get(p.meta.step) ?? { step: p.meta.step, proposals: 0, approved: 0, rejected: 0, pending: 0, edited: 0, proposals_per_approval: null };
      s.proposals += 1;
      if (p.meta.outcome === "approved") s.approved += 1;
      if (p.meta.outcome === "rejected") s.rejected += 1;
      if (p.meta.outcome === "pending") s.pending += 1;
      if (p.meta.edited) s.edited += 1;
      stats.set(p.meta.step, s);
      if (p.meta.outcome === "rejected") {
        const feedback = p.meta.feedback ?? "";
        rejections.push({ epic, id: p.meta.id, step: p.meta.step, feedback, comments: parseComments(feedback) });
      }
      if (p.meta.edited && existsSync(editedPath(p.path))) {
        edits.push({ epic, id: p.meta.id, step: p.meta.step, diff: diffFiles(snapshotBodyFile(p), editedPath(p.path)) });
      }
    }
    const notes = paths.notes(home, epic);
    if (existsSync(notes)) for (const [tag, n] of Object.entries(parseTags(readFileSync(notes, "utf8")))) tags[tag] = (tags[tag] ?? 0) + n;
    const promptsFile = paths.prompts(home, epic);
    if (existsSync(promptsFile)) {
      for (const line of readFileSync(promptsFile, "utf8").split("\n")) {
        if (!line.trim()) continue;
        const kind = (JSON.parse(line) as { kind?: string }).kind ?? "unknown";
        prompts[kind] = (prompts[kind] ?? 0) + 1;
      }
    }
  }
  for (const s of stats.values()) s.proposals_per_approval = s.approved ? s.proposals / s.approved : null;
  const steps = [...stats.values()].sort((a, b) => a.step.localeCompare(b.step));
  return { epics, steps, rejections, edits, tags, prompts };
}
