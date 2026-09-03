import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { parse, stringify } from "yaml";
import type { Epic, PhaseMeta } from "../schema/types.ts";
import { REPO_RE, ValidationError, assertSlug, validateEpic } from "../schema/validate.ts";
import { paths } from "./store.ts";

export class NotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFound";
  }
}

export interface NewEpicInput {
  slug: string;
  title: string;
  repo: string;
  linear?: string[];
}

export function readEpic(home: string, slug: string): Epic {
  const file = paths.epicFile(home, slug);
  if (!existsSync(file)) throw new NotFound(`no epic '${slug}'`);
  return validateEpic(parse(readFileSync(file, "utf8")), file);
}

export function writeEpic(home: string, epic: Epic): void {
  writeFileSync(paths.epicFile(home, epic.slug), stringify({ ...epic }));
}

export function createEpic(home: string, input: NewEpicInput, now: string): Epic {
  assertSlug(input.slug, "epic slug");
  if (!REPO_RE.test(input.repo)) throw new ValidationError("epic", "repo must be owner/name");
  if (existsSync(paths.epic(home, input.slug))) throw new Error(`epic '${input.slug}' already exists`);
  for (const dir of [paths.phases, paths.proposals, paths.feedback, paths.retros, paths.research]) {
    mkdirSync(dir(home, input.slug), { recursive: true });
  }
  const epic: Epic = {
    slug: input.slug,
    title: input.title,
    repo: input.repo,
    status: "planning",
    linear: input.linear ?? [],
    created: now,
    updated: now,
    synced_at: null,
    shipped_at: null,
    sessions: [],
  };
  writeEpic(home, epic);
  return epic;
}

export function listEpics(home: string): Epic[] {
  const root = paths.epics(home);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(paths.epicFile(home, d.name)))
    .map((d) => readEpic(home, d.name))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export const LINEAR_ID_RE = /\b([A-Za-z]{2,10}-\d+)\b/;

export function resolveEpics(epics: Epic[], text: string, phasesOf: (slug: string) => PhaseMeta[]): Epic[] {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  const exact = epics.filter((e) => e.slug === q);
  if (exact.length) return exact;
  const partial = epics.filter((e) => e.slug.includes(q) || e.title.toLowerCase().includes(q));
  if (partial.length) return partial;
  const m = LINEAR_ID_RE.exec(text);
  if (!m) return [];
  const id = m[1].toUpperCase();
  const has = (ids: string[]) => ids.some((x) => x.toUpperCase() === id);
  return epics.filter((e) => has(e.linear) || phasesOf(e.slug).some((p) => has(p.linear)));
}
