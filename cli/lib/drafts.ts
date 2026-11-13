import { basename, dirname, join } from "node:path";
import type { Ctx } from "./context.ts";
import { PR_URL_RE } from "./link.ts";
import type { Drafts } from "./signals.ts";

const TRAILERS = "--format=%(trailers:key=Feedback,valueonly)";

/** Where a PR's fix worktree lives, next to its main checkout. */
export function worktreePath(checkout: string, slug: string, phase: number, prUrl: string): string {
  const number = PR_URL_RE.exec(prUrl)?.[2];
  return join(dirname(checkout), ".planet-worktrees", `${basename(checkout)}-${slug}-${phase}-pr${number}`);
}

function trailerValues(output: string | null): string[] {
  if (!output) return [];
  const values = output.split("\n").map((line) => line.trim()).filter(Boolean);
  return [...new Set(values)];
}

/**
 * Comment urls named by `Feedback` trailers: on unpushed commits in the worktree
 * (drafted), and on the last 200 commits of the pushed branch (pushed).
 */
export function readDrafts(ctx: Ctx, checkout: string, worktree: string, headRef: string): Drafts {
  return {
    drafted: trailerValues(ctx.git(worktree, ["log", `origin/${headRef}..HEAD`, TRAILERS])),
    pushed: trailerValues(ctx.git(checkout, ["log", "-200", `origin/${headRef}`, TRAILERS])),
  };
}
