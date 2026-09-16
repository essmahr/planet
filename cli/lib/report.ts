import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listEvents } from "./events.ts";
import { listProposals } from "./proposal.ts";
import { listRetros } from "./retro.ts";
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

export interface StepStats {
  step: string;
  proposals: number;
  approved: number;
  rejected: number;
  pending: number;
  proposals_per_approval: number | null;
}

export interface Rejection {
  epic: string;
  id: number;
  step: string;
  phase: number | null;
  feedback: string;
  comments: PlanComment[];
}

export interface LessonRow {
  epic: string;
  phase: number;
  text: string;
  skill: string;
  apply: boolean;
  path: string;
}

export interface ReviewRow {
  date: string;
  path: string;
  groups: string[];
}

export interface FeedbackReport {
  epics: string[];
  steps: StepStats[];
  rejections: Rejection[];
  tags: Record<string, number>;
  prompts: Record<string, number>;
  lessons: LessonRow[];
  skill_rejections: Rejection[];
  events: Record<string, number>;
  reviews: ReviewRow[];
}

/** Proposal ids tagged in notes.md, by tag. */
export function tagsByProposal(notes: string): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const line of notes.split("\n")) {
    const m = NOTE_RE.exec(line);
    if (!m) continue;
    const id = Number(m[1]);
    out.set(id, [...(out.get(id) ?? []), m[2]]);
  }
  return out;
}

export function listReviews(home: string): ReviewRow[] {
  const dir = paths.reviews(home);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}(-\d+)?\.md$/.test(f))
    .sort()
    .map((f) => {
      const path = join(dir, f);
      const text = readFileSync(path, "utf8");
      const recurring = text.split(/^## /m).find((s) => s.startsWith("Recurring"));
      const groups = recurring ? [...recurring.matchAll(/^### (.+)$/gm)].map((m) => m[1].trim()) : [];
      return { date: f.slice(0, 10), path, groups };
    });
}

export function buildReport(home: string, epics: string[]): FeedbackReport {
  const stats = new Map<string, StepStats>();
  const rejections: Rejection[] = [];
  const tags: Record<string, number> = {};
  const prompts: Record<string, number> = {};
  const lessons: LessonRow[] = [];
  const skillRejections: Rejection[] = [];
  const events: Record<string, number> = {};

  for (const epic of epics) {
    const notes = paths.notes(home, epic);
    const notesText = existsSync(notes) ? readFileSync(notes, "utf8") : "";
    const tagsByP = tagsByProposal(notesText);
    for (const p of listProposals(home, epic)) {
      const s = stats.get(p.meta.step) ?? { step: p.meta.step, proposals: 0, approved: 0, rejected: 0, pending: 0, proposals_per_approval: null };
      s.proposals += 1;
      if (p.meta.outcome === "approved") s.approved += 1;
      if (p.meta.outcome === "rejected") s.rejected += 1;
      if (p.meta.outcome === "pending") s.pending += 1;
      stats.set(p.meta.step, s);
      if (p.meta.outcome === "rejected") {
        const feedback = p.meta.feedback ?? "";
        const rejection = { epic, id: p.meta.id, step: p.meta.step, phase: p.meta.phase, feedback, comments: parseComments(feedback) };
        rejections.push(rejection);
        if ((tagsByP.get(p.meta.id) ?? []).includes("skill")) skillRejections.push(rejection);
      }
    }
    if (notesText) for (const [tag, n] of Object.entries(parseTags(notesText))) tags[tag] = (tags[tag] ?? 0) + n;
    const promptsFile = paths.prompts(home, epic);
    if (existsSync(promptsFile)) {
      for (const line of readFileSync(promptsFile, "utf8").split("\n")) {
        if (!line.trim()) continue;
        const kind = (JSON.parse(line) as { kind?: string }).kind ?? "unknown";
        prompts[kind] = (prompts[kind] ?? 0) + 1;
      }
    }
    for (const e of listEvents(home, epic)) events[e.kind] = (events[e.kind] ?? 0) + 1;
    for (const r of listRetros(home, epic)) {
      for (const l of r.meta.lessons) lessons.push({ epic, phase: r.meta.phase, text: l.text, skill: l.skill, apply: l.apply, path: r.path });
    }
  }
  for (const s of stats.values()) s.proposals_per_approval = s.approved ? s.proposals / s.approved : null;
  const steps = [...stats.values()].sort((a, b) => a.step.localeCompare(b.step));
  const reviews = listReviews(home);
  return { epics, steps, rejections, tags, prompts, lessons, skill_rejections: skillRejections, events, reviews };
}
