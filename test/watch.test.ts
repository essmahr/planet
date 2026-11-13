import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE, LINT, NOW, PR, SESSION, comment, ctx, fakeGh, run, tmpHome } from "./helpers.ts";
import type { PrFeedback, Reaction } from "../cli/lib/gh.ts";
import { GhUnavailable } from "../cli/lib/gh.ts";
import { worktreePath } from "../cli/lib/drafts.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { linkPrs } from "../cli/lib/link.ts";
import { newPhases } from "../cli/lib/phase.ts";
import { recordCheckout } from "../cli/lib/repos.ts";
import { paths } from "../cli/lib/store.ts";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const PR2 = "https://github.com/o/r/pull/8";
const OTHER = "sess-2";
const quiet = BASE;
const withComment: PrFeedback = { ...BASE, comments: [comment("C1", "ana", false)] };
const reacted = (id: string, reactions: Reaction[]) => ({ ...comment(id, "ana", false), viewer_reactions: reactions });
const up: PrFeedback = { ...BASE, comments: [reacted("C1", ["THUMBS_UP"])] };
const upAndEyes: PrFeedback = { ...BASE, comments: [reacted("C1", ["THUMBS_UP"]), reacted("C2", ["EYES"])] };
const FEEDBACK = "invoke planet:planet-pr-feedback epic: e phase: 1 event: feedback";

function setup(prs: string[] = [PR], session: string | null = SESSION): string {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repos: ["o/r"] }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  if (prs.length) linkPrs(home, "e", 1, prs, NOW, session);
  return home;
}

function setupWithCheckout(): { home: string; checkout: string; worktree: string } {
  const home = setup();
  const dir = join(realpathSync(mkdtempSync(join(tmpdir(), "planet-ws-"))), "r");
  mkdirSync(dir);
  execFileSync("git", ["-C", dir, "init", "-q"]);
  execFileSync("git", ["-C", dir, "remote", "add", "origin", "https://github.com/o/r.git"]);
  const checkout = recordCheckout(home, dir).path;
  return { home, checkout, worktree: worktreePath(checkout, "e", 1, PR) };
}

function sleeper(): { sleeps: number[]; sleep: (ms: number) => Promise<void> } {
  const sleeps: number[] = [];
  return { sleeps, sleep: async (ms) => { sleeps.push(ms); } };
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

test("a successful poll resets the failure count", async () => {
  const home = setup();
  const down = new GhUnavailable("offline");
  const gh = fakeGh({}, {}, false, undefined, { [PR]: [down, down, quiet, down, down, down, down, { ...BASE, state: "merged" }] });
  const { sleeps, sleep } = sleeper();
  const r = await run(["watch", "e", "1"], ctx(home, { gh, sleep }));
  assert.deepEqual(sleeps, [60000, 120000, 60000, 60000, 120000, 240000, 480000]);
  assert.match(r.stdout, /event: merged\n$/);
});

test("gh failures back off and never stop the watcher", async () => {
  const home = setup();
  const down = new GhUnavailable("offline");
  const gh = fakeGh({}, {}, false, undefined, { [PR]: [down, down, down, down, down, down, down, new Error("bad json"), quiet] });
  const { sleeps, sleep } = sleeper();
  const r = await run(["watch", "e", "1", "--max-polls", "9"], ctx(home, { gh, sleep }));
  assert.equal(r.code, 0);
  assert.deepEqual(sleeps, [60000, 120000, 240000, 480000, 900000, 900000, 900000, 900000]);
  assert.match(r.stdout, /^phase 1: max polls reached\ninvoke .* event: stopped\n$/);
});

test("a missing phase stops at once", async () => {
  const r = await run(["watch", "e", "9"], ctx(setup()));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /^phase 9: store error \(no phase 9 in epic 'e'\)\ninvoke planet:planet-pr-feedback epic: e phase: 9 event: stopped\n$/);
});

