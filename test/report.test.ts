import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { NOW, SESSION, ctx, fakeGh, run, tmpHome } from "./helpers.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { linkPrs } from "../cli/lib/link.ts";
import { newPhases } from "../cli/lib/phase.ts";
import { appendEvent } from "../cli/lib/events.ts";
import { createProposal, markApproved, markRejected } from "../cli/lib/proposal.ts";
import { buildReport, parseComments, parseTags } from "../cli/lib/report.ts";
import { writeRetro } from "../cli/lib/retro.ts";
import { paths } from "../cli/lib/store.ts";
import { syncEpic } from "../cli/lib/sync.ts";

const PR1 = "https://github.com/o/r/pull/1";
const PR2 = "https://github.com/o/r/pull/2";

test("parseComments extracts inline plan comments", () => {
  const text = 'User chose to stay in plan mode\n\nComments on the plan:\n[Re: "handleOverrides"] `listHandleOverrides`\n[Re: "two\nlines"] no\n[Re: "x"] keep';
  assert.deepEqual(parseComments(text), [
    { quote: "handleOverrides", comment: "`listHandleOverrides`" },
    { quote: "x", comment: "keep" },
  ]);
  assert.deepEqual(parseComments("plain rejection"), []);
});

test("parseTags counts tags from notes.md", () => {
  assert.deepEqual(parseTags("- proposal 3 · reorder\n- proposal 5 · reorder\n- proposal 6 · scope-cut\nrandom line\n"), { reorder: 2, "scope-cut": 1 });
});

test("buildReport aggregates per step with rejections, edits, tags, and prompts", () => {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  const base = { phase: null, session: SESSION, toolUse: null, planFile: null };
  const p1 = createProposal(home, "e", { ...base, step: "phasing", body: "# A\n1\n2\n" }, NOW);
  markRejected(home, "e", p1.meta.id, 'Comments on the plan:\n[Re: "1"] swap');
  const p2 = createProposal(home, "e", { ...base, step: "phasing", body: "# A\n2\n1\n" }, NOW);
  markApproved(home, "e", p2.meta.id, "# A\n2\n1\n3\n");
  createProposal(home, "e", { ...base, step: "scoping", body: "s" }, NOW);
  writeFileSync(paths.notes(home, "e"), "- proposal 1 · reorder\n");
  appendFileSync(paths.prompts(home, "e"), `${JSON.stringify({ ts: NOW, session: SESSION, kind: "planning", phase: null, proposal: 1, text: "swap them" })}\n`);
  appendFileSync(paths.prompts(home, "e"), `${JSON.stringify({ ts: NOW, session: SESSION, kind: "implementation", phase: 1, proposal: 2, text: "go" })}\n`);

  const report = buildReport(home, ["e"]);
  assert.deepEqual(report.steps, [
    { step: "phasing", proposals: 2, approved: 1, rejected: 1, pending: 0, edited: 1, proposals_per_approval: 2 },
    { step: "scoping", proposals: 1, approved: 0, rejected: 0, pending: 1, edited: 0, proposals_per_approval: null },
  ]);
  assert.equal(report.rejections.length, 1);
  assert.deepEqual(report.rejections[0].comments, [{ quote: "1", comment: "swap" }]);
  assert.equal(report.edits.length, 1);
  assert.match(report.edits[0].diff, /^@@/m);
  assert.match(report.edits[0].diff, /^\+3$/m);
  assert.doesNotMatch(report.edits[0].diff, /^diff --git/m);
  assert.doesNotMatch(report.edits[0].diff, /^-id:/m, "frontmatter is not part of the edit diff");
  assert.deepEqual(report.tags, { reorder: 1 });
  assert.deepEqual(report.prompts, { planning: 1, implementation: 1 });
});

test("buildReport removes its temp diff directories after use", () => {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  const base = { phase: null, session: SESSION, toolUse: null, planFile: null };
  const p = createProposal(home, "e", { ...base, step: "phasing", body: "# A\n1\n2\n" }, NOW);
  markApproved(home, "e", p.meta.id, "# A\n2\n1\n3\n");

  const countLeaked = () => readdirSync(tmpdir()).filter((f) => f.startsWith("planet-diff-")).length;
  const before = countLeaked();
  buildReport(home, ["e"]);
  assert.equal(countLeaked(), before);
});

test("pr files sums per path across merged prs", async () => {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  linkPrs(home, "e", 1, [PR1, PR2], NOW);
  const gh = fakeGh(
    { [PR1]: { url: PR1, state: "merged", merged_at: NOW }, [PR2]: { url: PR2, state: "open", merged_at: null } },
    { [PR1]: [{ path: "b.ts", additions: 2, deletions: 1 }, { path: "a.ts", additions: 5, deletions: 0 }], [PR2]: [{ path: "a.ts", additions: 1, deletions: 1 }] },
  );
  await syncEpic(home, "e", gh, NOW);
  const r = await run(["pr", "files", "e", "1", "--json"], ctx(home, { gh }));
  assert.equal(r.code, 0);
  assert.deepEqual(r.json, {
    phase: 1,
    source: "merged",
    prs: [PR1],
    files: [{ path: "a.ts", additions: 5, deletions: 0 }, { path: "b.ts", additions: 2, deletions: 1 }],
  });
  const text = await run(["pr", "files", "e", "1"], ctx(home, { gh }));
  assert.match(text.stdout, /^PATH\s+\+\s+-\n/);
});

test("buildReport adds lessons, skill rejections, events, and reviews", () => {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  const base = { phase: null, session: SESSION, toolUse: null, planFile: null };
  const p1 = createProposal(home, "e", { ...base, step: "phase-plan", body: "x" }, NOW);
  markRejected(home, "e", p1.meta.id, "always name the spec file");
  const p2 = createProposal(home, "e", { ...base, step: "phase-plan", body: "y" }, NOW);
  markRejected(home, "e", p2.meta.id, "drop this phase");
  writeFileSync(paths.notes(home, "e"), `- proposal ${p1.meta.id} · skill\n- proposal ${p2.meta.id} · scope-cut\n`);
  appendEvent(home, "e", { phase: 1, kind: "blocked", text: "c2", session: SESSION }, NOW);
  appendEvent(home, "e", { phase: 1, kind: "implemented", sha: "abc", session: SESSION }, NOW);
  writeRetro(home, "e", 1, "---\nphase: 1\nlessons:\n  - text: name the spec file\n    skill: planet-phase-plan\n    steer: true\n---\nbody\n", NOW, "head1");
  mkdirSync(paths.reviews(home), { recursive: true });
  writeFileSync(paths.reviewFile(home, "2026-09-01", 1), "# Findings\n\n## Recurring\n\n### Name the spec file in phase plans\n\ntext\n\n## Appendix\n");
  const report = buildReport(home, ["e"]);
  assert.deepEqual(report.lessons, [{ epic: "e", phase: 1, text: "name the spec file", skill: "planet-phase-plan", steer: true }]);
  assert.deepEqual(report.skill_rejections.map((r) => r.feedback), ["always name the spec file"]);
  assert.deepEqual(report.events, { blocked: 1, implemented: 1 });
  assert.deepEqual(report.reviews, [{ date: "2026-09-01", path: paths.reviewFile(home, "2026-09-01", 1), groups: ["Name the spec file in phase plans"] }]);
});

test("feedback report command renders a summary", async () => {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  createProposal(home, "e", { step: "intake", phase: null, session: SESSION, toolUse: null, planFile: null, body: "x" }, NOW);
  const r = await run(["feedback", "report", "e"], ctx(home));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /intake\s+1\s+0\s+0\s+1\s+0/);
});
