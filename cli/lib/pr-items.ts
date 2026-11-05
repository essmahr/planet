import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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
    items.push({ ...base, id: `check:${encodeURIComponent(c.name)}@${f.head_sha}`, kind: "check", author: "ci", body: c.state, url: c.url, created_at: null });
  }
  return items;
}

export interface Owner {
  session: string;
  since: string;
}

export interface Marks {
  notified: string[];
  handled: string[];
  checked_at: string | null;
  pending: number;
  awaiting_reply: string | null;
  owner: Owner | null;
}

/** The marks file, with an `awaiting_reply` from before replies were tied to a session read as none. */
export function readMarks(home: string, epic: string, phase: number): Marks {
  const file = paths.marks(home, epic, phase);
  const empty: Marks = { notified: [], handled: [], checked_at: null, pending: 0, awaiting_reply: null, owner: null };
  if (!existsSync(file)) return empty;
  const marks: Marks = { ...empty, ...JSON.parse(readFileSync(file, "utf8")) };
  if (typeof marks.awaiting_reply !== "string") marks.awaiting_reply = null;
  return marks;
}

const LOCK_WAIT_MS = 2000;
const LOCK_STALE_MS = 10_000;

function takeLock(lock: string): void {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      closeSync(openSync(lock, "wx"));
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
    const held = statSync(lock, { throwIfNoEntry: false });
    if (held && Date.now() - held.mtimeMs > LOCK_STALE_MS) rmSync(lock, { force: true });
    if (Date.now() > deadline) throw new Error(`marks file locked: ${lock}`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
  }
}

/**
 * Reads the marks file, applies `change`, and writes it back, all under a lock file.
 *
 * Sessions, their hooks, and watchers all write this file, so an unlocked read-modify-write could drop another writer's ids or owner.
 */
export function updateMarks(home: string, epic: string, phase: number, change: (marks: Marks) => Marks): Marks {
  const file = paths.marks(home, epic, phase);
  const lock = paths.marksLock(home, epic, phase);
  mkdirSync(dirname(file), { recursive: true });
  mkdirSync(dirname(lock), { recursive: true });
  takeLock(lock);
  try {
    const next = change(readMarks(home, epic, phase));
    writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
    return next;
  } finally {
    rmSync(lock, { force: true });
  }
}

function union(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

export function addMarks(home: string, epic: string, phase: number, mark: "notified" | "handled", ids: string[]): Marks {
  return updateMarks(home, epic, phase, (cur) => ({
    ...cur,
    notified: union(cur.notified, ids),
    handled: mark === "handled" ? union(cur.handled, ids) : cur.handled,
    checked_at: null,
  }));
}

export function recordCheck(home: string, epic: string, phase: number, pending: number, now: string): void {
  updateMarks(home, epic, phase, (cur) => ({ ...cur, pending, checked_at: now }));
}

export function setAwaitingReply(home: string, epic: string, phase: number, session: string | null): void {
  updateMarks(home, epic, phase, (cur) => ({ ...cur, awaiting_reply: session }));
}

/** The phase's owner while that session's marker file exists. A crashed or cleared session leaves no live owner. */
export function liveOwner(home: string, marks: Marks): Owner | null {
  if (!marks.owner) return null;
  return existsSync(paths.session(home, marks.owner.session)) ? marks.owner : null;
}

export type ClaimResult = { ok: true; owner: Owner } | { ok: false; owner: Owner };

/** Makes `session` the phase's feedback owner unless another live session owns it. */
export function claimOwner(home: string, epic: string, phase: number, session: string, now: string): ClaimResult {
  let result!: ClaimResult;
  updateMarks(home, epic, phase, (cur) => {
    const owner = liveOwner(home, cur);
    if (owner && owner.session !== session) {
      result = { ok: false, owner };
      return cur;
    }
    const next = owner ?? { session, since: now };
    result = { ok: true, owner: next };
    return { ...cur, owner: next };
  });
  return result;
}

/** Makes `session` the phase's feedback owner whoever held it, and returns the previous live owner. */
export function takeOwner(home: string, epic: string, phase: number, session: string, now: string): Owner | null {
  let previous: Owner | null = null;
  updateMarks(home, epic, phase, (cur) => {
    previous = liveOwner(home, cur);
    if (previous?.session === session) return cur;
    return { ...cur, owner: { session, since: now } };
  });
  return previous;
}

export function releaseOwner(home: string, epic: string, phase: number, session: string): boolean {
  if (readMarks(home, epic, phase).owner?.session !== session) return false;
  let released = false;
  updateMarks(home, epic, phase, (cur) => {
    if (cur.owner?.session !== session) return cur;
    released = true;
    return { ...cur, owner: null };
  });
  return released;
}