test("a second watcher for a live pid exits without an invoke line", async () => {
  const home = setup();
  const pidFile = paths.watchPid(home, "e", 1, SESSION);
  mkdirSync(dirname(pidFile), { recursive: true });
  writeFileSync(pidFile, `999 ${SESSION}\n`);
  const gh = fakeGh({}, {}, false, undefined, { [PR]: withComment });
  const r = await run(["watch", "e", "1"], ctx(home, { gh, pid: 1000, isAlive: (pid) => pid === 999 }));
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "phase 1: watcher already running (pid 999)\n");
  assert.deepEqual(gh.calls, []);
  assert.equal(readFileSync(pidFile, "utf8"), `999 ${SESSION}\n`);
});

test("a dead pid file is taken over, held while polling, and removed on exit", async () => {
  const home = setup();
  const pidFile = paths.watchPid(home, "e", 1, SESSION);
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
    [PR]: { ...up, state: "merged" },
    [PR2]: { ...BASE, url: PR2 },
  });
  const r = await run(["watch", "e", "1", "--max-polls", "1"], ctx(home, { gh }));
  assert.match(r.stdout, /^phase 1: max polls reached\ninvoke .* event: stopped\n$/);
});

test("a live watcher from another session does not block this one", async () => {
  const home = setup();
  const otherFile = paths.watchPid(home, "e", 1, OTHER);
  mkdirSync(dirname(otherFile), { recursive: true });
  writeFileSync(otherFile, `999 ${OTHER}\n`);
  const gh = fakeGh({}, {}, false, undefined, { [PR]: [quiet, { ...BASE, state: "merged" }] });
  const r = await run(["watch", "e", "1"], ctx(home, { gh, pid: 1000, isAlive: (pid) => pid === 999 }));
  assert.match(r.stdout, /event: merged\n$/);
  assert.equal(readFileSync(otherFile, "utf8"), `999 ${OTHER}\n`);
});

test("two sessions keep separate pid files", () => {
  const home = tmpHome();
  assert.notEqual(paths.watchPid(home, "e", 1, "sess-1"), paths.watchPid(home, "e", 1, "sess-2"));
  assert.equal(paths.watchPid(home, "e", 1), join(home, "run", "e-1.pid"));
  assert.equal(paths.watchPid(home, "e", 1, "abcdefghijkl"), join(home, "run", "e-1-abcdefgh.pid"));
});

test("a signal seen on two polls in a row wakes the session", async () => {
  const home = setup();
  const gh = fakeGh({}, {}, false, undefined, { [PR]: [quiet, up, up] });
  const { sleeps, sleep } = sleeper();
  const r = await run(["watch", "e", "1"], ctx(home, { gh, sleep }));
  assert.deepEqual(sleeps, [60000, 60000]);
  const lines = r.stdout.trim().split("\n");
  assert.equal(lines[0], `phase 1: 1 open signals on ${PR}`);
  assert.equal(lines.at(-1), FEEDBACK);
});

test("a changing set of signals waits for it to settle", async () => {
  const home = setup();
  const gh = fakeGh({}, {}, false, undefined, { [PR]: [up, upAndEyes, upAndEyes] });
  const { sleeps, sleep } = sleeper();
  const r = await run(["watch", "e", "1"], ctx(home, { gh, sleep }));
  assert.deepEqual(sleeps, [60000, 60000]);
  assert.equal(r.stdout.split("\n")[0], `phase 1: 2 open signals on ${PR}`);
  assert.match(r.stdout, /event: feedback\n$/);
});

test("a thumbs up removed before the second poll does not wake", async () => {
  const home = setup();
  const gh = fakeGh({}, {}, false, undefined, { [PR]: [up, quiet, quiet] });
  const r = await run(["watch", "e", "1", "--max-polls", "3"], ctx(home, { gh }));
  assert.match(r.stdout, /^phase 1: max polls reached\ninvoke .* event: stopped\n$/);
});

test("a failed poll forgets the previous signals", async () => {
  const home = setup();
  const gh = fakeGh({}, {}, false, undefined, { [PR]: [up, new Error("boom"), up] });
  const r = await run(["watch", "e", "1", "--max-polls", "3"], ctx(home, { gh }));
  assert.match(r.stdout, /event: stopped\n$/);
});

