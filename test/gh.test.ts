import { test } from "node:test";
import assert from "node:assert/strict";
import { GhUnavailable, classifyGhError, failedChecks, reviewAuthor } from "../cli/lib/gh.ts";
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
