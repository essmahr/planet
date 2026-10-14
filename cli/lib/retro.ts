import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listEvents } from "./events.ts";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.ts";
import { readPhase } from "./phase.ts";
import { paths } from "./store.ts";

export const RETRO_SKILLS = ["planet-intake", "planet-scoping", "planet-phasing", "planet-phase-plan", "planet-implement", "not-planet"] as const;
export type RetroSkill = (typeof RETRO_SKILLS)[number];

export interface RetroLesson {
  text: string;
  skill: RetroSkill;
  apply: boolean;
  /** The earlier phase of this epic whose applied lesson this one repeats; a repeat is evidence the skill text did not bind. */
  repeat_of?: number;
}

export interface RetroMeta {
  phase: number;
  prs: string[];
  implemented_sha: string | null;
  head_sha: string | null;
  lessons: RetroLesson[];
  written: string;
}

export interface Retro {
  meta: RetroMeta;
  body: string;
  path: string;
}

export function retroFileName(id: number, slug: string): string {
  return `${String(id).padStart(2, "0")}-${slug}.md`;
}

function asRecord(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error(`${what} must be a mapping`);
  return v as Record<string, unknown>;
}

export function parseLessons(v: unknown): RetroLesson[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error("lessons must be a list");
  return v.map((item, i) => {
    const o = asRecord(item, `lessons[${i}]`);
    if (typeof o.text !== "string" || o.text.trim() === "") throw new Error(`lessons[${i}].text must be a non-empty string`);
    if (!(RETRO_SKILLS as readonly string[]).includes(String(o.skill))) throw new Error(`lessons[${i}].skill must be one of ${RETRO_SKILLS.join(", ")}`);
    if (typeof o.apply !== "boolean") throw new Error(`lessons[${i}].apply must be true or false`);
    const lesson: RetroLesson = { text: o.text, skill: o.skill as RetroSkill, apply: o.apply };
    if (o.repeat_of === undefined || o.repeat_of === null) return lesson;
    if (!Number.isInteger(o.repeat_of) || Number(o.repeat_of) < 1) throw new Error(`lessons[${i}].repeat_of must be a phase id`);
    return { ...lesson, repeat_of: Number(o.repeat_of) };
  });
}

/** Writes a retro from a drafted file: the draft's frontmatter must carry `phase` matching `id` and valid `lessons`; everything else is filled from the store. */
export function writeRetro(home: string, epic: string, id: number, draft: string, now: string, headSha: string | null): Retro {
  const phase = readPhase(home, epic, id);
  const { data, body } = parseFrontmatter(draft);
  const o = asRecord(data, "retro frontmatter");
  if (Number(o.phase) !== id) throw new Error(`retro frontmatter phase must be ${id}`);
  const lessons = parseLessons(o.lessons);
  const implemented = listEvents(home, epic, id).filter((e) => e.kind === "implemented" && e.sha);
  const meta: RetroMeta = {
    phase: id,
    prs: phase.meta.prs.map((p) => p.url),
    implemented_sha: implemented.length ? implemented[implemented.length - 1].sha : null,
    head_sha: headSha ?? (typeof o.head_sha === "string" ? o.head_sha : null),
    lessons,
    written: now,
  };
  mkdirSync(paths.retros(home, epic), { recursive: true });
  const path = paths.retroFile(home, epic, id, phase.meta.slug);
  const normalizedBody = body.endsWith("\n") ? body : `${body}\n`;
  writeFileSync(path, serializeFrontmatter({ ...meta }, normalizedBody));
  return { meta, body: normalizedBody, path };
}

export function listRetros(home: string, epic: string): Retro[] {
  const dir = paths.retros(home, epic);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{2}-[a-z0-9-]+\.md$/.test(f))
    .sort()
    .map((f) => {
      const path = join(dir, f);
      const { data, body } = parseFrontmatter(readFileSync(path, "utf8"));
      const o = asRecord(data, path);
      const meta: RetroMeta = {
        phase: Number(o.phase),
        prs: Array.isArray(o.prs) ? o.prs.map(String) : [],
        implemented_sha: typeof o.implemented_sha === "string" ? o.implemented_sha : null,
        head_sha: typeof o.head_sha === "string" ? o.head_sha : null,
        lessons: parseLessons(o.lessons),
        written: String(o.written ?? ""),
      };
      return { meta, body, path };
    });
}
