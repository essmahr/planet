import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Command } from "../lib/context.ts";
import { parseFrontmatter } from "../lib/frontmatter.ts";
import { paths } from "../lib/store.ts";
import { validateEpic, validateMarker, validatePhaseMeta, validateProposalMeta } from "../schema/validate.ts";

interface CheckError {
  file: string;
  message: string;
}

function attempt(errors: CheckError[], file: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    errors.push({ file, message: err instanceof Error ? err.message : String(err) });
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
    attempt(errors, epicFile, () => validateEpic(parseYaml(readFileSync(epicFile, "utf8")), epicFile));
    for (const file of listFiles(paths.phases(home, slug), /^\d{2}-[a-z0-9-]+\.md$/)) {
      attempt(errors, file, () => validatePhaseMeta(parseFrontmatter(readFileSync(file, "utf8")).data, file));
    }
    for (const file of listFiles(paths.proposals(home, slug), /^\d{3}-[a-z-]+\.md$/)) {
      attempt(errors, file, () => validateProposalMeta(parseFrontmatter(readFileSync(file, "utf8")).data, file));
    }
  }
  for (const file of listFiles(paths.sessions(home), /./)) {
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
