import type { Epic, PhaseMeta, PrRef, ProposalMeta, SessionMarker } from "./types.ts";
import { EPIC_STATUSES, OUTCOMES, PHASE_KINDS, PHASE_STATUSES, PR_STATES, STEPS } from "./types.ts";

export class ValidationError extends Error {
  file: string;
  constructor(file: string, message: string) {
    super(`${file}: ${message}`);
    this.name = "ValidationError";
    this.file = file;
  }
}

type Obj = Record<string, unknown>;

export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
export const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

export function assertSlug(value: string, what: string): void {
  if (SLUG_RE.test(value)) return;
  throw new ValidationError(what, `'${value}' must be kebab-case: lowercase letters, digits, hyphens`);
}

function obj(v: unknown, file: string): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new ValidationError(file, "expected a mapping");
  return v as Obj;
}

function str(o: Obj, key: string, file: string): string {
  const v = o[key];
  if (typeof v !== "string" || v === "") throw new ValidationError(file, `${key} must be a non-empty string`);
  return v;
}

function nullableStr(o: Obj, key: string, file: string): string | null {
  const v = o[key];
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw new ValidationError(file, `${key} must be a string or null`);
  return v;
}

function int(o: Obj, key: string, file: string): number {
  const v = o[key];
  if (typeof v !== "number" || !Number.isInteger(v)) throw new ValidationError(file, `${key} must be an integer`);
  return v;
}

function nullableInt(o: Obj, key: string, file: string): number | null {
  const v = o[key];
  if (v === null || v === undefined) return null;
  return int(o, key, file);
}

function strList(o: Obj, key: string, file: string): string[] {
  const v = o[key] ?? [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new ValidationError(file, `${key} must be a list of strings`);
  return v as string[];
}

function oneOf<T extends string>(o: Obj, key: string, file: string, allowed: readonly T[]): T {
  const v = o[key];
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) {
    throw new ValidationError(file, `${key} must be one of ${allowed.join(", ")}`);
  }
  return v as T;
}

/** Checks a list of `owner/name` repos: at least one, each well formed, no duplicates. */
export function assertRepos(repos: string[], file: string): void {
  if (repos.length === 0) throw new ValidationError(file, "repos must list at least one owner/name");
  for (const r of repos) if (!REPO_RE.test(r)) throw new ValidationError(file, `repo must be owner/name, got '${r}'`);
  if (new Set(repos).size !== repos.length) throw new ValidationError(file, "repos must not repeat");
}

/**
 * Reads `repos`, or a legacy single `repo` from epics created before multi-repo epics.
 *
 * The legacy form is never written back: the next `writeEpic` stores `repos`.
 */
function epicRepos(o: Obj, file: string): string[] {
  const repos = o.repos === undefined && typeof o.repo === "string" ? [o.repo] : strList(o, "repos", file);
  assertRepos(repos, file);
  return repos;
}

export function validateEpic(v: unknown, file: string): Epic {
  const o = obj(v, file);
  const slug = str(o, "slug", file);
  assertSlug(slug, file);
  return {
    slug,
    title: str(o, "title", file),
    repos: epicRepos(o, file),
    status: oneOf(o, "status", file, EPIC_STATUSES),
    linear: strList(o, "linear", file),
    created: str(o, "created", file),
    updated: str(o, "updated", file),
    synced_at: nullableStr(o, "synced_at", file),
    shipped_at: nullableStr(o, "shipped_at", file),
    sessions: strList(o, "sessions", file),
  };
}

function validatePr(v: unknown, file: string): PrRef {
  const o = obj(v, file);
  return { url: str(o, "url", file), state: oneOf(o, "state", file, PR_STATES), merged_at: nullableStr(o, "merged_at", file) };
}

function phaseRepoField(o: Obj, file: string): string | null {
  const repo = nullableStr(o, "repo", file);
  if (repo !== null && !REPO_RE.test(repo)) throw new ValidationError(file, "repo must be owner/name");
  return repo;
}

export function validatePhaseMeta(v: unknown, file: string): PhaseMeta {
  const o = obj(v, file);
  const prs = o.prs ?? [];
  if (!Array.isArray(prs)) throw new ValidationError(file, "prs must be a list");
  const slug = str(o, "slug", file);
  assertSlug(slug, file);
  return {
    id: int(o, "id", file),
    slug,
    title: str(o, "title", file),
    status: oneOf(o, "status", file, PHASE_STATUSES),
    kind: o.kind === undefined ? "pr" : oneOf(o, "kind", file, PHASE_KINDS),
    repo: phaseRepoField(o, file),
    linear: strList(o, "linear", file),
    prs: prs.map((p) => validatePr(p, file)),
    shipped_at: nullableStr(o, "shipped_at", file),
  };
}

export function validateProposalMeta(v: unknown, file: string): ProposalMeta {
  const o = obj(v, file);
  const step = o.step === "unknown" ? "unknown" : oneOf(o, "step", file, STEPS);
  return {
    id: int(o, "id", file),
    step,
    phase: nullableInt(o, "phase", file),
    session: str(o, "session", file),
    tool_use: nullableStr(o, "tool_use", file),
    plan_file: nullableStr(o, "plan_file", file),
    created: str(o, "created", file),
    outcome: o.outcome === undefined ? "pending" : oneOf(o, "outcome", file, OUTCOMES),
    feedback: nullableStr(o, "feedback", file),
  };
}

const PROMPT_KINDS = ["planning", "implementation", "review"] as const;

export function validatePromptLine(
  v: unknown,
  file: string,
): { ts: string; session: string; kind: (typeof PROMPT_KINDS)[number]; phase: number | null; proposal: number | null; text: string } {
  const o = obj(v, file);
  return {
    ts: str(o, "ts", file),
    kind: oneOf(o, "kind", file, PROMPT_KINDS),
    session: str(o, "session", file),
    phase: nullableInt(o, "phase", file),
    proposal: nullableInt(o, "proposal", file),
    text: str(o, "text", file),
  };
}

export function validateMarker(v: unknown, file: string): SessionMarker {
  const o = obj(v, file);
  return {
    epic: str(o, "epic", file),
    phase: nullableInt(o, "phase", file),
    step: o.step === null || o.step === undefined ? null : oneOf(o, "step", file, STEPS),
    started: str(o, "started", file),
  };
}
