import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE, LINT, NOW, PR, comment, convo, ctx, fakeGh, review, run, tmpHome } from "./helpers.ts";
import type { PrFeedback } from "../cli/lib/gh.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { linkPrs } from "../cli/lib/link.ts";
import { newPhases } from "../cli/lib/phase.ts";
import { addMarks, feedbackItems, readMarks, recordCheck } from "../cli/lib/pr-items.ts";
import { git } from "../cli/lib/store.ts";

function setup(feedback: PrFeedback = BASE): { home: string; gh: ReturnType<typeof fakeGh> } {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
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

test("handled implies notified and clears the hook cache", () => {
  const home = tmpHome();
  recordCheck(home, "e", 1, 3, NOW);
  const m = addMarks(home, "e", 1, "handled", ["C1", "C1"]);
  assert.deepEqual(m, { notified: ["C1"], handled: ["C1"], checked_at: null, pending: 3, awaiting_reply: false });
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
