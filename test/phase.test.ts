import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NOW, tmpHome } from "./helpers.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { currentPhase, dropPhase, listPhases, newPhases, phaseFileName, readPhase, setPhaseStatus, writeBody, writePhase } from "../cli/lib/phase.ts";
import { recomputeEpicStatus } from "../cli/lib/lifecycle.ts";
import type { Epic, PhaseMeta } from "../cli/schema/types.ts";

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
  assert.equal(setPhaseStatus(home, "e", 1, "planned", NOW).meta.status, "planned");
  assert.throws(() => setPhaseStatus(home, "e", 1, "reviewed", NOW), /cannot set phase 1 to reviewed from planned/);
  assert.throws(() => readPhase(home, "e", 9), /no phase 9/);
});

test("currentPhase prefers in-progress, then planned, then draft", () => {
  const mk = (id: number, status: PhaseMeta["status"]): PhaseMeta => ({ id, slug: `p${id}`, title: "", status, linear: [], prs: [], shipped_at: null, kind: "pr" });
  assert.equal(currentPhase([mk(1, "reviewed"), mk(2, "draft"), mk(3, "planned")])?.id, 3);
  assert.equal(currentPhase([mk(1, "planned"), mk(2, "in-progress")])?.id, 2);
  assert.equal(currentPhase([mk(1, "reviewed")]), null);
});

test("recomputeEpicStatus derives active and shipped", () => {
  const home = epicHome();
  const epic = { slug: "e", title: "E", repo: "o/r", status: "planning" as const, linear: [], created: NOW, updated: NOW, synced_at: null, shipped_at: null, sessions: [] };
  const pr = { url: "https://github.com/o/r/pull/1", state: "open" as const, merged_at: null };
  const phase: PhaseMeta = { id: 1, slug: "a", title: "A", status: "in-progress", linear: [], prs: [pr], shipped_at: null, kind: "pr" };
  assert.equal(recomputeEpicStatus(epic, [phase], NOW), true);
  assert.equal(epic.status, "active");
  assert.equal(recomputeEpicStatus(epic, [phase], NOW), false);
  assert.equal(recomputeEpicStatus(epic, [{ ...phase, status: "reviewed" }], "2026-10-01T00:00:00Z"), true);
  assert.equal(epic.status, "shipped");
  assert.equal(epic.shipped_at, "2026-10-01T00:00:00Z");
  void home;
});

test("recomputeEpicStatus ships an epic whose phases are all manual and reviewed", () => {
  const epic = { slug: "e", title: "E", repo: "o/r", status: "planning" as const, linear: [], created: NOW, updated: NOW, synced_at: null, shipped_at: null, sessions: [] };
  const manual: PhaseMeta = { id: 1, slug: "a", title: "A", status: "reviewed", linear: [], prs: [], shipped_at: NOW, kind: "manual" };
  assert.equal(recomputeEpicStatus(epic, [manual, { ...manual, id: 2, slug: "b", status: "shipped" }], NOW), true, "a shipped manual phase activates the epic");
  assert.equal(epic.status, "active");
  assert.equal(recomputeEpicStatus(epic, [manual, { ...manual, id: 2, slug: "b" }], "2026-10-01T00:00:00Z"), true);
  assert.equal(epic.status, "shipped");
  assert.equal(epic.shipped_at, "2026-10-01T00:00:00Z");
});

test("recomputeEpicStatus goes straight from planning to shipped when every phase is already reviewed", () => {
  const epic = { slug: "e", title: "E", repo: "o/r", status: "planning" as const, linear: [], created: NOW, updated: NOW, synced_at: null, shipped_at: null, sessions: [] };
  const manual: PhaseMeta = { id: 1, slug: "a", title: "A", status: "reviewed", linear: [], prs: [], shipped_at: NOW, kind: "manual" };
  assert.equal(recomputeEpicStatus(epic, [manual], NOW), true);
  assert.equal(epic.status, "shipped");
});

