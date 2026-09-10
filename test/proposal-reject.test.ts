import { test } from "node:test";
import assert from "node:assert/strict";
import { NOW, SESSION, ctx, run, tmpHome } from "./helpers.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { createProposal, readProposal } from "../cli/lib/proposal.ts";

test("planet proposal reject marks a pending proposal rejected with feedback", async () => {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  const p = createProposal(home, "e", { step: "scoping", phase: null, session: SESSION, toolUse: null, planFile: null, body: "x" }, NOW);
  const r = await run(["proposal", "reject", "e", "latest", "--feedback", "keep the current plan", "--json"], ctx(home));
  assert.equal(r.code, 0);
  const after = readProposal(home, "e", p.meta.id);
  assert.equal(after.meta.outcome, "rejected");
  assert.equal(after.meta.feedback, "keep the current plan");
  const again = await run(["proposal", "reject", "e", "latest"], ctx(home));
  assert.equal(again.code, 0);
  assert.match(again.stdout, /proposal 1 already rejected/);
  assert.equal(readProposal(home, "e", p.meta.id).meta.feedback, "keep the current plan");
});

test("planet proposal reject refuses latest from another session, but a plain id bypasses the check", async () => {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  createProposal(home, "e", { step: "scoping", phase: null, session: "other", toolUse: null, planFile: null, body: "x" }, NOW);
  const refused = await run(["proposal", "reject", "e", "latest"], ctx(home));
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /from another session/);
  const rejected = await run(["proposal", "reject", "e", "1"], ctx(home));
  assert.equal(rejected.code, 0);
});

test("planet proposal tag accepts skill", async () => {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  createProposal(home, "e", { step: "scoping", phase: null, session: SESSION, toolUse: null, planFile: null, body: "x" }, NOW);
  const r = await run(["proposal", "tag", "e", "latest", "skill"], ctx(home));
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), "- proposal 1 · skill");
});
