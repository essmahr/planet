import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { NOW, SESSION, tmpHome } from "./helpers.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { newPhases, readPhase } from "../cli/lib/phase.ts";
import { approveTo, assertPhasingApproval, createProposal, findProposalByToolUse, latestPending, latestProposalId, listProposals, markApproved, markRejected, nextProposalId, parseDestination, proposalFileName, readProposal, resolveProposalId, sameText, tagProposal } from "../cli/lib/proposal.ts";
import { paths } from "../cli/lib/store.ts";

const input = { step: "phasing" as const, phase: null, session: SESSION, toolUse: "toolu_1", planFile: "/plans/x.md", body: "# Phases\n\n1. A\n2. B\n" };

function setup(): string {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repos: ["o/r"] }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  return home;
}

test("createProposal numbers snapshots and stores the plan verbatim", () => {
  const home = setup();
  assert.equal(nextProposalId(home, "e"), 1);
  assert.equal(latestProposalId(home, "e"), null);
  const p = createProposal(home, "e", input, NOW);
  assert.equal(proposalFileName(p.meta.id, p.meta.step), "001-phasing.md");
  assert.match(p.path, /001-phasing\.md$/);
  assert.equal(p.body, input.body);
  assert.equal(p.meta.outcome, "pending");
  assert.equal(p.meta.tool_use, "toolu_1");
  const q = createProposal(home, "e", { ...input, step: "unknown", toolUse: null }, NOW);
  assert.equal(q.meta.id, 2);
  assert.equal(latestProposalId(home, "e"), 2);
  assert.deepEqual(listProposals(home, "e").map((x) => x.meta.id), [1, 2]);
  assert.deepEqual(readProposal(home, "e", 1).meta, p.meta);
});

test("findProposalByToolUse and latestPending", () => {
  const home = setup();
  const p1 = createProposal(home, "e", input, NOW);
  const p2 = createProposal(home, "e", { ...input, toolUse: "toolu_2" }, NOW);
  assert.equal(findProposalByToolUse(home, "e", "toolu_2")?.meta.id, p2.meta.id);
  assert.equal(findProposalByToolUse(home, "e", "nope"), null);
  assert.equal(latestPending(home, "e", SESSION)?.meta.id, 2);
  markRejected(home, "e", 2, "no");
  assert.equal(latestPending(home, "e", SESSION)?.meta.id, p1.meta.id);
  assert.equal(latestPending(home, "e", "other-session"), null);
});

test("markApproved sets the outcome and keeps the snapshot body", () => {
  const home = setup();
  const p = createProposal(home, "e", input, NOW);
  const approved = markApproved(home, "e", p.meta.id);
  assert.equal(approved.meta.outcome, "approved");
  assert.equal(approved.body, input.body);
  assert.deepEqual(listProposals(home, "e").map((x) => x.meta.id), [1]);
});

test("sameText ignores line endings and surrounding whitespace only", () => {
  assert.ok(sameText("a\r\nb\n", "a\nb"));
  assert.ok(!sameText("a\nb", "b\na"));
});

test("markRejected stores the message verbatim", () => {
  const home = setup();
  const p = createProposal(home, "e", input, NOW);
  const r = markRejected(home, "e", p.meta.id, 'Comments on the plan:\n[Re: "2. B"] should be first');
  assert.equal(r.meta.outcome, "rejected");
  assert.match(r.meta.feedback ?? "", /should be first/);
});

test("parseDestination and approveTo", () => {
  assert.deepEqual(parseDestination("plan"), { kind: "plan" });
  assert.deepEqual(parseDestination("phase:3"), { kind: "phase", id: 3 });
  assert.deepEqual(parseDestination("milestones"), { kind: "milestones" });
  assert.deepEqual(parseDestination("none"), { kind: "none" });
  assert.throws(() => parseDestination("phase:x"), /--to must be plan, milestones, none, phase:<n>, or review/);

  const home = setup();
  const p = createProposal(home, "e", input, NOW);
  markApproved(home, "e", p.meta.id);
  const r = approveTo(home, "e", p.meta.id, { kind: "plan" }, undefined, NOW);
  assert.equal(r.wrote, paths.plan(home, "e"));
  assert.equal(readFileSync(paths.plan(home, "e"), "utf8"), input.body, "an already approved proposal writes its snapshot");

  const q = createProposal(home, "e", { ...input, step: "phase-plan", phase: 1 }, NOW);
  const r2 = approveTo(home, "e", q.meta.id, { kind: "phase", id: 1 }, undefined, NOW);
  assert.equal(r2.proposal.meta.outcome, "approved", "pending proposal is approved by approveTo");
  assert.equal(readPhase(home, "e", 1).body, input.body);
  assert.match(r2.wrote, /01-a\.md$/);

  const s = createProposal(home, "e", input, NOW);
  approveTo(home, "e", s.meta.id, { kind: "plan" }, "# From file\n", NOW);
  assert.equal(readFileSync(paths.plan(home, "e"), "utf8"), "# From file\n");
  assert.equal(readProposal(home, "e", s.meta.id).meta.outcome, "approved");
});

