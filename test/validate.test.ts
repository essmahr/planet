import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEpic, validatePhaseMeta, validateProposalMeta, validateMarker, ValidationError, assertSlug } from "../cli/schema/validate.ts";

const epic = {
  slug: "gql-migration", title: "GQL migration", repos: ["closeio/close-ui"], status: "planning",
  linear: ["CRM-123"], created: "2026-09-03T15:02:00Z", updated: "2026-09-03T15:02:00Z",
  synced_at: null, shipped_at: null, sessions: [],
};

test("validateEpic accepts a full epic and fills defaults", () => {
  const e = validateEpic(epic, "epic.yaml");
  assert.equal(e.slug, "gql-migration");
  assert.deepEqual(validateEpic({ ...epic, linear: undefined, sessions: undefined }, "f").linear, []);
});

test("validateEpic rejects bad status, slug, and repo", () => {
  assert.throws(() => validateEpic({ ...epic, status: "done" }, "f"), ValidationError);
  assert.throws(() => validateEpic({ ...epic, slug: "GQL Migration" }, "f"), /kebab-case/);
  assert.throws(() => validateEpic({ ...epic, repos: ["close-ui"] }, "f"), /owner\/name/);
  assert.throws(() => validateEpic({ ...epic, repos: [] }, "f"), /at least one/);
  assert.throws(() => validateEpic({ ...epic, repos: ["o/r", "o/r"] }, "f"), /must not repeat/);
});

test("validateEpic reads a legacy single repo as repos", () => {
  const { repos: _, ...legacy } = epic;
  const e = validateEpic({ ...legacy, repo: "closeio/close-ui" }, "f");
  assert.deepEqual(e.repos, ["closeio/close-ui"]);
  assert.equal("repo" in e, false);
});

test("validatePhaseMeta validates nested prs", () => {
  const meta = validatePhaseMeta({
    id: 1, slug: "codegen", title: "Codegen", status: "in-progress", linear: [],
    prs: [{ url: "https://github.com/closeio/close-ui/pull/1", state: "open", merged_at: null }], shipped_at: null,
  }, "01-codegen.md");
  assert.equal(meta.prs[0].state, "open");
  assert.equal(meta.prs[0].session, null);
  assert.throws(() => validatePhaseMeta({ id: "1", slug: "a", title: "A", status: "draft" }, "f"), /id must be an integer/);
  assert.throws(() => validatePhaseMeta({ id: 1, slug: "a", title: "A", status: "draft", prs: [{ url: "u", state: "nope" }] }, "f"), /state must be one of/);
});

test("validateProposalMeta allows the unknown step and defaults outcome fields", () => {
  const p = validateProposalMeta({ id: 3, step: "unknown", phase: null, session: "s", created: "t" }, "f");
  assert.equal(p.outcome, "pending");
  assert.equal(p.feedback, null);
  assert.equal(p.tool_use, null);
  assert.throws(() => validateProposalMeta({ id: 3, step: "dreaming", phase: null, session: "s", created: "t" }, "f"), /step must be one of/);
});

test("validateMarker", () => {
  assert.deepEqual(validateMarker({ epic: "gql", phase: null, step: null, started: "t" }, "f"), { epic: "gql", phase: null, step: null, started: "t" });
  assert.throws(() => validateMarker({ epic: "gql", phase: 1, step: "nap", started: "t" }, "f"), /step must be one of/);
});

test("assertSlug", () => {
  assertSlug("ok-slug-2", "slug");
  assert.throws(() => assertSlug("Bad_Slug", "slug"), /kebab-case/);
});

test("validatePhaseMeta defaults kind to pr and rejects unknown kinds", () => {
  const base = { id: 1, slug: "a", title: "A", status: "draft", linear: [], prs: [], shipped_at: null };
  assert.equal(validatePhaseMeta(base, "f").kind, "pr");
  assert.equal(validatePhaseMeta({ ...base, kind: "manual" }, "f").kind, "manual");
  assert.throws(() => validatePhaseMeta({ ...base, kind: "review" }, "f"), /kind must be one of pr, manual/);
});

test("validateEpic reads milestones and defaults them to []", () => {
  assert.deepEqual(validateEpic(epic, "f").milestones, []);
  const milestones = [{ id: 1, slug: "views", title: "Views" }];
  assert.deepEqual(validateEpic({ ...epic, milestones }, "f").milestones, milestones);
  assert.throws(() => validateEpic({ ...epic, milestones: [{ id: 1, slug: "Bad Slug", title: "T" }] }, "f"), ValidationError);
  assert.throws(() => validateEpic({ ...epic, milestones: [{ id: 1.5, slug: "a", title: "T" }] }, "f"), ValidationError);
  assert.throws(
    () => validateEpic({ ...epic, milestones: [{ id: 1, slug: "a", title: "A" }, { id: 1, slug: "b", title: "B" }] }, "f"),
    /milestone ids must not repeat/,
  );
});

test("validatePhaseMeta reads milestone and blocked_by with defaults", () => {
  const base = { id: 2, slug: "a", title: "A", status: "draft", linear: [], prs: [], shipped_at: null };
  const plain = validatePhaseMeta(base, "f");
  assert.equal(plain.milestone, null);
  assert.deepEqual(plain.blocked_by, []);
  const set = validatePhaseMeta({ ...base, milestone: 1, blocked_by: [1, 3] }, "f");
  assert.equal(set.milestone, 1);
  assert.deepEqual(set.blocked_by, [1, 3]);
  assert.throws(() => validatePhaseMeta({ ...base, blocked_by: [3, "x"] }, "f"), /blocked_by must be a list of integers/);
  assert.throws(() => validatePhaseMeta({ ...base, blocked_by: [2] }, "f"), /cannot block itself/);
});
