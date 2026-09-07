import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEpic, validatePhaseMeta, validateProposalMeta, validateMarker, ValidationError, assertSlug } from "../cli/schema/validate.ts";

const epic = {
  slug: "gql-migration", title: "GQL migration", repo: "closeio/close-ui", status: "planning",
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
  assert.throws(() => validateEpic({ ...epic, repo: "close-ui" }, "f"), /owner\/name/);
});

test("validatePhaseMeta validates nested prs", () => {
  const meta = validatePhaseMeta({
    id: 1, slug: "codegen", title: "Codegen", status: "in-progress", linear: [],
    prs: [{ url: "https://github.com/closeio/close-ui/pull/1", state: "open", merged_at: null }], shipped_at: null,
  }, "01-codegen.md");
  assert.equal(meta.prs[0].state, "open");
  assert.throws(() => validatePhaseMeta({ id: "1", slug: "a", title: "A", status: "draft" }, "f"), /id must be an integer/);
  assert.throws(() => validatePhaseMeta({ id: 1, slug: "a", title: "A", status: "draft", prs: [{ url: "u", state: "nope" }] }, "f"), /state must be one of/);
});

test("validateProposalMeta allows the unknown step and defaults outcome fields", () => {
  const p = validateProposalMeta({ id: 3, step: "unknown", phase: null, session: "s", created: "t" }, "f");
  assert.equal(p.outcome, "pending");
  assert.equal(p.edited, false);
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
