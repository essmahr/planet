import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE, NOW, PR, SESSION, comment, ctx, fakeGh, run, tmpHome } from "./helpers.ts";
import type { PrFeedback } from "../cli/lib/gh.ts";
import { GhUnavailable } from "../cli/lib/gh.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { linkPrs } from "../cli/lib/link.ts";
import { newPhases } from "../cli/lib/phase.ts";
import { paths } from "../cli/lib/store.ts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const PR2 = "https://github.com/o/r/pull/8";
const OTHER = "sess-2";
const quiet = BASE;
const withComment: PrFeedback = { ...BASE, comments: [comment("C1", "ana", false)] };

function setup(prs: string[] = [PR]): string {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repos: ["o/r"] }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  if (prs.length) linkPrs(home, "e", 1, prs, NOW);
  return home;
}

test("a phase with no linked pr stops", async () => {
  const r = await run(["watch", "e", "1"], ctx(setup([])));
  assert.match(r.stdout, /^phase 1: no linked pr\ninvoke .* event: stopped\n$/);
});

test("an open PR with new comments does not wake the watcher", async () => {
  const home = setup();
  const gh = fakeGh({}, {}, false, undefined, { [PR]: withComment });
  const r = await run(["watch", "e", "1", "--max-polls", "2", "--json"], ctx(home, { gh }));
  assert.equal((r.json as { event: string }).event, "stopped");
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
  const gh = fakeGh({}, {}, false, undefined, { [PR]: [down, down, quiet, down, down, down, down, { ...BASE, state: "merged" }] });
  const sleeps: number[] = [];
  const r = await run(["watch", "e", "1"], ctx(home, { gh, sleep: async (ms) => { sleeps.push(ms); } }));
  assert.deepEqual(sleeps, [60000, 120000, 60000, 60000, 120000, 240000, 480000]);
  assert.match(r.stdout, /event: merged\n$/);
});

test("any gh error backs off and stops after five failures", async () => {
  const home = setup();
  const sleeps: number[] = [];
  const gh = fakeGh({}, {}, false, undefined, { [PR]: [new Error("bad json")] });
  const r = await run(["watch", "e", "1"], ctx(home, { gh, sleep: async (ms) => { sleeps.push(ms); } }));
  assert.equal(r.code, 0);
  assert.deepEqual(sleeps, [60000, 120000, 240000, 480000]);
  assert.match(r.stdout, /phase 1: gh failed \(bad json\)\ninvoke .* event: stopped\n$/);
});

test("a missing phase stops at once", async () => {
  const r = await run(["watch", "e", "9"], ctx(setup()));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /^phase 9: store error \(no phase 9 in epic 'e'\)\ninvoke planet:planet-pr-feedback epic: e phase: 9 event: stopped\n$/);
});

test("a second watcher for a live pid exits without an invoke line", async () => {
  const home = setup();
  mkdirSync(dirname(paths.watchPid(home, "e", 1)), { recursive: true });
  writeFileSync(paths.watchPid(home, "e", 1), `999 ${SESSION}\n`);
  const gh = fakeGh({}, {}, false, undefined, { [PR]: withComment });
  const r = await run(["watch", "e", "1"], ctx(home, { gh, pid: 1000, isAlive: (pid) => pid === 999 }));
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "phase 1: watcher already running (pid 999)\n");
  assert.deepEqual(gh.calls, []);
  assert.equal(readFileSync(paths.watchPid(home, "e", 1), "utf8"), `999 ${SESSION}\n`);
});

test("a dead pid file is taken over, held while polling, and removed on exit", async () => {
  const home = setup();
  const pidFile = paths.watchPid(home, "e", 1);
  mkdirSync(dirname(pidFile), { recursive: true });
  writeFileSync(pidFile, "999\n");
  const held: string[] = [];
  const gh = fakeGh({}, {}, false, undefined, { [PR]: [quiet, { ...BASE, state: "merged" }] });
  const r = await run(["watch", "e", "1"], ctx(home, { gh, pid: 1000, isAlive: () => false, sleep: async () => { held.push(readFileSync(pidFile, "utf8")); } }));
  assert.match(r.stdout, /event: merged\n$/);
  assert.deepEqual(held, [`1000 ${SESSION}\n`]);
  assert.equal(existsSync(pidFile), false);
});

test("an interval below one second is refused", async () => {
  const r = await run(["watch", "e", "1", "--interval", "0"], ctx(setup()));
  assert.equal(r.code, 1);
  assert.match(r.stderr, /--interval must be an integer of at least 1/);
});

test("feedback on a merged sibling pr does not wake the watcher", async () => {
  const home = setup([PR, PR2]);
  const gh = fakeGh({}, {}, false, undefined, {
    [PR]: { ...withComment, state: "merged" },
    [PR2]: { ...BASE, url: PR2 },
  });
  const r = await run(["watch", "e", "1", "--max-polls", "1"], ctx(home, { gh }));
  assert.match(r.stdout, /^phase 1: max polls reached\ninvoke .* event: stopped\n$/);
});

test("a watcher replaces a live watcher from another session", async () => {
  const home = setup();
  const pidFile = paths.watchPid(home, "e", 1);
  mkdirSync(dirname(pidFile), { recursive: true });
  writeFileSync(pidFile, `999 ${OTHER}\n`);
  const held: string[] = [];
  const gh = fakeGh({}, {}, false, undefined, { [PR]: [quiet, { ...BASE, state: "merged" }] });
  const r = await run(["watch", "e", "1"], ctx(home, { gh, pid: 1000, isAlive: (pid) => pid === 999, sleep: async () => { held.push(readFileSync(pidFile, "utf8")); } }));
  assert.deepEqual(held, [`1000 ${SESSION}\n`]);
  assert.match(r.stdout, /event: merged\n$/);
});

