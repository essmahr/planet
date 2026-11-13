import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BASE, LINT, NOW, PR, comment, ctx, fakeGh, run, tmpHome } from "./helpers.ts";
import type { PrFeedback, Reaction } from "../cli/lib/gh.ts";
import { worktreePath } from "../cli/lib/drafts.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { linkPrs } from "../cli/lib/link.ts";
import { newPhases } from "../cli/lib/phase.ts";
import { recordCheckout } from "../cli/lib/repos.ts";

const OTHER = "https://github.com/o/r/pull/8";

function setup(urls: string[] = [PR], registerCheckout = false): { home: string; checkout: string | null } {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repos: ["o/r"] }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  linkPrs(home, "e", 1, urls, NOW, "sess-9");
  if (!registerCheckout) return { home, checkout: null };
  const dir = join(realpathSync(mkdtempSync(join(tmpdir(), "planet-ws-"))), "r");
  mkdirSync(dir);
  execFileSync("git", ["-C", dir, "init", "-q"]);
  execFileSync("git", ["-C", dir, "remote", "add", "origin", "https://github.com/o/r.git"]);
  return { home, checkout: recordCheckout(home, dir).path };
}

const reacted = (id: string, reactions: Reaction[]) => ({ ...comment(id, "ana", false), viewer_reactions: reactions });

function feedback(overrides: Partial<PrFeedback> = {}): PrFeedback {
  return { ...BASE, ...overrides };
}

interface Json {
  phase: number;
  prs: { url: string; state: string; session: string | null; head_ref: string; head_sha: string; checkout: string | null; worktree: string | null; failed_checks: unknown[]; signals: { id: string; signal: string; state: string }[]; orphans: string[] }[];
}

test("pr signals lists the viewer's signals with their draft state", async () => {
  const { home, checkout } = setup([PR], true);
  const worktree = worktreePath(checkout!, "e", 1, PR);
  const fb = feedback({ comments: [reacted("C1", ["THUMBS_UP"]), reacted("C2", ["EYES"])] });
  const gh = fakeGh({}, {}, false, undefined, { [PR]: fb });
  const git = (dir: string) => (dir === worktree ? "u/C1" : null);
  const r = await run(["pr", "signals", "e", "1", "--json"], ctx(home, { gh, git }));
  assert.equal(r.code, 0);
  const j = r.json as Json;
  assert.equal(j.phase, 1);
  assert.deepEqual(j.prs[0].signals.map((s) => [s.id, s.signal, s.state]), [["C1", "do", "drafted"], ["C2", "weigh", "open"]]);
  assert.equal(j.prs[0].url, PR);
  assert.equal(j.prs[0].state, "open");
  assert.equal(j.prs[0].session, "sess-9");
  assert.equal(j.prs[0].head_ref, "me/x");
  assert.equal(j.prs[0].head_sha, "sha1");
  assert.equal(j.prs[0].checkout, checkout);
  assert.equal(j.prs[0].worktree, worktree);
  assert.deepEqual(j.prs[0].orphans, []);
});

test("pr signals reports failing checks without making them signals", async () => {
  const { home } = setup();
  const gh = fakeGh({}, {}, false, undefined, { [PR]: feedback({ failed_checks: [LINT] }) });
  const r = await run(["pr", "signals", "e", "1", "--json"], ctx(home, { gh }));
  const j = r.json as Json;
  assert.deepEqual(j.prs[0].failed_checks, [{ name: "lint", url: "u/lint" }]);
  assert.deepEqual(j.prs[0].signals, []);
});

test("pr signals leaves out a merged PR", async () => {
  const { home } = setup();
  const gh = fakeGh({}, {}, false, undefined, { [PR]: feedback({ state: "merged", comments: [reacted("C1", ["THUMBS_UP"])] }) });
  const r = await run(["pr", "signals", "e", "1", "--json"], ctx(home, { gh }));
  assert.deepEqual((r.json as Json).prs, []);
  assert.equal((await run(["pr", "signals", "e", "1"], ctx(home, { gh }))).stdout.trim(), "no signals");
});

test("pr signals has null checkout and worktree and no drafts when no checkout is found", async () => {
  const { home } = setup();
  const gh = fakeGh({}, {}, false, undefined, { [PR]: feedback({ comments: [reacted("C1", ["THUMBS_UP"])] }) });
  const git = () => "u/C1";
  const r = await run(["pr", "signals", "e", "1", "--json"], ctx(home, { gh, git }));
  const pr = (r.json as Json).prs[0];
  assert.equal(pr.checkout, null);
  assert.equal(pr.worktree, null);
  assert.deepEqual(pr.signals.map((s) => [s.id, s.state]), [["C1", "open"]]);
});

test("pr signals text prints one line per signal", async () => {
  const { home } = setup();
  const body = "x".repeat(80);
  const gh = fakeGh({}, {}, false, undefined, { [PR]: feedback({ comments: [{ ...reacted("C1", ["THUMBS_UP"]), body }], conversation: [{ id: "V1", author: "bo", body: "hello", created_at: NOW, url: "u/V1", viewer_reactions: ["EYES"] }] }) });
  const r = await run(["pr", "signals", "e", "1"], ctx(home, { gh }));
  assert.deepEqual(r.stdout.trim().split("\n"), [`do open ana a.ts:3 ${"x".repeat(60)}`, "weigh open bo conversation hello"]);
});

test("pr signals reads every linked pr", async () => {
  const { home } = setup([PR, OTHER]);
  const gh = fakeGh({}, {}, false, undefined, { [PR]: feedback(), [OTHER]: feedback({ url: OTHER, comments: [reacted("C5", ["EYES"])] }) });
  const r = await run(["pr", "signals", "e", "1", "--json"], ctx(home, { gh }));
  const j = r.json as Json;
  assert.deepEqual(j.prs.map((p) => [p.url, p.signals.length]), [[PR, 0], [OTHER, 1]]);
});

test("pr react adds before it removes", async () => {
  const gh = fakeGh();
  const r = await run(["pr", "react", "C1", "--add", "rocket", "--remove", "thumbs_up"], ctx(tmpHome(), { gh }));
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), "reactions updated");
  assert.deepEqual(gh.calls, ["react:+ROCKET:C1", "react:-THUMBS_UP:C1"]);
});

test("pr react rejects an unknown reaction", async () => {
  const gh = fakeGh();
  const r = await run(["pr", "react", "C1", "--add", "heart"], ctx(tmpHome(), { gh }));
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /unknown reaction 'heart'/);
  assert.deepEqual(gh.calls, []);
});

test("pr react needs --add or --remove", async () => {
  const gh = fakeGh();
  const r = await run(["pr", "react", "C1"], ctx(tmpHome(), { gh }));
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /--add or --remove/);
  assert.deepEqual(gh.calls, []);
});
