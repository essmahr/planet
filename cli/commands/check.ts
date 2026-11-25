import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Command } from "../lib/context.ts";
import { parseFrontmatter } from "../lib/frontmatter.ts";
import { graphErrors } from "../lib/graph.ts";
import { paths } from "../lib/store.ts";
import type { PhaseMeta } from "../schema/types.ts";
import { validateEpic, validateMarker, validatePhaseMeta, validatePromptLine, validateProposalMeta } from "../schema/validate.ts";

interface CheckError {
  file: string;
  message: string;
}

function attempt<T>(errors: CheckError[], file: string, fn: () => T): T | null {
  try {
    return fn();
  } catch (err) {
    errors.push({ file, message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

function listFiles(dir: string, pattern: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => pattern.test(f)).sort().map((f) => join(dir, f));
}

export function checkStore(home: string): CheckError[] {
  const errors: CheckError[] = [];
  const epicsDir = paths.epics(home);
  const slugs = existsSync(epicsDir) ? readdirSync(epicsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
  for (const slug of slugs) {
    const epicFile = paths.epicFile(home, slug);
    const epic = attempt(errors, epicFile, () => validateEpic(parseYaml(readFileSync(epicFile, "utf8")), epicFile));
    const phaseFiles = listFiles(paths.phases(home, slug), /^\d{2,}-[a-z0-9-]+\.md$/);
    const metas: PhaseMeta[] = [];
    for (const file of phaseFiles) {
      attempt(errors, file, () => metas.push(validatePhaseMeta(parseFrontmatter(readFileSync(file, "utf8")).data, file)));
    }
    if (metas.length === phaseFiles.length) {
      for (const message of graphErrors(metas)) errors.push({ file: paths.phases(home, slug), message: `${slug}: ${message}` });
    }
    if (epic !== null) {
      const milestoneIds = new Set(epic.milestones.map((m) => m.id));
      for (const p of metas) {
        if (p.milestone !== null && !milestoneIds.has(p.milestone)) errors.push({ file: paths.phases(home, slug), message: `${slug}: phase ${p.id} points at missing milestone ${p.milestone}` });
      }
    }
    for (const file of listFiles(paths.proposals(home, slug), /^\d{3,}-[a-z-]+\.md$/)) {
      attempt(errors, file, () => validateProposalMeta(parseFrontmatter(readFileSync(file, "utf8")).data, file));
    }
    const promptsFile = paths.prompts(home, slug);
    if (existsSync(promptsFile)) {
      const lines = readFileSync(promptsFile, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!line.trim()) return;
        const label = `${promptsFile}:${i + 1}`;
        attempt(errors, label, () => validatePromptLine(JSON.parse(line), label));
      });
    }
  }
  for (const file of listFiles(paths.sessions(home), /^[^.]/)) {
    attempt(errors, file, () => validateMarker(JSON.parse(readFileSync(file, "utf8")), file));
  }
  return errors;
}

export const checkCommand: Command = async (_args, ctx) => {
  const errors = checkStore(ctx.home);
  return {
    json: { ok: errors.length === 0, errors },
    text: errors.length ? errors.map((e) => `${e.file}: ${e.message}`).join("\n") : "store ok",
    exitCode: errors.length ? 1 : 0,
  };
};
