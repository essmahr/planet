import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpHome } from "./helpers.ts";
import { planetHome, git, commit, paths } from "../cli/lib/store.ts";

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

test("commit stages and commits only when dirty", () => {
  const home = tmpHome();
  assert.equal(commit(home, "nothing"), false);
  writeFileSync(join(home, "note.txt"), "hi\n");
  assert.equal(commit(home, "add note"), true);
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "add note");
  assert.equal(commit(home, "again"), false);
});

test("paths compose under the epic directory", () => {
  assert.equal(paths.epicFile("/h", "gql"), "/h/epics/gql/epic.yaml");
  assert.equal(paths.prompts("/h", "gql"), "/h/epics/gql/feedback/prompts.jsonl");
  assert.equal(paths.session("/h", "s1"), "/h/sessions/s1");
});
