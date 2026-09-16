import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpHome } from "./helpers.ts";
import { planetHome, git, commit, ensureStore, paths, withLockRetry } from "../cli/lib/store.ts";

test("planetHome prefers PLANET_HOME", () => {
  assert.equal(planetHome({ PLANET_HOME: "/x/store" }), "/x/store");
  assert.match(planetHome({}), /\/\.planet$/);
});

test("ensureStore creates the layout and a git repo once", () => {
  const home = tmpHome();
  assert.ok(existsSync(join(home, "epics")));
  assert.ok(existsSync(join(home, "sessions")));
  assert.ok(existsSync(join(home, ".git")));
  assert.equal(git(home, ["rev-parse", "--is-inside-work-tree"]).trim(), "true");
});

test("ensureStore writes a .gitignore covering hook.log and .DS_Store", () => {
  const home = tmpHome();
  const gitignore = join(home, ".gitignore");
  assert.ok(existsSync(gitignore));
  const contents = readFileSync(gitignore, "utf8");
  assert.match(contents, /^hook\.log$/m);
  assert.match(contents, /^\.DS_Store$/m);
});

test("hook.log is ignored: writing it alone leaves nothing to commit", () => {
  const home = tmpHome();
  writeFileSync(join(home, "hook.log"), "boom\n");
  assert.equal(commit(home, "x"), false);
});

test("ensureStore does not overwrite a modified .gitignore", () => {
  const home = tmpHome();
  const gitignore = join(home, ".gitignore");
  writeFileSync(gitignore, "custom\n");
  ensureStore(home);
  assert.equal(readFileSync(gitignore, "utf8"), "custom\n");
});

test("commit stages and commits only when dirty", () => {
  const home = tmpHome();
  assert.equal(commit(home, "nothing"), false);
  writeFileSync(join(home, "note.txt"), "hi\n");
  assert.equal(commit(home, "add note"), true);
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "add note");
  assert.equal(commit(home, "again"), false);
});

test("commit waits out another process holding index.lock", () => {
  const home = tmpHome();
  writeFileSync(join(home, "note.txt"), "hi\n");
  const lock = join(home, ".git", "index.lock");
  writeFileSync(lock, "");
  spawn("sh", ["-c", `sleep 0.25 && rm -f "${lock}"`], { detached: true, stdio: "ignore" }).unref();
  assert.equal(commit(home, "add note"), true);
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "add note");
});

test("withLockRetry gives up after the retry budget and rethrows other errors at once", () => {
  let calls = 0;
  assert.throws(
    () => withLockRetry(() => { calls += 1; throw Object.assign(new Error("fatal: Unable to create '.git/index.lock': File exists."), { stderr: "index.lock" }); }, 2, 1),
    /index\.lock/,
  );
  assert.equal(calls, 3);
  calls = 0;
  assert.throws(() => withLockRetry(() => { calls += 1; throw new Error("boom"); }, 2, 1), /boom/);
  assert.equal(calls, 1);
});

test("paths compose under the epic directory", () => {
  assert.equal(paths.epicFile("/h", "gql"), "/h/epics/gql/epic.yaml");
  assert.equal(paths.prompts("/h", "gql"), "/h/epics/gql/feedback/prompts.jsonl");
  assert.equal(paths.session("/h", "s1"), "/h/sessions/s1");
});