test("a drafted thumbs up does not wake", async () => {
  const { home, worktree } = setupWithCheckout();
  const gh = fakeGh({}, {}, false, undefined, { [PR]: up });
  const git = (dir: string) => (dir === worktree ? "u/C1" : null);
  const r = await run(["watch", "e", "1", "--max-polls", "2"], ctx(home, { gh, git }));
  assert.match(r.stdout, /^phase 1: max polls reached\ninvoke .* event: stopped\n$/);
});

test("a pushed thumbs up wakes so the swap can finish", async () => {
  const { home, checkout } = setupWithCheckout();
  const gh = fakeGh({}, {}, false, undefined, { [PR]: up });
  const git = (dir: string) => (dir === checkout ? "u/C1" : null);
  const r = await run(["watch", "e", "1"], ctx(home, { gh, git }));
  assert.equal(r.stdout.split("\n")[0], `phase 1: 1 open signals on ${PR}`);
  assert.match(r.stdout, /event: feedback\n$/);
});

test("an orphan draft wakes", async () => {
  const { home, worktree } = setupWithCheckout();
  const gh = fakeGh({}, {}, false, undefined, { [PR]: quiet });
  const git = (dir: string) => (dir === worktree ? "u/C1" : null);
  const r = await run(["watch", "e", "1"], ctx(home, { gh, git }));
  assert.equal(r.stdout.split("\n")[0], `phase 1: 1 open signals on ${PR}`);
  assert.match(r.stdout, /event: feedback\n$/);
});

test("a failing check alone never wakes", async () => {
  const home = setup();
  const gh = fakeGh({}, {}, false, undefined, { [PR]: { ...BASE, failed_checks: [LINT] } });
  const r = await run(["watch", "e", "1", "--max-polls", "2"], ctx(home, { gh }));
  assert.match(r.stdout, /^phase 1: max polls reached\ninvoke .* event: stopped\n$/);
});

test("a watcher for a PR another session owns exits quietly", async () => {
  const home = setup([PR], OTHER);
  const gh = fakeGh({}, {}, false, undefined, { [PR]: up });
  const r = await run(["watch", "e", "1", "--json"], ctx(home, { gh }));
  assert.equal((r.json as { event: null }).event, null);
  assert.equal((await run(["watch", "e", "1"], ctx(home, { gh }))).stdout.trim(), "phase 1: no PR owned by this session");
  assert.deepEqual(gh.calls, []);
  assert.equal(existsSync(paths.watchPid(home, "e", 1, SESSION)), false);
});

test("a PR another session owns is never fetched", async () => {
  const home = setup([PR]);
  linkPrs(home, "e", 1, [PR2], NOW, OTHER);
  const gh = fakeGh({}, {}, false, undefined, { [PR]: [quiet, { ...BASE, state: "merged" }], [PR2]: up });
  const r = await run(["watch", "e", "1"], ctx(home, { gh }));
  assert.match(r.stdout, /event: merged\n$/);
  assert.deepEqual([...new Set(gh.calls)], [`prFeedback:${PR}`]);
});

test("without a session id the watcher covers every PR", async () => {
  const home = setup([PR, PR2], OTHER);
  const gh = fakeGh({}, {}, false, undefined, { [PR]: { ...BASE, state: "merged" }, [PR2]: [{ ...BASE, url: PR2 }, { ...BASE, url: PR2, state: "merged" }] });
  const r = await run(["watch", "e", "1"], ctx(home, { gh, env: {} }));
  assert.match(r.stdout, /event: merged\n$/);
  assert.ok(gh.calls.includes(`prFeedback:${PR2}`));
});

test("each PR is fetched once per poll", async () => {
  const home = setup();
  const gh = fakeGh({}, {}, false, undefined, { [PR]: [up, up] });
  await run(["watch", "e", "1"], ctx(home, { gh }));
  assert.deepEqual(gh.calls, [`prFeedback:${PR}`, `prFeedback:${PR}`]);
});
