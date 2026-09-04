import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { NOW, tmpHome } from "./helpers.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { startSession } from "../cli/lib/session.ts";
import { paths } from "../cli/lib/store.ts";

function fire(home: string, payload: Record<string, unknown>) {
  return spawnSync("bin/planet-hook", { input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, PLANET_HOME: home } });
}

test("planet-hook exits 0 and writes nothing without a marker", () => {
  const home = tmpHome();
  const r = fire(home, { hook_event_name: "UserPromptSubmit", session_id: "nobody", user_input: "hi" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
  assert.ok(!existsSync(paths.hookLog(home)));
});

test("planet-hook captures a prompt when the session has a marker", () => {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  startSession(home, "sess-e2e", "e", {}, NOW);
  const r = fire(home, { hook_event_name: "UserPromptSubmit", session_id: "sess-e2e", user_input: "hello from the hook" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "", "stdout would be injected into Claude's context");
  assert.match(readFileSync(paths.prompts(home, "e"), "utf8"), /hello from the hook/);
});

test("planet-hook exits 0 on garbage input", () => {
  const home = tmpHome();
  const r = spawnSync("bin/planet-hook", { input: "{{{", encoding: "utf8", env: { ...process.env, PLANET_HOME: home } });
  assert.equal(r.status, 0);
});