const phasing = { ...input, step: "phasing" as const };

test("assertPhasingApproval accepts only the latest approved phasing proposal", () => {
  const home = setup();
  const p = createProposal(home, "e", phasing, NOW);
  assert.throws(() => assertPhasingApproval(home, "e", p.meta.id), /not approved/);
  markApproved(home, "e", p.meta.id);
  assertPhasingApproval(home, "e", p.meta.id);
  const scoping = createProposal(home, "e", { ...input, step: "scoping" }, NOW);
  markApproved(home, "e", scoping.meta.id);
  assert.throws(() => assertPhasingApproval(home, "e", scoping.meta.id), /not a phasing proposal/);
  createProposal(home, "e", { ...input, step: "phase-plan", phase: 1 }, NOW);
  assert.throws(() => assertPhasingApproval(home, "e", p.meta.id), /proposal 1 is not the latest proposal/);
});

test("approve --to none records approval and writes nothing", () => {
  const home = setup();
  writeFileSync(paths.plan(home, "e"), "# E\n");
  const p = createProposal(home, "e", phasing, NOW);
  const r = approveTo(home, "e", p.meta.id, { kind: "none" }, undefined, NOW);
  assert.equal(readFileSync(paths.plan(home, "e"), "utf8"), "# E\n");
  assert.equal(r.proposal.meta.outcome, "approved");
  assert.equal(r.wrote, p.path);
});

test("approve --to milestones takes the Milestones section out of a larger body", () => {
  const home = setup();
  const above = "# E\n\n## Approach\nViews first.\n";
  writeFileSync(paths.plan(home, "e"), above);
  const body = "## Milestones\n\n### 1. Views (views)\nGoal.\n\n## Phases\n\n### 1. A (a)\nScope.\n";
  const p = createProposal(home, "e", { ...phasing, body }, NOW);
  approveTo(home, "e", p.meta.id, { kind: "milestones" }, undefined, NOW);
  assert.equal(readFileSync(paths.plan(home, "e"), "utf8"), `${above}\n## Milestones\n\n### 1. Views (views)\nGoal.\n`);
});

test("approve --to milestones requires a Milestones heading", () => {
  const home = setup();
  writeFileSync(paths.plan(home, "e"), "# E\n");
  const p = createProposal(home, "e", { ...phasing, body: "### 1. Views (views)\n" }, NOW);
  assert.throws(() => approveTo(home, "e", p.meta.id, { kind: "milestones" }, undefined, NOW), /must have a '## Milestones' heading/);
  assert.equal(readProposal(home, "e", p.meta.id).meta.outcome, "pending", "a refused proposal stays pending");
});

