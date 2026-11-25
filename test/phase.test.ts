import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NOW, SESSION, tmpHome } from "./helpers.ts";
import { createEpic, readEpic, writeEpic } from "../cli/lib/epic.ts";
import { currentPhase, dropPhase, listPhases, movePhase, newPhases, phaseFileName, phaseRepo, readPhase, setBlockers, setPhaseRepo, setPhaseStatus, writeBody, writePhase } from "../cli/lib/phase.ts";
import { createProposal, markApproved } from "../cli/lib/proposal.ts";
import { recomputeEpicStatus } from "../cli/lib/lifecycle.ts";
import type { Epic, PhaseMeta } from "../cli/schema/types.ts";

function epicHome(): string {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repos: ["o/r"] }, NOW);
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

test("listPhases includes three-digit ids in numeric order", () => {
  const home = epicHome();
  const [a] = newPhases(home, "e", [{ slug: "codegen", title: "Codegen" }]);
  writePhase({ ...a, meta: { ...a.meta, id: 99 }, path: a.path.replace("01-codegen", "99-codegen") });
  dropPhase(home, "e", 1);
  const [b] = newPhases(home, "e", [{ slug: "hooks", title: "Hooks" }]);
  assert.equal(b.meta.id, 100);
  assert.deepEqual(listPhases(home, "e").map((p) => p.meta.id), [99, 100]);
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
  const mk = (id: number, status: PhaseMeta["status"]): PhaseMeta => ({ id, slug: `p${id}`, title: "", status, linear: [], prs: [], shipped_at: null, kind: "pr", repo: null, milestone: null, blocked_by: [] });
  assert.equal(currentPhase([mk(1, "reviewed"), mk(2, "draft"), mk(3, "planned")])?.id, 3);
  assert.equal(currentPhase([mk(1, "planned"), mk(2, "in-progress")])?.id, 2);
  assert.equal(currentPhase([mk(1, "reviewed")]), null);
});

test("recomputeEpicStatus derives active and shipped", () => {
  const home = epicHome();
  const epic = { slug: "e", title: "E", repos: ["o/r"], status: "planning" as const, linear: [], created: NOW, updated: NOW, synced_at: null, shipped_at: null, sessions: [], milestones: [] };
  const pr = { url: "https://github.com/o/r/pull/1", state: "open" as const, merged_at: null, session: null };
  const phase: PhaseMeta = { id: 1, slug: "a", title: "A", status: "in-progress", linear: [], prs: [pr], shipped_at: null, kind: "pr", repo: null, milestone: null, blocked_by: [] };
  assert.equal(recomputeEpicStatus(epic, [phase], NOW), true);
  assert.equal(epic.status, "active");
  assert.equal(recomputeEpicStatus(epic, [phase], NOW), false);
  assert.equal(recomputeEpicStatus(epic, [{ ...phase, status: "reviewed" }], "2026-10-01T00:00:00Z"), true);
  assert.equal(epic.status, "shipped");
  assert.equal(epic.shipped_at, "2026-10-01T00:00:00Z");
  void home;
});

test("recomputeEpicStatus ships an epic whose phases are all manual and reviewed", () => {
  const epic = { slug: "e", title: "E", repos: ["o/r"], status: "planning" as const, linear: [], created: NOW, updated: NOW, synced_at: null, shipped_at: null, sessions: [], milestones: [] };
  const manual: PhaseMeta = { id: 1, slug: "a", title: "A", status: "reviewed", linear: [], prs: [], shipped_at: NOW, kind: "manual", repo: null, milestone: null, blocked_by: [] };
  assert.equal(recomputeEpicStatus(epic, [manual, { ...manual, id: 2, slug: "b", status: "shipped" }], NOW), true, "a shipped manual phase activates the epic");
  assert.equal(epic.status, "active");
  assert.equal(recomputeEpicStatus(epic, [manual, { ...manual, id: 2, slug: "b" }], "2026-10-01T00:00:00Z"), true);
  assert.equal(epic.status, "shipped");
  assert.equal(epic.shipped_at, "2026-10-01T00:00:00Z");
});

test("recomputeEpicStatus goes straight from planning to shipped when every phase is already reviewed", () => {
  const epic = { slug: "e", title: "E", repos: ["o/r"], status: "planning" as const, linear: [], created: NOW, updated: NOW, synced_at: null, shipped_at: null, sessions: [], milestones: [] };
  const manual: PhaseMeta = { id: 1, slug: "a", title: "A", status: "reviewed", linear: [], prs: [], shipped_at: NOW, kind: "manual", repo: null, milestone: null, blocked_by: [] };
  assert.equal(recomputeEpicStatus(epic, [manual], NOW), true);
  assert.equal(epic.status, "shipped");
});

