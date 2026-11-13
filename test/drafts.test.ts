import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ctx, tmpHome } from "./helpers.ts";
import { readDrafts, worktreePath } from "../cli/lib/drafts.ts";
import { gitIn } from "../cli/lib/repos.ts";

const WT = "/w/wt";
const CO = "/w/co";

test("worktreePath puts the PR number in the path", () =>
  assert.equal(worktreePath("/w/close-ui", "gql", 12, "https://github.com/o/r/pull/7"), "/w/.planet-worktrees/close-ui-gql-12-pr7"));

test("readDrafts splits trailers into drafted and pushed", () => {
  const git = (dir: string) => (dir === WT ? "u/C1\n\nu/C2\n" : "u/C9\n");
  assert.deepEqual(readDrafts(ctx(tmpHome(), { git }), CO, WT, "me/x"), { drafted: ["u/C1", "u/C2"], pushed: ["u/C9"] });
});

test("readDrafts deduplicates trailer values", () => {
  const git = () => "u/C1\nu/C1\n  u/C2  \n";
  assert.deepEqual(readDrafts(ctx(tmpHome(), { git }), CO, WT, "me/x").drafted, ["u/C1", "u/C2"]);
});

test("a missing worktree or ref reads as no drafts", () =>
  assert.deepEqual(readDrafts(ctx(tmpHome()), CO, WT, "me/x"), { drafted: [], pushed: [] }));

test("readDrafts reads a Feedback trailer from a real repo", () => {
  const dir = mkdtempSync(join(tmpdir(), "planet-drafts-"));
  const run = (...args: string[]) =>
    execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { stdio: "ignore" });
  run("init", "-q");
  run("commit", "-q", "--allow-empty", "-m", "base");
  run("update-ref", "refs/remotes/origin/me/x", "HEAD");
  run("commit", "-q", "--allow-empty", "-m", "fix it", "-m", "Feedback: u/C1");
  assert.deepEqual(readDrafts(ctx(tmpHome(), { git: gitIn }), dir, dir, "me/x"), { drafted: ["u/C1"], pushed: [] });
});
