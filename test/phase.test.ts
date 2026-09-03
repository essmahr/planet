import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NOW, tmpHome } from "./helpers.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { currentPhase, listPhases, newPhases, phaseFileName, readPhase, setPhaseStatus, writeBody } from "../cli/lib/phase.ts";
import { recomputeEpicStatus } from "../cli/lib/lifecycle.ts";
import type { PhaseMeta } from "../cli/schema/types.ts";

function epicHome(): string {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  return home;
}

test("newPhases assigns consecutive ids and writes frontmatter with an empty body", () => {
  const home = epicHome();
  const [a, b] = newPhases(home, "e", [{ slug: "codegen", title: "Codegen" }, { slug: "hooks", title: "Hooks", linear: ["CRM-2"] }]);
  assert.equal(a.meta.id, 1);
  assert.equal(b.meta.id, 2);
  assert.equal(phaseFileName(b.meta.id, b.meta.slug), "02-hooks.md");
  assert.match(readFileSync(b.path, "utf8"), /^---\nid: 2\nslug: hooks\n/);
  const [c] = newPhases(home, "e", [{ slug: "cleanup", title: "Cleanup" }]);
  assert.equal(c.meta.id, 3);
  assert.deepEqual(listPhases(home, "e").map((p) => p.meta.slug), ["codegen", "hooks", "cleanup"]);
  assert.throws(() => newPhases(home, "e", [{ slug: "hooks", title: "Dup" }]), /already exists/);
});

test("writeBody keeps frontmatter and ensures a trailing newline", () => {
  const home = epicHome();
  newPhases(home, "e", [{ slug: "codegen", title: "Codegen" }]);
  const p = writeBody(home, "e", 1, "# Plan\n\nDo the thing");
  assert.equal(p.body, "# Plan\n\nDo the thing\n");
  assert.equal(readPhase(home, "e", 1).meta.title, "Codegen");
});

test("setPhaseStatus enforces manual transitions", () => {
  const home = epicHome();
  newPhases(home, "e", [{ slug: "codegen", title: "Codegen" }]);
  assert.equal(setPhaseStatus(home, "e", 1, "planned").meta.status, "planned");
  assert.throws(() => setPhaseStatus(home, "e", 1, "reviewed"), /cannot set phase 1 to reviewed from planned/);
  assert.throws(() => readPhase(home, "e", 9), /no phase 9/);
});

test("currentPhase prefers in-progress, then planned, then draft", () => {
  const mk = (id: number, status: PhaseMeta["status"]): PhaseMeta => ({ id, slug: `p${id}`, title: "", status, linear: [], prs: [], shipped_at: null });
  assert.equal(currentPhase([mk(1, "reviewed"), mk(2, "draft"), mk(3, "planned")])?.id, 3);
  assert.equal(currentPhase([mk(1, "planned"), mk(2, "in-progress")])?.id, 2);
  assert.equal(currentPhase([mk(1, "reviewed")]), null);
});

test("recomputeEpicStatus derives active and shipped", () => {
  const home = epicHome();
  const epic = { slug: "e", title: "E", repo: "o/r", status: "planning" as const, linear: [], created: NOW, updated: NOW, synced_at: null, shipped_at: null, sessions: [] };
  const pr = { url: "https://github.com/o/r/pull/1", state: "open" as const, merged_at: null };
  const phase: PhaseMeta = { id: 1, slug: "a", title: "A", status: "in-progress", linear: [], prs: [pr], shipped_at: null };
  assert.equal(recomputeEpicStatus(epic, [phase], NOW), true);
  assert.equal(epic.status, "active");
  assert.equal(recomputeEpicStatus(epic, [phase], NOW), false);
  assert.equal(recomputeEpicStatus(epic, [{ ...phase, status: "reviewed" }], "2026-10-01T00:00:00Z"), true);
  assert.equal(epic.status, "shipped");
  assert.equal(epic.shipped_at, "2026-10-01T00:00:00Z");
  void home;
});
