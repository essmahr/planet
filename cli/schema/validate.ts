import type { Epic, PhaseMeta, PrRef, ProposalMeta, SessionMarker } from "./types.ts";
import { EPIC_STATUSES, OUTCOMES, PHASE_STATUSES, PR_STATES, STEPS } from "./types.ts";

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

function bool(o: Obj, key: string, file: string, fallback: boolean): boolean {
  const v = o[key];
  if (v === undefined) return fallback;
  if (typeof v !== "boolean") throw new ValidationError(file, `${key} must be a boolean`);
  return v;
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

export function validateEpic(v: unknown, file: string): Epic {
  const o = obj(v, file);
  const slug = str(o, "slug", file);
  assertSlug(slug, file);
  const repo = str(o, "repo", file);
  if (!REPO_RE.test(repo)) throw new ValidationError(file, "repo must be owner/name");
  return {
    slug,
    title: str(o, "title", file),
    repo,
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
    edited: bool(o, "edited", file, false),
    feedback: nullableStr(o, "feedback", file),
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
