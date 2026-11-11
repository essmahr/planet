import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE, LINT, NOW, PR, comment, convo, ctx, fakeGh, review, run, tmpHome } from "./helpers.ts";
import type { PrFeedback } from "../cli/lib/gh.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { linkPrs } from "../cli/lib/link.ts";
import { newPhases } from "../cli/lib/phase.ts";
import { addMarks, claimOwner, feedbackItems, readMarks, recordCheck } from "../cli/lib/pr-items.ts";
import { startSession } from "../cli/lib/session.ts";
import { git, paths } from "../cli/lib/store.ts";
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function setup(feedback: PrFeedback = BASE): { home: string; gh: ReturnType<typeof fakeGh> } {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repos: ["o/r"] }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  linkPrs(home, "e", 1, [PR], NOW);
  return { home, gh: fakeGh({}, {}, false, undefined, { [PR]: feedback }) };
}

test("feedbackItems drops the pr author, blank reviews, and resolved threads", () => {
  const items = feedbackItems({ ...BASE, author: "me",
    reviews: [review("R1", "ana", "please rename"), review("R2", "bob", "  "), review("R3", "me", "done")],
    comments: [comment("C1", "ana", false), comment("C2", "ana", true), comment("C3", "me", false)],
    conversation: [convo("I1", "me"), convo("I2", "bob")],
    failed_checks: [LINT] });
  assert.deepEqual(items.map((i) => i.id), ["R1", "C1", "I2", "check:lint@sha1"]);
});

test("a check keeps its id on the same head sha and gets a new one on a new sha", () => {
  const a = feedbackItems({ ...BASE, failed_checks: [LINT] }).map((i) => i.id);
  const b = feedbackItems({ ...BASE, head_sha: "sha2", failed_checks: [LINT] }).map((i) => i.id);
  assert.deepEqual(a, ["check:lint@sha1"]);
  assert.deepEqual(b, ["check:lint@sha2"]);
});

test("a check id has no spaces, so it survives shell words and space-split event text", () => {
  const [item] = feedbackItems({ ...BASE, failed_checks: [{ ...LINT, name: "CI / lint" }] });
  assert.equal(item.id, "check:CI%20%2F%20lint@sha1");
});

test("handled implies notified and clears the hook cache", () => {
  const home = tmpHome();
  recordCheck(home, "e", 1, 3, NOW);
  const m = addMarks(home, "e", 1, "handled", ["C1", "C1"]);
  assert.deepEqual(m, { notified: ["C1"], handled: ["C1"], checked_at: null, pending: 3, awaiting_reply: null, owner: null });
});

test("pr feedback --new hides handled items and flags notified ones", async () => {
  const { home, gh } = setup({ ...BASE, reviews: [review("R1", "ana", "x")], comments: [comment("C1", "ana", false)], conversation: [convo("I2", "bob")] });
  addMarks(home, "e", 1, "handled", ["R1"]);
  addMarks(home, "e", 1, "notified", ["C1"]);
  const r = await run(["pr", "feedback", "e", "1", "--new", "--json"], ctx(home, { gh }));
  const json = r.json as { prs: unknown[]; items: { id: string; notified: boolean }[] };
  assert.deepEqual(json.items.map((i) => [i.id, i.notified]), [["C1", true], ["I2", false]]);
  assert.deepEqual(json.prs, [{ url: PR, state: "open", head_ref: "me/x", head_sha: "sha1" }]);
  const text = await run(["pr", "feedback", "e", "1", "--new"], ctx(home, { gh }));
  assert.match(text.stdout, /^C1 shown ana a\.ts:3 nit$/m);
  assert.match(text.stdout, /^I2 new bob conversation hello$/m);
});

test("pr feedback mark commits the store", async () => {
  const { home } = setup();
  const r = await run(["pr", "feedback", "mark", "e", "1", "notified", "I2"], ctx(home));
  assert.equal(r.code, 0);
  assert.match(git(home, ["log", "-1", "--format=%s"]), /e: mark 1 feedback items notified/);
  assert.deepEqual(readMarks(home, "e", 1).notified, ["I2"]);
  assert.equal(git(home, ["status", "--porcelain"]).trim(), "");
});

test("pr feedback mark rejects an unknown kind", async () => {
  const { home } = setup();
  const r = await run(["pr", "feedback", "mark", "e", "1", "seen", "I2"], ctx(home));
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /notified or handled/);
});

const OTHER = "sess-2";

test("an awaiting_reply of true from before sessions reads as none", () => {
  const home = tmpHome();
  mkdirSync(dirname(paths.marks(home, "e", 1)), { recursive: true });
  writeFileSync(paths.marks(home, "e", 1), JSON.stringify({ notified: [], handled: [], awaiting_reply: true }));
  assert.equal(readMarks(home, "e", 1).awaiting_reply, null);
});

test("a stale lock file is broken; a fresh one blocks", () => {
  const home = tmpHome();
  const lock = paths.marksLock(home, "e", 1);
  mkdirSync(dirname(lock), { recursive: true });
  writeFileSync(lock, "");
  assert.throws(() => addMarks(home, "e", 1, "notified", ["C1"]), /marks file locked/);
  const old = new Date(Date.now() - 60_000);
  utimesSync(lock, old, old);
  assert.deepEqual(addMarks(home, "e", 1, "notified", ["C1"]).notified, ["C1"]);
});

test("--claim makes this session the owner and returns the items", async () => {
  const { home, gh } = setup({ ...BASE, conversation: [convo("I2", "bob")] });
  const r = await run(["pr", "feedback", "e", "1", "--new", "--claim", "--json"], ctx(home, { gh }));
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual((r.json as { items: { id: string }[] }).items.map((i) => i.id), ["I2"]);
  assert.deepEqual(readMarks(home, "e", 1).owner, { session: "sess-1", since: NOW });
  assert.equal(git(home, ["status", "--porcelain"]).trim(), "");
});

test("--claim refuses a phase another live session owns, with exit 3 and no gh call", async () => {
  const { home, gh } = setup();
  startSession(home, OTHER, "e", { phase: 1 }, NOW);
  claimOwner(home, "e", 1, OTHER, NOW);
  const r = await run(["pr", "feedback", "e", "1", "--new", "--claim"], ctx(home, { gh }));
  assert.equal(r.code, 3);
  assert.equal(r.stdout.trim(), "phase 1 feedback is owned by session sess-2");
  assert.deepEqual(gh.calls, []);
});

test("--claim takes a phase whose owner's session is gone", async () => {
  const { home, gh } = setup();
  claimOwner(home, "e", 1, OTHER, NOW);
  const r = await run(["pr", "feedback", "e", "1", "--new", "--claim"], ctx(home, { gh }));
  assert.equal(r.code, 0, r.stderr);
  assert.equal(readMarks(home, "e", 1).owner?.session, "sess-1");
});

test("take moves ownership and names the previous owner", async () => {
  const { home } = setup();
  startSession(home, OTHER, "e", { phase: 1 }, NOW);
  claimOwner(home, "e", 1, OTHER, NOW);
  const r = await run(["pr", "feedback", "take", "e", "1"], ctx(home));
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout.trim(), "phase 1: feedback owned by this session (was session sess-2)");
  assert.equal(readMarks(home, "e", 1).owner?.session, "sess-1");
  assert.match(git(home, ["log", "-1", "--format=%s"]), /e: phase 1 feedback owned by session sess-1/);
});

test("--claim without --new is refused", async () => {
  const { home } = setup();
  const r = await run(["pr", "feedback", "e", "1", "--claim"], ctx(home));
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /--claim needs --new/);
});
