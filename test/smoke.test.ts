import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("bin/planet runs under node 24", () => {
  const out = execFileSync("bin/planet", ["--help"], { encoding: "utf8" });
  assert.match(out, /usage: planet/);
});
