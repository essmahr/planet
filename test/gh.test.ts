import { test } from "node:test";
import assert from "node:assert/strict";
import { GhUnavailable, classifyGhError } from "../cli/lib/gh.ts";

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
