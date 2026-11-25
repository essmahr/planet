import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NOW, tmpHome } from "./helpers.ts";
import { createEpic, listEpics, readEpic, resolveEpics, writeEpic, NotFound } from "../cli/lib/epic.ts";
import type { PhaseMeta } from "../cli/schema/types.ts";
import { newMilestone } from "../cli/lib/milestone.ts";
import { newPhases, setPhaseStatus } from "../cli/lib/phase.ts";
import { epicBrief, epicView } from "../cli/lib/view.ts";

const input = { slug: "gql-migration", title: "GQL migration", repos: ["closeio/close-ui"], linear: ["CRM-123"] };

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
  assert.throws(() => createEpic(home, { ...input, slug: "x", repos: ["nope"] }, NOW), /owner\/name/);
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
  const a = createEpic(home, { slug: "gql-migration", title: "GQL migration", repos: ["o/r"], linear: ["CRM-1"] }, NOW);
  const b = createEpic(home, { slug: "gql-cleanup", title: "Remove REST", repos: ["o/r"] }, NOW);
  const phasesOf = (slug: string): PhaseMeta[] => slug === "gql-cleanup"
    ? [{ id: 1, slug: "p", title: "P", status: "draft", linear: ["CRM-99"], prs: [], shipped_at: null, kind: "pr", repo: null, milestone: null, blocked_by: [] }]
    : [];
  assert.deepEqual(resolveEpics([a, b], "gql-cleanup", phasesOf).map((e) => e.slug), ["gql-cleanup"]);
  assert.deepEqual(resolveEpics([a, b], "GQL", phasesOf).map((e) => e.slug), ["gql-migration", "gql-cleanup"]);
  assert.deepEqual(resolveEpics([a, b], "rest", phasesOf).map((e) => e.slug), ["gql-cleanup"]);
  assert.deepEqual(resolveEpics([a, b], "crm-1", phasesOf).map((e) => e.slug), ["gql-migration"]);
  assert.deepEqual(resolveEpics([a, b], "https://linear.app/close/issue/CRM-99/thing", phasesOf).map((e) => e.slug), ["gql-cleanup"]);
  assert.deepEqual(resolveEpics([a, b], "nothing here", phasesOf), []);
  assert.deepEqual(resolveEpics([a, b], "   ", phasesOf), []);
});

test("resolveEpics: scores tokens and drops stopwords", () => {
  const home = tmpHome();
  const gql = createEpic(home, { slug: "gql-migration", title: "GQL migration", repos: ["o/r"] }, NOW);
  const auth = createEpic(home, { slug: "auth-refresh", title: "Authentication refresh", repos: ["o/r"] }, NOW);
  const db = createEpic(home, { slug: "db-migration", title: "DB migration", repos: ["o/r"] }, NOW);
  const phasesOf = (): PhaseMeta[] => [];
  const epics = [gql, auth, db];
  assert.deepEqual(resolveEpics(epics, "the gql thing", phasesOf).map((e) => e.slug), ["gql-migration"]);
  assert.deepEqual(resolveEpics(epics, "continue gql migration", phasesOf).map((e) => e.slug), ["gql-migration"]);
});

test("resolveEpics: tokens split on punctuation, not just whitespace", () => {
  const home = tmpHome();
  const gql = createEpic(home, { slug: "gql-migration", title: "GQL migration", repos: ["o/r"] }, NOW);
  const auth = createEpic(home, { slug: "auth-refresh", title: "Authentication refresh", repos: ["o/r"] }, NOW);
  const db = createEpic(home, { slug: "db-migration", title: "DB migration", repos: ["o/r"] }, NOW);
  const phasesOf = (): PhaseMeta[] => [];
  const epics = [gql, auth, db];
  assert.deepEqual(resolveEpics(epics, "what's up with gql?", phasesOf).map((e) => e.slug), ["gql-migration"]);
});

test("epicBrief includes milestones, ready lists, and unshipped blockers", () => {
  const home = tmpHome();
  createEpic(home, input, NOW);
  newMilestone(home, "gql-migration", { slug: "alpha", title: "Alpha" });
  newPhases(home, "gql-migration", [
    { slug: "a", title: "A", milestone: 1 },
    { slug: "b", title: "B", milestone: 1, blockedBy: [1] },
    { slug: "c", title: "C" },
  ]);
  setPhaseStatus(home, "gql-migration", 1, "planned", NOW);
  const brief = epicBrief(home, "gql-migration");
  assert.deepEqual(brief.milestones, [{ id: 1, slug: "alpha", title: "Alpha", status: "open" }]);
  assert.equal(brief.legacy, false);
  assert.deepEqual(brief.ready, [1]);
  assert.deepEqual(brief.plannable, [2, 3]);
  const [a, b, c] = brief.phases;
  assert.equal(a.milestone, 1);
  assert.deepEqual(b.blocked_by, [1]);
  assert.deepEqual(b.unshipped_blockers, [1]);
  assert.equal(c.milestone, null);
  assert.deepEqual(c.unshipped_blockers, []);
  const view = epicView(home, "gql-migration");
  assert.deepEqual(view.ready, [1]);
  assert.equal(view.milestones[0].status, "open");
  assert.deepEqual(view.phases[1].blocked_by, [1]);
});
