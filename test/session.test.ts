import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NOW, SESSION, tmpHome } from "./helpers.ts";
import { createEpic, readEpic } from "../cli/lib/epic.ts";
import { newPhases } from "../cli/lib/phase.ts";
import { endSession, readMarker, sessionIdFrom, setSessionStep, startSession } from "../cli/lib/session.ts";
import { paths } from "../cli/lib/store.ts";

function setup(): string {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  return home;
}

test("sessionIdFrom prefers the override, then the env var", () => {
  assert.equal(sessionIdFrom({ CLAUDE_CODE_SESSION_ID: "env" }, "flag"), "flag");
  assert.equal(sessionIdFrom({ CLAUDE_CODE_SESSION_ID: "env" }), "env");
  assert.throws(() => sessionIdFrom({}), /no session id/);
});

test("startSession writes a one-line marker and records the session on the epic", () => {
  const home = setup();
  const marker = startSession(home, SESSION, "e", { phase: 1, step: "phase-plan" }, NOW);
  assert.deepEqual(marker, { epic: "e", phase: 1, step: "phase-plan", started: NOW });
  assert.equal(readFileSync(paths.session(home, SESSION), "utf8").trim().split("\n").length, 1);
  assert.deepEqual(readMarker(home, SESSION), marker);
  assert.deepEqual(readEpic(home, "e").sessions, [SESSION]);
  startSession(home, SESSION, "e", {}, NOW);
  assert.deepEqual(readEpic(home, "e").sessions, [SESSION], "no duplicate session ids");
});

test("startSession validates the epic and phase", () => {
  const home = setup();
  assert.throws(() => startSession(home, SESSION, "nope", {}, NOW), /no epic/);
  assert.throws(() => startSession(home, SESSION, "e", { phase: 4 }, NOW), /no phase 4/);
});

test("setSessionStep and endSession", () => {
  const home = setup();
  assert.throws(() => setSessionStep(home, SESSION, "scoping"), /no active planet session/);
  startSession(home, SESSION, "e", {}, NOW);
  assert.equal(setSessionStep(home, SESSION, "scoping").step, "scoping");
  assert.equal(endSession(home, SESSION), true);
  assert.equal(readMarker(home, SESSION), null);
  assert.equal(endSession(home, SESSION), false);
});
