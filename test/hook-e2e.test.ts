import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

const NO_NODE_PATH = "/usr/bin:/bin";

/** An nvm-shaped directory whose only node is a symlink to the node running these tests. */
function fakeNvm(): string {
  const dir = mkdtempSync(join(tmpdir(), "planet-nvm-"));
  const bin = join(dir, "versions", "node", "v24.0.0", "bin");
  mkdirSync(bin, { recursive: true });
  symlinkSync(process.execPath, join(bin, "node"));
  return dir;
}

test("bin/planet finds node through nvm when node is not on PATH", () => {
  const r = spawnSync("bin/planet", ["--help"], { encoding: "utf8", env: { ...process.env, PATH: NO_NODE_PATH, PLANET_NODE: "", NVM_DIR: fakeNvm() } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /usage: planet/);
});

test("bin/planet fails clearly when no node exists", () => {
  const r = spawnSync("bin/planet", ["--help"], { encoding: "utf8", env: { ...process.env, PATH: NO_NODE_PATH, PLANET_NODE: "", NVM_DIR: "/nonexistent" } });
  assert.equal(r.status, 127);
  assert.match(r.stderr, /node 24 not found/);
});

test("planet-hook captures through nvm node when node is not on PATH", () => {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  startSession(home, "sess-nvm", "e", {}, NOW);
  const payload = JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: "sess-nvm", user_input: "via nvm" });
  const r = spawnSync("bin/planet-hook", { input: payload, encoding: "utf8", env: { ...process.env, PLANET_HOME: home, PATH: NO_NODE_PATH, PLANET_NODE: "", NVM_DIR: fakeNvm() } });
  assert.equal(r.status, 0);
  assert.match(readFileSync(paths.prompts(home, "e"), "utf8"), /via nvm/);
});

test("planet-hook exits 0 and logs when no node exists", () => {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  startSession(home, "sess-nonode", "e", {}, NOW);
  const payload = JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: "sess-nonode", user_input: "lost" });
  const r = spawnSync("bin/planet-hook", { input: payload, encoding: "utf8", env: { ...process.env, PLANET_HOME: home, PATH: NO_NODE_PATH, PLANET_NODE: "", NVM_DIR: "/nonexistent" } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
  assert.match(readFileSync(paths.hookLog(home), "utf8"), /node not found/);
});

test("bin/planet picks the numerically newest nvm node, not the lexically last", () => {
  const dir = mkdtempSync(join(tmpdir(), "planet-nvm-"));
  const older = join(dir, "versions", "node", "v24.9.0", "bin");
  const newer = join(dir, "versions", "node", "v24.10.0", "bin");
  mkdirSync(older, { recursive: true });
  mkdirSync(newer, { recursive: true });
  writeFileSync(join(older, "node"), "#!/bin/sh\necho wrong node >&2\nexit 3\n", { mode: 0o755 });
  symlinkSync(process.execPath, join(newer, "node"));
  const r = spawnSync("bin/planet", ["--help"], { encoding: "utf8", env: { ...process.env, PATH: NO_NODE_PATH, PLANET_NODE: "", NVM_DIR: dir } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /usage: planet/);
});
