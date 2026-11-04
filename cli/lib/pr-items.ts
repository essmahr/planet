import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { PrFeedback } from "./gh.ts";
import { paths } from "./store.ts";

export type ItemKind = "review" | "comment" | "conversation" | "check";

export interface FeedbackItem {
  id: string;
  kind: ItemKind;
  pr: string;
  author: string;
  path: string | null;
  line: number | null;
  body: string;
  url: string;
  created_at: string | null;
}

export function feedbackItems(f: PrFeedback): FeedbackItem[] {
  const items: FeedbackItem[] = [];
  const base = { pr: f.url, path: null, line: null };
  for (const r of f.reviews) {
    if (r.author === f.author || r.body.trim() === "") continue;
    items.push({ ...base, id: r.id, kind: "review", author: r.author, body: r.body, url: r.url, created_at: r.created_at });
  }
  for (const c of f.comments) {
    if (c.author === f.author || c.resolved) continue;
    items.push({ ...base, id: c.id, kind: "comment", author: c.author, path: c.path, line: c.line, body: c.body, url: c.url, created_at: c.created_at });
  }
  for (const c of f.conversation) {
    if (c.author === f.author) continue;
    items.push({ ...base, id: c.id, kind: "conversation", author: c.author, body: c.body, url: c.url, created_at: c.created_at });
  }
  for (const c of f.failed_checks) {
    items.push({ ...base, id: `check:${c.name}@${f.head_sha}`, kind: "check", author: "ci", body: c.state, url: c.url, created_at: null });
  }
  return items;
}

export interface Marks {
  notified: string[];
  handled: string[];
  checked_at: string | null;
  pending: number;
}

export function readMarks(home: string, epic: string, phase: number): Marks {
  const file = paths.marks(home, epic, phase);
  const empty: Marks = { notified: [], handled: [], checked_at: null, pending: 0 };
  if (!existsSync(file)) return empty;
  return { ...empty, ...JSON.parse(readFileSync(file, "utf8")) };
}

function writeMarks(home: string, epic: string, phase: number, marks: Marks): void {
  const file = paths.marks(home, epic, phase);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(marks, null, 2)}\n`);
}

function union(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

export function addMarks(home: string, epic: string, phase: number, mark: "notified" | "handled", ids: string[]): Marks {
  const cur = readMarks(home, epic, phase);
  const next: Marks = {
    ...cur,
    notified: union(cur.notified, ids),
    handled: mark === "handled" ? union(cur.handled, ids) : cur.handled,
    checked_at: null,
  };
  writeMarks(home, epic, phase, next);
  return next;
}

export function recordCheck(home: string, epic: string, phase: number, pending: number, now: string): void {
  writeMarks(home, epic, phase, { ...readMarks(home, epic, phase), pending, checked_at: now });
}
