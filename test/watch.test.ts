import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE, NOW, PR, comment, ctx, fakeGh, run, tmpHome } from "./helpers.ts";
import type { PrFeedback } from "../cli/lib/gh.ts";
import { GhUnavailable } from "../cli/lib/gh.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { linkPrs } from "../cli/lib/link.ts";
import { newPhases } from "../cli/lib/phase.ts";
import { addMarks } from "../cli/lib/pr-items.ts";
import { git } from "../cli/lib/store.ts";

const PR2 = "https://github.com/o/r/pull/8";
const quiet = BASE;
const withComment: PrFeedback = { ...BASE, comments: [comment("C1", "ana", false)] };

function setup(prs: string[] = [PR]): string {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  if (prs.length) linkPrs(home, "e", 1, prs, NOW);
  return home;
}

test("watch exits on the first poll with an item not yet notified", async () => {
  const home = setup();
  const gh = fakeGh({}, {}, false, undefined, { [PR]: [quiet, withComment] });
  const sleeps: number[] = [];
  const r = await run(["watch", "e", "1"], ctx(home, { gh, sleep: async (ms) => { sleeps.push(ms); } }));
  assert.equal(r.code, 0);
  assert.deepEqual(sleeps, [60000]);
  const lines = r.stdout.trim().split("\n");
  assert.equal(lines[0], `phase 1: 1 new feedback items on ${PR}`);
  assert.equal(lines.at(-1), "invoke planet:planet-pr-feedback epic: e phase: 1 event: feedback");
});

test("notified items do not wake; max polls stops", async () => {
  const home = setup();
  addMarks(home, "e", 1, "notified", ["C1"]);
  const r = await run(["watch", "e", "1", "--max-polls", "2"], ctx(home, { gh: fakeGh({}, {}, false, undefined, { [PR]: withComment }) }));
  assert.match(r.stdout, /max polls reached\ninvoke planet:planet-pr-feedback epic: e phase: 1 event: stopped\n$/);
});

test("a phase with no linked pr stops", async () => {
  const r = await run(["watch", "e", "1"], ctx(setup([])));
  assert.match(r.stdout, /^phase 1: no linked pr\ninvoke .* event: stopped\n$/);
});

test("one merged pr next to an open one keeps polling; all merged reports merged", async () => {
  const home = setup([PR, PR2]);
  const gh = fakeGh({}, {}, false, undefined, {
    [PR]: { ...BASE, state: "merged" },
    [PR2]: [{ ...BASE, url: PR2 }, { ...BASE, url: PR2, state: "merged" }],
  });
  const r = await run(["watch", "e", "1"], ctx(home, { gh }));
  assert.match(r.stdout, /event: merged\n$/);
  assert.equal(gh.calls.filter((c) => c === `prFeedback:${PR2}`).length, 2);
});

test("a closed pr without merge reports closed", async () => {
  const home = setup();
  const gh = fakeGh({}, {}, false, undefined, { [PR]: { ...BASE, state: "closed" } });
  const r = await run(["watch", "e", "1"], ctx(home, { gh }));
  assert.match(r.stdout, /event: closed\n$/);
});

test("gh unavailable backs off and stops after five failures", async () => {
  const home = setup();
  const sleeps: number[] = [];
  const r = await run(["watch", "e", "1"], ctx(home, { gh: fakeGh({}, {}, true), sleep: async (ms) => { sleeps.push(ms); } }));
  assert.deepEqual(sleeps, [60000, 120000, 240000, 480000]);
  assert.match(r.stdout, /gh unavailable \(offline\)\ninvoke .* event: stopped\n$/);
});

test("a successful poll resets the failure count", async () => {
  const home = setup();
  const down = new GhUnavailable("offline");
  const gh = fakeGh({}, {}, false, undefined, { [PR]: [down, down, quiet, down, down, down, down, withComment] });
  const sleeps: number[] = [];
  const r = await run(["watch", "e", "1"], ctx(home, { gh, sleep: async (ms) => { sleeps.push(ms); } }));
  assert.deepEqual(sleeps, [60000, 120000, 60000, 60000, 120000, 240000, 480000]);
  assert.match(r.stdout, /event: feedback\n$/);
});

test("watch writes nothing to the store", async () => {
  const home = setup();
  const gh = fakeGh({}, {}, false, undefined, { [PR]: withComment });
  const before = git(home, ["rev-list", "--count", "HEAD"]);
  await run(["watch", "e", "1"], ctx(home, { gh }));
  assert.equal(git(home, ["rev-list", "--count", "HEAD"]), before);
});
