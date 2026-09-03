import { test } from "node:test";
import assert from "node:assert/strict";
import { NOW, tmpHome } from "./helpers.ts";
import { createEpic, readEpic } from "../cli/lib/epic.ts";
import { newPhases, readPhase } from "../cli/lib/phase.ts";
import { PR_URL_RE, linkPrs, unlinkPr } from "../cli/lib/link.ts";

const PR1 = "https://github.com/closeio/close-ui/pull/1234";
const PR2 = "https://github.com/closeio/close-ui/pull/1240";

function setup(): string {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "closeio/close-ui" }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  return home;
}

test("PR_URL_RE extracts owner/repo and tolerates trailing text", () => {
  const m = PR_URL_RE.exec("Created PR https://github.com/closeio/close-ui/pull/77\n");
  assert.equal(m?.[0], "https://github.com/closeio/close-ui/pull/77");
  assert.equal(m?.[1], "closeio/close-ui");
});

test("linkPrs adds PRs, moves the phase to in-progress and the epic to active", () => {
  const home = setup();
  const r = linkPrs(home, "e", 1, [PR1, PR2], NOW);
  assert.deepEqual(r.added, [PR1, PR2]);
  assert.equal(r.phase.meta.status, "in-progress");
  assert.deepEqual(r.phase.meta.prs[0], { url: PR1, state: "open", merged_at: null });
  assert.equal(readEpic(home, "e").status, "active");
  const again = linkPrs(home, "e", 1, [PR1], NOW);
  assert.deepEqual(again.added, []);
  assert.equal(readPhase(home, "e", 1).meta.prs.length, 2);
});

test("linkPrs rejects urls outside the epic repo or not PR urls", () => {
  const home = setup();
  assert.throws(() => linkPrs(home, "e", 1, ["https://github.com/other/repo/pull/1"], NOW), /not in closeio\/close-ui/);
  assert.throws(() => linkPrs(home, "e", 1, ["https://github.com/closeio/close-ui/issues/1"], NOW), /not a GitHub PR url/);
  assert.equal(readEpic(home, "e").status, "planning");
});

test("unlinkPr removes the PR and returns an in-progress phase with no PRs to planned", () => {
  const home = setup();
  linkPrs(home, "e", 1, [PR1], NOW);
  const r = unlinkPr(home, "e", 1, PR1, NOW);
  assert.deepEqual(r.phase.meta.prs, []);
  assert.equal(r.phase.meta.status, "planned");
  assert.throws(() => unlinkPr(home, "e", 1, PR1, NOW), /not linked/);
});
