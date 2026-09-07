import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { NOW, SESSION, tmpHome } from "./helpers.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { newPhases, readPhase } from "../cli/lib/phase.ts";
import { approveTo, createProposal, editedPath, findProposalByToolUse, latestPending, latestProposalId, listProposals, markApproved, markRejected, nextProposalId, parseDestination, proposalFileName, readProposal, resolveProposalId, tagProposal } from "../cli/lib/proposal.ts";
import { paths } from "../cli/lib/store.ts";

const input = { step: "phasing" as const, phase: null, session: SESSION, toolUse: "toolu_1", planFile: "/plans/x.md", body: "# Phases\n\n1. A\n2. B\n" };

function setup(): string {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
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

test("markApproved records edits only when the text differs", () => {
  const home = setup();
  const p = createProposal(home, "e", input, NOW);
  const same = markApproved(home, "e", p.meta.id, `${input.body}\n`);
  assert.equal(same.meta.outcome, "approved");
  assert.equal(same.meta.edited, false);
  assert.ok(!existsSync(editedPath(same.path)));

  const q = createProposal(home, "e", input, NOW);
  const edited = markApproved(home, "e", q.meta.id, "# Phases\n\n1. B\n2. A\n");
  assert.equal(edited.meta.edited, true);
  assert.equal(readFileSync(editedPath(edited.path), "utf8"), "# Phases\n\n1. B\n2. A\n");
  assert.deepEqual(listProposals(home, "e").map((x) => x.meta.id), [1, 2], "edited file is not a proposal");
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
  assert.throws(() => parseDestination("phase:x"), /--to must be plan or phase:<n>/);

  const home = setup();
  const p = createProposal(home, "e", input, NOW);
  markApproved(home, "e", p.meta.id, "# Edited\n");
  const r = approveTo(home, "e", p.meta.id, { kind: "plan" });
  assert.equal(r.wrote, paths.plan(home, "e"));
  assert.equal(readFileSync(paths.plan(home, "e"), "utf8"), "# Edited\n");

  const q = createProposal(home, "e", { ...input, step: "phase-plan", phase: 1 }, NOW);
  const r2 = approveTo(home, "e", q.meta.id, { kind: "phase", id: 1 });
  assert.equal(r2.proposal.meta.outcome, "approved", "pending proposal is approved by approveTo");
  assert.equal(readPhase(home, "e", 1).body, input.body);
  assert.match(r2.wrote, /01-a\.md$/);

  const s = createProposal(home, "e", input, NOW);
  approveTo(home, "e", s.meta.id, { kind: "plan" }, "# From file\n");
  assert.equal(readFileSync(paths.plan(home, "e"), "utf8"), "# From file\n");
  assert.equal(readProposal(home, "e", s.meta.id).meta.edited, true);
});

test("approveTo refuses to flip a rejected proposal without --from", () => {
  const home = setup();
  const p = createProposal(home, "e", input, NOW);
  markRejected(home, "e", p.meta.id, "no good");
  assert.throws(() => approveTo(home, "e", p.meta.id, { kind: "plan" }), /was rejected/);
  const r = approveTo(home, "e", p.meta.id, { kind: "plan" }, "# Retry\n");
  assert.equal(r.proposal.meta.outcome, "approved");
  assert.equal(r.proposal.meta.edited, true);
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
  createEpic(empty, { slug: "x", title: "X", repo: "o/r" }, NOW);
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
