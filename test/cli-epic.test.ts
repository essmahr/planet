import { test } from "node:test";
import assert from "node:assert/strict";
import { ctx, run, tmpHome } from "./helpers.ts";
import { readEpic } from "../cli/lib/epic.ts";
import { git } from "../cli/lib/store.ts";
import type { EpicView } from "../cli/lib/view.ts";

test("planet with no command prints usage; unknown command exits 2", async () => {
  const home = tmpHome();
  const usage = await run([], ctx(home));
  assert.equal(usage.code, 0);
  assert.match(usage.stdout, /usage: planet/);
  const bad = await run(["frobnicate"], ctx(home));
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /unknown command 'frobnicate'/);
});

test("epic new creates and commits; errors are one line or json", async () => {
  const home = tmpHome();
  const r = await run(["epic", "new", "gql", "--title", "GQL migration", "--repo", "closeio/close-ui", "--linear", "CRM-1", "--linear", "CRM-2"], ctx(home));
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "created epic gql\n");
  assert.deepEqual(readEpic(home, "gql").linear, ["CRM-1", "CRM-2"]);
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "gql: create epic");

  const dup = await run(["epic", "new", "gql", "--title", "x", "--repo", "o/r"], ctx(home));
  assert.equal(dup.code, 1);
  assert.equal(dup.stderr, "planet: epic 'gql' already exists\n");

  const dupJson = await run(["epic", "new", "gql", "--title", "x", "--repo", "o/r", "--json"], ctx(home));
  assert.equal(dupJson.code, 1);
  assert.deepEqual(dupJson.json, { error: "epic 'gql' already exists" });

  const missing = await run(["epic", "new", "other", "--repo", "o/r"], ctx(home));
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /missing --title/);
});

test("epic set changes status, linear, title with manual transitions only", async () => {
  const home = tmpHome();
  await run(["epic", "new", "gql", "--title", "GQL", "--repo", "o/r"], ctx(home));
  const r = await run(["epic", "set", "gql", "--status", "paused", "--title", "GQL v2", "--json"], ctx(home));
  assert.equal(r.code, 0);
  const epic = readEpic(home, "gql");
  assert.equal(epic.status, "paused");
  assert.equal(epic.title, "GQL v2");
  const bad = await run(["epic", "set", "gql", "--status", "shipped"], ctx(home));
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /--status must be paused, abandoned, or active/);
});

test("epic show returns frontmatter and paths, never bodies", async () => {
  const home = tmpHome();
  await run(["epic", "new", "gql", "--title", "GQL", "--repo", "o/r"], ctx(home));
  const r = await run(["epic", "show", "gql", "--json"], ctx(home));
  const view = r.json as EpicView;
  assert.equal(view.epic.slug, "gql");
  assert.deepEqual(view.phases, []);
  assert.equal(view.paths.plan, null);
  assert.equal(view.paths.latest_proposal, null);
  assert.match(view.paths.dir, /epics\/gql$/);
  assert.equal(JSON.stringify(view).includes('"body"'), false);
});

test("epic resolve returns candidates", async () => {
  const home = tmpHome();
  await run(["epic", "new", "gql-migration", "--title", "GQL migration", "--repo", "o/r"], ctx(home));
  await run(["epic", "new", "gql-cleanup", "--title", "Cleanup", "--repo", "o/r"], ctx(home));
  const one = await run(["epic", "resolve", "clean", "--json"], ctx(home));
  assert.deepEqual((one.json as { candidates: string[] }).candidates, ["gql-cleanup"]);
  const many = await run(["epic", "resolve", "gql"], ctx(home));
  assert.equal(many.stdout, "gql-cleanup\ngql-migration\n");
  const none = await run(["epic", "resolve", "zzz"], ctx(home));
  assert.equal(none.stdout, "no epic matches 'zzz'\n");
});
