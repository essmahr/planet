import { test } from "node:test";
import assert from "node:assert/strict";
import { NOW, ctx, fakeGh, run, tmpHome } from "./helpers.ts";
import { createEpic, readEpic, writeEpic } from "../cli/lib/epic.ts";
import { linkPrs } from "../cli/lib/link.ts";
import { newPhases, readPhase, setPhaseStatus } from "../cli/lib/phase.ts";
import { syncEpic } from "../cli/lib/sync.ts";
import { git } from "../cli/lib/store.ts";

const PR1 = "https://github.com/o/r/pull/1";
const PR2 = "https://github.com/o/r/pull/2";
const LATER = "2026-09-03T15:10:00.000Z";

function setup(): string {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }, { slug: "b", title: "B" }]);
  linkPrs(home, "e", 1, [PR1, PR2], NOW);
  return home;
}

test("syncEpic updates pr state and ships the phase when every pr is merged", async () => {
  const home = setup();
  const gh = fakeGh({
    [PR1]: { url: PR1, state: "merged", merged_at: "2026-09-03T15:05:00Z" },
    [PR2]: { url: PR2, state: "open", merged_at: null },
  });
  const first = await syncEpic(home, "e", gh, NOW);
  assert.deepEqual(first.changes, [`phase 1: ${PR1} open -> merged`]);
  assert.equal(readPhase(home, "e", 1).meta.status, "in-progress");
  assert.equal(readEpic(home, "e").synced_at, NOW);

  const gh2 = fakeGh({ [PR2]: { url: PR2, state: "merged", merged_at: "2026-09-03T15:09:00Z" } });
  const second = await syncEpic(home, "e", gh2, LATER, { force: true });
  assert.deepEqual(second.changes, [`phase 1: ${PR2} open -> merged`, "phase 1: shipped"]);
  assert.deepEqual(gh2.calls, ["prStates:1"], "only open prs are queried");
  const phase = readPhase(home, "e", 1);
  assert.equal(phase.meta.status, "shipped");
  assert.equal(phase.meta.shipped_at, LATER);
});

test("syncEpic skips fresh epics unless forced, and skips terminal epics", async () => {
  const home = setup();
  const gh = fakeGh({ [PR1]: { url: PR1, state: "open", merged_at: null }, [PR2]: { url: PR2, state: "open", merged_at: null } });
  await syncEpic(home, "e", gh, NOW);
  const fresh = await syncEpic(home, "e", gh, "2026-09-03T15:02:00.000Z");
  assert.equal(fresh.skipped, true);
  const forced = await syncEpic(home, "e", gh, "2026-09-03T15:02:00.000Z", { force: true });
  assert.equal(forced.skipped, false);
  const aged = await syncEpic(home, "e", gh, "2026-09-03T15:08:00.000Z");
  assert.equal(aged.skipped, false);
  assert.equal(gh.calls.length, 3);

  createEpic(home, { slug: "done", title: "Done", repo: "o/r" }, NOW);
  const doneEpic = readEpic(home, "done");
  doneEpic.status = "shipped";
  writeEpic(home, doneEpic);
  const terminal = await syncEpic(home, "done", gh, NOW, { force: true });
  assert.equal(terminal.skipped, true);
  assert.equal(gh.calls.length, 3, "terminal epics are skipped before any gh call");
});

test("syncEpic reports stale when gh is unavailable and writes nothing", async () => {
  const home = setup();
  const r = await syncEpic(home, "e", fakeGh({}, {}, true), NOW);
  assert.equal(r.stale, true);
  assert.deepEqual(r.changes, []);
  assert.equal(readEpic(home, "e").synced_at, null);
});

test("closed prs are recorded without changing the phase", async () => {
  const home = setup();
  const gh = fakeGh({ [PR1]: { url: PR1, state: "closed", merged_at: null }, [PR2]: { url: PR2, state: "merged", merged_at: NOW } });
  await syncEpic(home, "e", gh, NOW);
  const phase = readPhase(home, "e", 1);
  assert.equal(phase.meta.status, "in-progress");
  assert.equal(phase.meta.prs[0].state, "closed");
});

test("epic ships when every phase is reviewed", async () => {
  const home = tmpHome();
  createEpic(home, { slug: "s", title: "S", repo: "o/r" }, NOW);
  newPhases(home, "s", [{ slug: "a", title: "A" }]);
  linkPrs(home, "s", 1, [PR1], NOW);
  const gh = fakeGh({ [PR1]: { url: PR1, state: "merged", merged_at: NOW } });
  await syncEpic(home, "s", gh, NOW);
  assert.equal(readPhase(home, "s", 1).meta.status, "shipped");

  setPhaseStatus(home, "s", 1, "reviewed");
  const result = await syncEpic(home, "s", gh, LATER, { force: true });
  const epic = readEpic(home, "s");
  assert.equal(epic.status, "shipped");
  assert.equal(epic.shipped_at, LATER);
  assert.ok(result.changes.includes("epic: shipped"));
});

test("sync command commits once and names changed epics", async () => {
  const home = setup();
  const gh = fakeGh({ [PR1]: { url: PR1, state: "merged", merged_at: NOW }, [PR2]: { url: PR2, state: "merged", merged_at: NOW } });
  const r = await run(["sync", "--json"], ctx(home, { gh }));
  assert.equal(r.code, 0);
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "sync: e");
  const quiet = await run(["sync", "e", "--force"], ctx(home, { gh }));
  assert.equal(quiet.stdout, "e: no changes\n");
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "sync: e", "no commit without changes");
});
