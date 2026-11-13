import { test } from "node:test";
import assert from "node:assert/strict";
import { NOW, PR, SESSION, ctx, run, tmpHome } from "./helpers.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { linkPrs } from "../cli/lib/link.ts";
import { newPhases, readPhase, writePhase } from "../cli/lib/phase.ts";
import { ownPrs, ownedOpenPrs } from "../cli/lib/owner.ts";

const PR2 = "https://github.com/o/r/pull/8";

function setup(): string {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repos: ["o/r"] }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }, { slug: "b", title: "B" }]);
  return home;
}

test("a PR linked by the hook records the session", () => {
  const home = setup();
  linkPrs(home, "e", 1, [PR], NOW, SESSION);
  assert.equal(readPhase(home, "e", 1).meta.prs[0].session, SESSION);
});

test("ownedOpenPrs returns only open PRs of that session", () => {
  const home = setup();
  linkPrs(home, "e", 1, [PR], NOW, SESSION);
  linkPrs(home, "e", 2, [PR2], NOW, "sess-2");
  assert.deepEqual(ownedOpenPrs(home, SESSION), [{ epic: "e", phase: 1, url: PR }]);
});

test("ownedOpenPrs skips merged PRs", () => {
  const home = setup();
  linkPrs(home, "e", 1, [PR], NOW, SESSION);
  const phase = readPhase(home, "e", 1);
  phase.meta.prs[0].state = "merged";
  writePhase(phase);
  assert.deepEqual(ownedOpenPrs(home, SESSION), []);
});

test("ownPrs sets the session on every PR of the phase and returns their urls", () => {
  const home = setup();
  linkPrs(home, "e", 1, [PR, PR2], NOW, "sess-2");
  assert.deepEqual(ownPrs(home, "e", 1, SESSION), [PR, PR2]);
  assert.deepEqual(readPhase(home, "e", 1).meta.prs.map((p) => p.session), [SESSION, SESSION]);
});

test("pr own moves every PR of the phase to this session", async () => {
  const home = setup();
  linkPrs(home, "e", 1, [PR], NOW, null);
  const r = await run(["pr", "own", "e", "1"], ctx(home));
  assert.equal(r.stdout.trim(), "phase 1: feedback owned by this session");
  assert.equal(readPhase(home, "e", 1).meta.prs[0].session, SESSION);
});
