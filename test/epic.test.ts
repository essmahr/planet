import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NOW, tmpHome } from "./helpers.ts";
import { createEpic, listEpics, readEpic, resolveEpics, writeEpic, NotFound } from "../cli/lib/epic.ts";
import type { PhaseMeta } from "../cli/schema/types.ts";

const input = { slug: "gql-migration", title: "GQL migration", repo: "closeio/close-ui", linear: ["CRM-123"] };

test("createEpic writes epic.yaml and the directory layout", () => {
  const home = tmpHome();
  const epic = createEpic(home, input, NOW);
  assert.equal(epic.status, "planning");
  assert.equal(epic.created, NOW);
  for (const d of ["phases", "proposals", "feedback", "retros", "research"]) {
    assert.ok(existsSync(join(home, "epics", "gql-migration", d)), d);
  }
  assert.ok(!existsSync(join(home, "epics", "gql-migration", "plan.md")), "plan.md is not created");
  assert.deepEqual(readEpic(home, "gql-migration"), epic);
});

test("createEpic rejects duplicates and bad input", () => {
  const home = tmpHome();
  createEpic(home, input, NOW);
  assert.throws(() => createEpic(home, input, NOW), /already exists/);
  assert.throws(() => createEpic(home, { ...input, slug: "Bad Slug" }, NOW), /kebab-case/);
  assert.throws(() => createEpic(home, { ...input, slug: "x", repo: "nope" }, NOW), /owner\/name/);
});

test("readEpic throws NotFound; writeEpic round trips", () => {
  const home = tmpHome();
  assert.throws(() => readEpic(home, "missing"), NotFound);
  const epic = createEpic(home, input, NOW);
  epic.status = "paused";
  writeEpic(home, epic);
  assert.equal(readEpic(home, "gql-migration").status, "paused");
});

test("listEpics sorts by slug", () => {
  const home = tmpHome();
  createEpic(home, { ...input, slug: "zeta" }, NOW);
  createEpic(home, { ...input, slug: "alpha" }, NOW);
  assert.deepEqual(listEpics(home).map((e) => e.slug), ["alpha", "zeta"]);
});

test("resolveEpics: exact slug, then substring, then linear id", () => {
  const home = tmpHome();
  const a = createEpic(home, { slug: "gql-migration", title: "GQL migration", repo: "o/r", linear: ["CRM-1"] }, NOW);
  const b = createEpic(home, { slug: "gql-cleanup", title: "Remove REST", repo: "o/r" }, NOW);
  const phasesOf = (slug: string): PhaseMeta[] => slug === "gql-cleanup"
    ? [{ id: 1, slug: "p", title: "P", status: "draft", linear: ["CRM-99"], prs: [], shipped_at: null }]
    : [];
  assert.deepEqual(resolveEpics([a, b], "gql-cleanup", phasesOf).map((e) => e.slug), ["gql-cleanup"]);
  assert.deepEqual(resolveEpics([a, b], "GQL", phasesOf).map((e) => e.slug), ["gql-migration", "gql-cleanup"]);
  assert.deepEqual(resolveEpics([a, b], "rest", phasesOf).map((e) => e.slug), ["gql-cleanup"]);
  assert.deepEqual(resolveEpics([a, b], "crm-1", phasesOf).map((e) => e.slug), ["gql-migration"]);
  assert.deepEqual(resolveEpics([a, b], "https://linear.app/close/issue/CRM-99/thing", phasesOf).map((e) => e.slug), ["gql-cleanup"]);
  assert.deepEqual(resolveEpics([a, b], "nothing here", phasesOf), []);
  assert.deepEqual(resolveEpics([a, b], "   ", phasesOf), []);
});
