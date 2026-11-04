import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Ctx } from "../cli/lib/context.ts";
import type { Gh, PrCheck, PrComment, PrConversationComment, PrFeedback, PrFile, PrInfo, PrReview } from "../cli/lib/gh.ts";
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

export const PR = "https://github.com/o/r/pull/7";
export const BASE: PrFeedback = { url: PR, state: "open", author: "me", head_ref: "me/x", head_sha: "sha1", reviews: [], comments: [], conversation: [], failed_checks: [] };
export const LINT: PrCheck = { name: "lint", state: "FAILURE", url: "u/lint" };

export const review = (id: string, author: string, body: string): PrReview => ({ id, author, state: "COMMENTED", body, created_at: NOW, url: `u/${id}` });
export const comment = (id: string, author: string, resolved: boolean): PrComment => ({ id, author, path: "a.ts", line: 3, body: "nit", resolved, created_at: NOW, url: `u/${id}` });
export const convo = (id: string, author: string): PrConversationComment => ({ id, author, body: "hello", created_at: NOW, url: `u/${id}` });

export type FakeGh = Gh & { calls: string[] };

export function fakeGh(states: Record<string, PrInfo> = {}, files: Record<string, PrFile[]> = {}, unavailable = false, failWith?: Error, feedback: Record<string, PrFeedback | (PrFeedback | Error)[]> = {}): FakeGh {
  const calls: string[] = [];
  const polled: Record<string, number> = {};
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
    async prFeedback(url, _opts) {
      calls.push(`prFeedback:${url}`);
      if (unavailable) throw new GhUnavailable("offline");
      const f = feedback[url];
      if (!f) throw new Error(`no feedback stub for ${url}`);
      if (!Array.isArray(f)) return f;
      const i = polled[url] ?? 0;
      polled[url] = i + 1;
      const entry = f[Math.min(i, f.length - 1)];
      if (entry instanceof Error) throw entry;
      return entry;
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
    sleep: async () => {},
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
