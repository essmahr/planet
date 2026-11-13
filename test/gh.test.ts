import { test } from "node:test";
import assert from "node:assert/strict";
import { GhUnavailable, classifyGhError, failedChecks, parseFeedback, reviewAuthor } from "../cli/lib/gh.ts";
import type { GraphqlContext } from "../cli/lib/gh.ts";

function fail(props: Record<string, unknown>): Error {
  return Object.assign(new Error("command failed"), props);
}

test("classifyGhError: missing binary is GhUnavailable", () => {
  const result = classifyGhError(fail({ code: "ENOENT" }));
  assert.ok(result instanceof GhUnavailable);
});

test("classifyGhError: a killed process is GhUnavailable naming a timeout", () => {
  const result = classifyGhError(fail({ killed: true, signal: "SIGTERM" }));
  assert.ok(result instanceof GhUnavailable);
  assert.match(result.message, /timed out/);
});

test("classifyGhError: auth stderr is GhUnavailable", () => {
  const result = classifyGhError(fail({ stderr: "gh: not logged in to github.com\n" }));
  assert.ok(result instanceof GhUnavailable);
});

test("classifyGhError: unrelated stderr is a plain Error with that text", () => {
  const result = classifyGhError(fail({ stderr: "gh: something else went wrong\n" }));
  assert.ok(!(result instanceof GhUnavailable));
  assert.equal(result.message, "gh: something else went wrong");
});

test("failedChecks keeps failed and errored contexts, drops passing and pending ones", () => {
  const contexts: GraphqlContext[] = [
    { name: "build", conclusion: "FAILURE", detailsUrl: "https://ci/1" },
    { name: "lint", conclusion: null, detailsUrl: "https://ci/2" },
    { context: "deploy", state: "PENDING", targetUrl: "https://ci/3" },
    { context: "tests", state: "ERROR", targetUrl: "https://ci/4" },
  ];
  assert.deepEqual(failedChecks(contexts), [
    { name: "build", state: "FAILURE", url: "https://ci/1" },
    { name: "tests", state: "ERROR", url: "https://ci/4" },
  ]);
});

test("reviewAuthor falls back to unknown for a null author", () => {
  assert.equal(reviewAuthor({ login: "ana" }), "ana");
  assert.equal(reviewAuthor(null), "unknown");
});

test("parseFeedback maps ids, timestamps, conversation comments, state, and the pr author", () => {
  const f = parseFeedback("https://github.com/o/r/pull/7", {
    state: "OPEN", author: { login: "me" }, headRefName: "me/x", headRefOid: "sha1",
    reviews: { nodes: [{ id: "R1", url: "u/r1", createdAt: "2026-11-01T00:00:00Z", author: { login: "ana" }, state: "COMMENTED", body: "hm", reactionGroups: [] }] },
    reviewThreads: { nodes: [{ isResolved: false, comments: { nodes: [{ id: "C1", url: "u/c1", createdAt: "2026-11-01T00:01:00Z", author: null, path: "a.ts", line: 3, body: "x", reactionGroups: [] }] } }] },
    comments: { nodes: [{ id: "I1", url: "u/i1", createdAt: "2026-11-01T00:02:00Z", author: { login: "bob" }, body: "top", reactionGroups: [] }] },
    commits: { nodes: [] },
  }, "me");
  assert.equal(f.state, "open");
  assert.equal(f.author, "me");
  assert.equal(f.head_ref, "me/x");
  assert.deepEqual(f.reviews[0], { id: "R1", author: "ana", state: "COMMENTED", body: "hm", created_at: "2026-11-01T00:00:00Z", url: "u/r1", viewer_reactions: [] });
  assert.equal(f.comments[0].id, "C1");
  assert.equal(f.comments[0].author, "unknown");
  assert.deepEqual(f.conversation, [{ id: "I1", author: "bob", body: "top", created_at: "2026-11-01T00:02:00Z", url: "u/i1", viewer_reactions: [] }]);
  assert.deepEqual(f.failed_checks, []);
});

function threadFeedback(reactionGroups: { content: string; viewerHasReacted: boolean }[]) {
  const node = (id: string, login: string, body: string, groups: typeof reactionGroups = []) =>
    ({ id, url: `u/${id}`, createdAt: "2026-11-01T00:00:00Z", author: { login }, path: "a.ts", line: 3, body, reactionGroups: groups });
  return parseFeedback("https://github.com/o/r/pull/7", {
    state: "OPEN", author: { login: "me" }, headRefName: "me/x", headRefOid: "sha1",
    reviews: { nodes: [] },
    reviewThreads: { nodes: [{ isResolved: false, comments: { nodes: [
      node("C1", "ana", "rename", reactionGroups),
      node("C2", "me", "call it fooValue"),
      node("C3", "bob", "ok"),
      node("C4", "me", "and export it"),
    ] } }] },
    comments: { nodes: [] },
    commits: { nodes: [] },
  }, "me");
}

test("parseFeedback keeps only the viewer's thumbs up, eyes, and rocket", () => {
  const f = threadFeedback([
    { content: "THUMBS_UP", viewerHasReacted: true },
    { content: "HEART", viewerHasReacted: true },
    { content: "EYES", viewerHasReacted: false },
    { content: "ROCKET", viewerHasReacted: true },
  ]);
  assert.deepEqual(f.comments[0].viewer_reactions, ["THUMBS_UP", "ROCKET"]);
});

test("viewer_reply is the viewer's last later comment in the thread", () => {
  const f = threadFeedback([]);
  assert.equal(f.comments[0].viewer_reply, "and export it");
  assert.equal(f.comments[2].viewer_reply, "and export it");
  assert.equal(f.comments[3].viewer_reply, null);
});

test("parseFeedback reports the viewer login", () => assert.equal(threadFeedback([]).viewer, "me"));
