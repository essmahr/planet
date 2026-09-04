import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Ctx } from "../cli/lib/context.ts";
import type { Gh, PrFile, PrInfo } from "../cli/lib/gh.ts";
import { GhUnavailable } from "../cli/lib/gh.ts";
import { ensureStore } from "../cli/lib/store.ts";
import { main } from "../cli/planet.ts";

export const NOW = "2026-09-03T15:00:00.000Z";
export const SESSION = "sess-1";

export function tmpHome(): string {
  const home = mkdtempSync(join(tmpdir(), "planet-"));
  ensureStore(home);
  return home;
}

export type FakeGh = Gh & { calls: string[] };

export function fakeGh(states: Record<string, PrInfo> = {}, files: Record<string, PrFile[]> = {}, unavailable = false, failWith?: Error): FakeGh {
  const calls: string[] = [];
  return {
    calls,
    async prStates(urls) {
      calls.push(`prStates:${urls.length}`);
      if (failWith) throw failWith;
      if (unavailable) throw new GhUnavailable("offline");
      return urls.filter((u) => states[u]).map((u) => states[u]);
    },
    async prFiles(url) {
      calls.push(`prFiles:${url}`);
      if (unavailable) throw new GhUnavailable("offline");
      return files[url] ?? [];
    },
  };
}

export function ctx(home: string, overrides: Partial<Ctx> = {}): Ctx {
  return {
    home,
    gh: fakeGh(),
    now: () => NOW,
    env: { CLAUDE_CODE_SESSION_ID: SESSION },
    stdin: () => "",
    ...overrides,
  };
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  json: unknown;
}

export async function run(argv: string[], c: Ctx): Promise<RunResult> {
  let stdout = "";
  let stderr = "";
  const code = await main(argv, c, {
    stdout: (s) => { stdout += s; },
    stderr: (s) => { stderr += s; },
  });
  let json: unknown = null;
  if (argv.includes("--json")) {
    try { json = JSON.parse(stdout); } catch { json = null; }
  }
  return { code, stdout, stderr, json };
}
