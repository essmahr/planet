import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { dependentsCount, graphErrors, isLegacy, readyLists, unshippedBlockers, wouldCycle } from "../cli/lib/graph.ts";
import { paths } from "../cli/lib/store.ts";
import type { PhaseMeta, PhaseStatus } from "../cli/schema/types.ts";
import { tmpHome } from "./helpers.ts";

function meta(id: number, status: PhaseStatus, blocked_by: number[] = []): PhaseMeta {
  return { id, slug: `p${id}`, title: `P${id}`, status, kind: "pr", repo: null, linear: [], prs: [], shipped_at: null, milestone: null, blocked_by };
}

test("readyLists orders by remaining dependents, then id", () => {
  const phases = [meta(1, "draft"), meta(2, "draft", [1]), meta(3, "draft"), meta(4, "draft", [2])];
  assert.deepEqual(readyLists(phases, false).plannable, [1, 3]);
  const started = [meta(1, "planned"), meta(2, "draft", [1]), meta(3, "draft"), meta(4, "draft", [2])];
  assert.deepEqual(readyLists(started, false).plannable, [2, 3]);
});

test("ready needs every blocker shipped", () => {
  assert.deepEqual(readyLists([meta(1, "planned"), meta(2, "planned", [1])], false).ready, [1]);
  assert.deepEqual(readyLists([meta(1, "shipped"), meta(2, "planned", [1])], false).ready, [2]);
  assert.deepEqual(readyLists([meta(1, "reviewed"), meta(2, "planned", [1])], false).ready, [2]);
});

test("legacy falls back to lowest id", () => {
  const phases = [meta(2, "draft"), meta(5, "draft"), meta(3, "planned"), meta(4, "planned")];
  assert.deepEqual(readyLists(phases, true), { plannable: [2], ready: [3] });
});

test("graphErrors reports missing blockers and cycles", () => {
  assert.deepEqual(graphErrors([meta(1, "draft", [9])]), ["phase 1 is blocked by missing phase 9"]);
  const errors = graphErrors([meta(2, "draft", [3]), meta(3, "draft", [2])]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /2, 3 form a cycle/);
});

test("wouldCycle", () => {
  const phases = [meta(1, "draft"), meta(2, "draft", [1]), meta(3, "draft")];
  assert.equal(wouldCycle(phases, 1, [2]), true);
  assert.equal(wouldCycle(phases, 3, [1]), false);
});

test("dependentsCount counts each transitive unshipped dependent once", () => {
  const phases = [meta(1, "draft"), meta(2, "draft", [1]), meta(3, "draft", [1, 2]), meta(4, "shipped", [1])];
  assert.equal(dependentsCount(phases, 1), 2);
});

test("unshippedBlockers", () => {
  const phases = [meta(1, "shipped"), meta(2, "planned"), meta(3, "draft", [1, 2])];
  assert.deepEqual(unshippedBlockers(phases, 3), [2]);
});

test("isLegacy", () => {
  const home = tmpHome();
  assert.equal(isLegacy(home, "e"), false);
  const plan = paths.plan(home, "e");
  mkdirSync(dirname(plan), { recursive: true });
  writeFileSync(plan, "# Plan\n\n## Phases\n\n1. a\n");
  assert.equal(isLegacy(home, "e"), true);
  writeFileSync(plan, "# Plan\n\n## Milestones\n\n- a\n");
  assert.equal(isLegacy(home, "e"), false);
});