test("recomputeEpicStatus un-ships an epic that gains an unreviewed phase", () => {
  const epic: Epic = { slug: "e", title: "E", repos: ["o/r"], status: "shipped", linear: [], created: NOW, updated: NOW, synced_at: null, shipped_at: NOW, sessions: [], milestones: [] };
  const done: PhaseMeta = { id: 1, slug: "a", title: "A", status: "reviewed", linear: [], prs: [], shipped_at: NOW, kind: "pr", repo: null, milestone: null, blocked_by: [] };
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
  const base: Epic = { slug: "e", title: "E", repos: ["o/r"], status: "paused", linear: [], created: NOW, updated: NOW, synced_at: null, shipped_at: null, sessions: [], milestones: [] };
  const done: PhaseMeta = { id: 1, slug: "a", title: "A", status: "reviewed", linear: [], prs: [], shipped_at: NOW, kind: "pr", repo: null, milestone: null, blocked_by: [] };
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
  newPhases(home, "e", [{ slug: "review", title: "Design review", kind: "manual", repo: null }, { slug: "code", title: "Code" }]);
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
  newPhases(home, "e", [{ slug: "rollout", title: "Rollout", kind: "manual", repo: null }]);
  const phase = readPhase(home, "e", 1);
  phase.meta.prs.push({ url: "https://github.com/o/r/pull/9", state: "open", merged_at: null, session: null });
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

test("a phase repo defaults to null and resolves to the epic's primary repo", () => {
  const home = tmpHome();
  const epic = createEpic(home, { slug: "e", title: "E", repos: ["o/fe", "o/be"] }, NOW);
  const [fe, be] = newPhases(home, "e", [{ slug: "ui", title: "UI" }, { slug: "api", title: "API", repo: "o/be" }]);
  assert.equal(fe.meta.repo, null);
  assert.equal(phaseRepo(epic, fe.meta), "o/fe");
  assert.equal(readPhase(home, "e", 2).meta.repo, "o/be");
  assert.equal(phaseRepo(epic, be.meta), "o/be");
  assert.throws(() => newPhases(home, "e", [{ slug: "x", title: "X", repo: "o/other" }]), /not one of epic 'e' repos/);
});

test("setPhaseRepo moves only draft or planned phases with no prs", () => {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repos: ["o/fe", "o/be"] }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }, { slug: "b", title: "B" }]);
  assert.equal(setPhaseRepo(home, "e", 1, "o/be").meta.repo, "o/be");
  assert.throws(() => setPhaseRepo(home, "e", 1, "o/other"), /not one of/);
  const b = readPhase(home, "e", 2);
  b.meta.status = "in-progress";
  writePhase(b);
  assert.throws(() => setPhaseRepo(home, "e", 2, "o/be"), /status is in-progress/);
});

function approvedPhasing(home: string): number {
  const p = createProposal(home, "e", { step: "phasing", phase: null, session: SESSION, toolUse: null, planFile: null, body: "# Phases\n" }, NOW);
  markApproved(home, "e", p.meta.id);
  return p.meta.id;
}

function withMilestone(home: string): void {
  const epic = readEpic(home, "e");
  epic.milestones = [{ id: 1, slug: "m", title: "M" }];
  writeEpic(home, epic);
}

test("newPhases writes milestone and blocked_by, defaulting to null and []", () => {
  const home = epicHome();
  withMilestone(home);
  const [a, b] = newPhases(home, "e", [{ slug: "a", title: "A" }, { slug: "b", title: "B", milestone: 1, blockedBy: [1] }]);
  assert.equal(a.meta.milestone, null);
  assert.deepEqual(a.meta.blocked_by, []);
  const onDisk = readPhase(home, "e", b.meta.id).meta;
  assert.equal(onDisk.milestone, 1);
  assert.deepEqual(onDisk.blocked_by, [1]);
});

test("newPhases with blockedBy needs no proposal", () => {
  const home = epicHome();
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  const [b] = newPhases(home, "e", [{ slug: "b", title: "B", blockedBy: [1] }]);
  assert.deepEqual(b.meta.blocked_by, [1]);
});