test("approve --to milestones replaces a legacy Phases section", () => {
  const home = setup();
  const above = "# E\n\n## Approach\nViews first.\n";
  writeFileSync(paths.plan(home, "e"), `${above}\n## Phases\n\n### 1. A (a)\nScope.\n`);
  const p = createProposal(home, "e", { ...phasing, body: "## Milestones\n\n### 1. Views (views)\nGoal.\n" }, NOW);
  approveTo(home, "e", p.meta.id, { kind: "milestones" }, undefined, NOW);
  const plan = readFileSync(paths.plan(home, "e"), "utf8");
  assert.equal(plan, `${above}\n## Milestones\n\n### 1. Views (views)\nGoal.\n`);
  assert.doesNotMatch(plan, /## Phases/);
});

test("approve --to milestones with no entries removes Phases and writes no heading", () => {
  const home = setup();
  const above = "# E\n\n## Approach\nViews first.\n";
  writeFileSync(paths.plan(home, "e"), `${above}\n## Milestones\n\n### 1. Views (views)\nGoal.\n`);
  const p = createProposal(home, "e", { ...phasing, body: "## Milestones\n" }, NOW);
  approveTo(home, "e", p.meta.id, { kind: "milestones" }, undefined, NOW);
  const plan = readFileSync(paths.plan(home, "e"), "utf8");
  assert.equal(plan, above);
  assert.doesNotMatch(plan, /## (Milestones|Phases)/);
});

test("collapsed milestone entries expand from plan.md", () => {
  const home = setup();
  const above = "# E\n\n## Approach\nViews first.\n";
  writeFileSync(paths.plan(home, "e"), `${above}\n## Milestones\n\n### 1. Views (views)\nGoal one.\n`);
  const p = createProposal(home, "e", { ...phasing, body: "## Milestones\n\n### 1. Views (views): unchanged\n\n### 2. Docs (docs)\nGoal two.\n" }, NOW);
  approveTo(home, "e", p.meta.id, { kind: "milestones" }, undefined, NOW);
  assert.equal(readFileSync(paths.plan(home, "e"), "utf8"), `${above}\n## Milestones\n\n### 1. Views (views)\nGoal one.\n\n### 2. Docs (docs)\nGoal two.\n`);
  assert.match(readProposal(home, "e", p.meta.id).body, /\(views\): unchanged/, "the proposal keeps the collapsed text");

  const renamed = createProposal(home, "e", { ...phasing, body: "## Milestones\n\n### 1. Views (screens): unchanged\n" }, NOW);
  assert.throws(() => approveTo(home, "e", renamed.meta.id, { kind: "milestones" }, undefined, NOW), /write the entry in full/);
  const missing = createProposal(home, "e", { ...phasing, body: "## Milestones\n\n### 5. Docs (docs): unchanged\n" }, NOW);
  assert.throws(() => approveTo(home, "e", missing.meta.id, { kind: "milestones" }, undefined, NOW), /plan\.md has no entry 5/);
});

test("--to phases is refused", () => {
  assert.throws(() => parseDestination("phases"), /--to must be plan, milestones, none, phase:<n>, or review/);
});

test("approveTo refuses to flip a rejected proposal without --from", () => {
  const home = setup();
  const p = createProposal(home, "e", input, NOW);
  markRejected(home, "e", p.meta.id, "no good");
  assert.throws(() => approveTo(home, "e", p.meta.id, { kind: "plan" }, undefined, NOW), /was rejected/);
  const r = approveTo(home, "e", p.meta.id, { kind: "plan" }, "# Retry\n", NOW);
  assert.equal(r.proposal.meta.outcome, "approved");
  assert.equal(readFileSync(paths.plan(home, "e"), "utf8"), "# Retry\n");
});

test("resolveProposalId accepts numbers, latest, and latest-N", () => {
  const home = setup();
  for (let i = 0; i < 3; i += 1) createProposal(home, "e", input, NOW);
  assert.equal(resolveProposalId(home, "e", "2"), 2);
  assert.equal(resolveProposalId(home, "e", "latest"), 3);
  assert.equal(resolveProposalId(home, "e", "latest-1"), 2);
  assert.equal(resolveProposalId(home, "e", "latest-2"), 1);
  assert.throws(() => resolveProposalId(home, "e", "latest-3"), /no proposal 0/);
  assert.throws(() => resolveProposalId(home, "e", "newest"), /proposal id must be a number, latest, or latest-N/);
  const empty = tmpHome();
  createEpic(empty, { slug: "x", title: "X", repos: ["o/r"] }, NOW);
  assert.throws(() => resolveProposalId(empty, "x", "latest"), /no proposals/);
});

test("tagProposal appends a notes line in the report's format", () => {
  const home = setup();
  createProposal(home, "e", input, NOW);
  assert.equal(tagProposal(home, "e", 1, "reorder"), "- proposal 1 · reorder");
  tagProposal(home, "e", 1, "style");
  assert.equal(readFileSync(paths.notes(home, "e"), "utf8"), "- proposal 1 · reorder\n- proposal 1 · style\n");
  assert.throws(() => tagProposal(home, "e", 9, "style"), /no proposal 9/);
});