test("recomputeEpicStatus un-ships an epic that gains an unreviewed phase", () => {
  const epic: Epic = { slug: "e", title: "E", repo: "o/r", status: "shipped", linear: [], created: NOW, updated: NOW, synced_at: null, shipped_at: NOW, sessions: [] };
  const done: PhaseMeta = { id: 1, slug: "a", title: "A", status: "reviewed", linear: [], prs: [], shipped_at: NOW, kind: "pr" };
  const draft: PhaseMeta = { ...done, id: 2, slug: "b", status: "draft", shipped_at: null };
  assert.equal(recomputeEpicStatus(epic, [done], NOW), false, "still shipped while every phase is reviewed");
  assert.equal(recomputeEpicStatus(epic, [done, draft], "2026-10-01T00:00:00Z"), true);
  assert.equal(epic.status, "active");
  assert.equal(epic.shipped_at, null, "shipped_at is cleared so the next ship records its own date");
  assert.equal(recomputeEpicStatus(epic, [done, { ...draft, status: "reviewed" }], "2026-10-02T00:00:00Z"), true);
  assert.equal(epic.status, "shipped");
  assert.equal(epic.shipped_at, "2026-10-02T00:00:00Z");
});

test("recomputeEpicStatus leaves paused and abandoned alone", () => {
  const base: Epic = { slug: "e", title: "E", repo: "o/r", status: "paused", linear: [], created: NOW, updated: NOW, synced_at: null, shipped_at: null, sessions: [] };
  const done: PhaseMeta = { id: 1, slug: "a", title: "A", status: "reviewed", linear: [], prs: [], shipped_at: NOW, kind: "pr" };
  for (const status of ["paused", "abandoned"] as const) {
    const epic: Epic = { ...base, status };
    assert.equal(recomputeEpicStatus(epic, [done], NOW), false);
    assert.equal(epic.status, status);
  }
});

test("newPhases validates all inputs before writing any", () => {
  const home = epicHome();
  assert.throws(() => newPhases(home, "e", [{ slug: "ok", title: "Ok" }, { slug: "Bad Slug", title: "Bad" }]), /kebab-case/);
  assert.deepEqual(listPhases(home, "e"), []);
});

test("manual phases ship by hand; pr phases and phases with prs do not", () => {
  const home = epicHome();
  newPhases(home, "e", [{ slug: "review", title: "Design review", kind: "manual" }, { slug: "code", title: "Code" }]);
  assert.equal(readPhase(home, "e", 1).meta.kind, "manual");
  assert.equal(readPhase(home, "e", 2).meta.kind, "pr");
  const shipped = setPhaseStatus(home, "e", 1, "shipped", "2026-09-08T10:00:00Z");
  assert.equal(shipped.meta.status, "shipped");
  assert.equal(shipped.meta.shipped_at, "2026-09-08T10:00:00Z");
  assert.throws(() => setPhaseStatus(home, "e", 2, "shipped", NOW), /only a manual phase with no linked prs can be shipped by hand/);
});

// linkPrs refuses manual phases, so the linked PR goes into the file by hand.
test("a manual phase with a linked PR does not ship by hand", () => {
  const home = epicHome();
  newPhases(home, "e", [{ slug: "rollout", title: "Rollout", kind: "manual" }]);
  const phase = readPhase(home, "e", 1);
  phase.meta.prs.push({ url: "https://github.com/o/r/pull/9", state: "open", merged_at: null });
  writePhase(phase);
  assert.throws(() => setPhaseStatus(home, "e", 1, "shipped", NOW), /only a manual phase with no linked prs can be shipped by hand/);
});

test("dropPhase removes a draft and refuses anything else", () => {
  const home = epicHome();
  newPhases(home, "e", [{ slug: "a", title: "A" }, { slug: "b", title: "B" }]);
  setPhaseStatus(home, "e", 1, "planned", NOW);
  const dropped = dropPhase(home, "e", 2);
  assert.equal(dropped.meta.slug, "b");
  assert.deepEqual(listPhases(home, "e").map((p) => p.meta.id), [1]);
  assert.throws(() => dropPhase(home, "e", 1), /cannot drop phase 1: status is planned/);
  const [c] = newPhases(home, "e", [{ slug: "c", title: "C" }]);
  assert.equal(c.meta.id, 2, "ids continue from the highest remaining");
});