test("newPhases with blocks needs an approved phasing proposal and updates the target", () => {
  const home = epicHome();
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  assert.throws(() => newPhases(home, "e", [{ slug: "b", title: "B", blocks: [1] }]), /--blocks needs --proposal/);
  const p = approvedPhasing(home);
  const [b] = newPhases(home, "e", [{ slug: "b", title: "B", blocks: [1] }], p);
  assert.deepEqual(readPhase(home, "e", 1).meta.blocked_by, [b.meta.id]);
});

test("newPhases refuses an unknown milestone or blocker", () => {
  const home = epicHome();
  assert.throws(() => newPhases(home, "e", [{ slug: "a", title: "A", milestone: 7 }]), /no milestone 7/);
  assert.throws(() => newPhases(home, "e", [{ slug: "a", title: "A", blockedBy: [9] }]), /no phase 9/);
  assert.deepEqual(listPhases(home, "e"), []);
});

test("newPhases refuses blocks on a shipped phase", () => {
  const home = epicHome();
  newPhases(home, "e", [{ slug: "a", title: "A", kind: "manual" }]);
  setPhaseStatus(home, "e", 1, "shipped", NOW);
  const p = approvedPhasing(home);
  assert.throws(() => newPhases(home, "e", [{ slug: "b", title: "B", blocks: [1] }], p), /phase 1 has shipped/);
});

test("setBlockers refuses a cycle and writes nothing", () => {
  const home = epicHome();
  newPhases(home, "e", [{ slug: "a", title: "A" }, { slug: "b", title: "B", blockedBy: [1] }]);
  const p = approvedPhasing(home);
  const before = readFileSync(readPhase(home, "e", 1).path, "utf8");
  assert.throws(() => setBlockers(home, "e", 1, [2], false, p), /would form a cycle/);
  assert.equal(readFileSync(readPhase(home, "e", 1).path, "utf8"), before);
});

test("setBlockers adds and removes blockers", () => {
  const home = epicHome();
  newPhases(home, "e", [{ slug: "a", title: "A" }, { slug: "b", title: "B" }, { slug: "c", title: "C" }]);
  const p = approvedPhasing(home);
  assert.deepEqual(setBlockers(home, "e", 3, [1, 2], false, p).meta.blocked_by, [1, 2]);
  assert.deepEqual(setBlockers(home, "e", 3, [1], true, p).meta.blocked_by, [2]);
});

test("setBlockers refuses a shipped phase", () => {
  const home = epicHome();
  newPhases(home, "e", [{ slug: "a", title: "A", kind: "manual" }, { slug: "b", title: "B" }]);
  setPhaseStatus(home, "e", 1, "shipped", NOW);
  const p = approvedPhasing(home);
  assert.throws(() => setBlockers(home, "e", 1, [2], false, p), /phase 1 has shipped/);
});

test("dropPhase of a blocker needs a proposal and unlinks the dependents", () => {
  const home = epicHome();
  newPhases(home, "e", [{ slug: "a", title: "A" }, { slug: "b", title: "B", blockedBy: [1] }]);
  assert.throws(() => dropPhase(home, "e", 1), /blocks phase 2; pass --proposal/);
  dropPhase(home, "e", 1, approvedPhasing(home));
  assert.deepEqual(readPhase(home, "e", 2).meta.blocked_by, []);
});

test("movePhase sets and clears milestone with no proposal", () => {
  const home = epicHome();
  withMilestone(home);
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  assert.equal(movePhase(home, "e", 1, 1).meta.milestone, 1);
  assert.equal(readPhase(home, "e", 1).meta.milestone, 1);
  assert.equal(movePhase(home, "e", 1, null).meta.milestone, null);
  assert.throws(() => movePhase(home, "e", 1, 5), /no milestone 5/);
});

test("newPhases refuses a cycle through blocks and writes nothing", () => {
  const home = epicHome();
  newPhases(home, "e", [{ slug: "a", title: "A" }, { slug: "b", title: "B", blockedBy: [1] }]);
  const p = approvedPhasing(home);
  const before = readFileSync(readPhase(home, "e", 1).path, "utf8");
  assert.throws(() => newPhases(home, "e", [{ slug: "c", title: "C", blockedBy: [2], blocks: [1] }], p), /would form a cycle/);
  assert.equal(readFileSync(readPhase(home, "e", 1).path, "utf8"), before);
  assert.deepEqual(listPhases(home, "e").map((x) => x.meta.slug), ["a", "b"]);
});
