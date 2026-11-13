import { test } from "node:test";
import assert from "node:assert/strict";
import type { Reaction } from "../cli/lib/gh.ts";
import { openKeys, prSignals } from "../cli/lib/signals.ts";
import { BASE, comment, convo, review } from "./helpers.ts";

const NONE = { drafted: [], pushed: [] };
const up = { ...comment("C1", "ana", false), viewer_reactions: ["THUMBS_UP"] as Reaction[] };

test("a thumbs up is an open do signal", () =>
  assert.deepEqual(openKeys(prSignals({ ...BASE, comments: [up] }, NONE)), ["C1:do"]));

test("thumbs up and eyes on one comment make two signals", () => {
  const both = { ...up, viewer_reactions: ["THUMBS_UP", "EYES"] as Reaction[] };
  assert.deepEqual(openKeys(prSignals({ ...BASE, comments: [both] }, NONE)), ["C1:do", "C1:weigh"]);
});

test("a drafted thumbs up is not open", () =>
  assert.deepEqual(openKeys(prSignals({ ...BASE, comments: [up] }, { drafted: [up.url], pushed: [] })), []));

test("a pushed thumbs up stays open until it is swapped", () =>
  assert.deepEqual(openKeys(prSignals({ ...BASE, comments: [up] }, { drafted: [], pushed: [up.url] })), ["C1:do"]));

test("a draft whose thumbs up is gone is an orphan", () => {
  const s = prSignals({ ...BASE, comments: [comment("C1", "ana", false)] }, { drafted: ["u/C1"], pushed: [] });
  assert.deepEqual(s.orphans, ["u/C1"]);
  assert.deepEqual(openKeys(s), ["orphan:u/C1"]);
});

test("a reaction on a resolved thread counts", () =>
  assert.equal(prSignals({ ...BASE, comments: [{ ...up, resolved: true }] }, NONE).signals.length, 1));

test("the viewer's own comments are skipped", () =>
  assert.equal(prSignals({ ...BASE, comments: [{ ...up, author: "me" }] }, NONE).signals.length, 0));

test("the viewer's reply is the instruction", () =>
  assert.equal(prSignals({ ...BASE, comments: [{ ...up, viewer_reply: "call it fooValue" }] }, NONE).signals[0].instruction, "call it fooValue"));

test("rocket alone is no signal", () => {
  const rocket = { ...up, viewer_reactions: ["ROCKET"] as Reaction[] };
  const s = prSignals({ ...BASE, comments: [rocket] }, NONE);
  assert.deepEqual(s.signals, []);
  assert.deepEqual(openKeys(s), []);
});

test("a thumbs up on a review body is a do signal", () => {
  const r = { ...review("R1", "ana", "please split this"), viewer_reactions: ["THUMBS_UP"] as Reaction[] };
  const [sig] = prSignals({ ...BASE, reviews: [r] }, NONE).signals;
  assert.equal(sig.kind, "review");
  assert.equal(sig.signal, "do");
  assert.equal(sig.path, null);
  assert.equal(sig.instruction, null);
});

test("a thumbs up on a conversation comment is a do signal", () => {
  const c = { ...convo("V1", "ana"), viewer_reactions: ["THUMBS_UP"] as Reaction[] };
  const [sig] = prSignals({ ...BASE, conversation: [c] }, NONE).signals;
  assert.equal(sig.kind, "conversation");
  assert.equal(sig.signal, "do");
  assert.equal(sig.url, "u/V1");
});

test("an empty review body still counts", () => {
  const r = { ...review("R1", "ana", ""), viewer_reactions: ["EYES"] as Reaction[] };
  assert.deepEqual(openKeys(prSignals({ ...BASE, reviews: [r] }, NONE)), ["R1:weigh"]);
});

test("an eyes signal stays open even when its url is drafted", () => {
  const eyes = { ...up, viewer_reactions: ["EYES"] as Reaction[] };
  const s = prSignals({ ...BASE, comments: [eyes] }, { drafted: [eyes.url], pushed: [eyes.url] });
  assert.equal(s.signals[0].state, "open");
});
