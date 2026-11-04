import { test } from "node:test";
import assert from "node:assert/strict";
import { NOW, ctx, fakeGh, run, tmpHome } from "./helpers.ts";
import type { PrFeedback } from "../cli/lib/gh.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { linkPrs } from "../cli/lib/link.ts";
import { newPhases } from "../cli/lib/phase.ts";

const PR = "https://github.com/o/r/pull/7";
const FEEDBACK: PrFeedback = {
  url: PR,
  state: "open",
  author: "me",
  head_ref: "me/x",
  head_sha: "head777",
  reviews: [{ id: "R1", author: "ana", state: "CHANGES_REQUESTED", body: "rename the hook", created_at: "2026-11-01T00:00:00Z", url: "https://github.com/o/r/pull/7#r1" }],
  comments: [{ id: "C1", author: "ana", path: "src/a.ts", line: 12, body: "useThing reads better", resolved: true, created_at: "2026-11-01T00:01:00Z", url: "https://github.com/o/r/pull/7#c1" }],
  conversation: [],
  failed_checks: [{ name: "typecheck", state: "FAILURE", url: "https://ci/1" }],
};

test("planet pr feedback aggregates reviews, comments, and failed checks per linked pr", async () => {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  linkPrs(home, "e", 1, [PR], NOW);
  const gh = fakeGh({}, {}, false, undefined, { [PR]: FEEDBACK });
  const r = await run(["pr", "feedback", "e", "1", "--json"], ctx(home, { gh }));
  assert.equal(r.code, 0);
  assert.deepEqual(r.json, { phase: 1, prs: [FEEDBACK] });
  assert.deepEqual(gh.calls.filter((c) => c.startsWith("prFeedback")), [`prFeedback:${PR}`]);
  const text = await run(["pr", "feedback", "e", "1"], ctx(home, { gh }));
  assert.match(text.stdout, /CHANGES_REQUESTED/);
  assert.match(text.stdout, /src\/a\.ts:12/);
  assert.match(text.stdout, /typecheck/);
});

test("planet pr feedback with no linked prs says so", async () => {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  const r = await run(["pr", "feedback", "e", "1"], ctx(home));
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), "no linked prs");
});
