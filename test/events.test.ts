import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { NOW, SESSION, ctx, run, tmpHome } from "./helpers.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { appendEvent, listEvents } from "../cli/lib/events.ts";
import { newPhases } from "../cli/lib/phase.ts";
import { paths } from "../cli/lib/store.ts";

function setup(): string {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }, { slug: "b", title: "B" }]);
  return home;
}

test("appendEvent writes one json line and listEvents filters by phase", () => {
  const home = setup();
  appendEvent(home, "e", { phase: 1, kind: "blocked", text: "commit 2: file gone", session: SESSION }, NOW);
  appendEvent(home, "e", { phase: 1, kind: "implemented", sha: "abc1234", session: SESSION }, NOW);
  appendEvent(home, "e", { phase: 2, kind: "implemented", sha: "def5678", session: SESSION }, NOW);
  const lines = readFileSync(paths.events(home, "e"), "utf8").trim().split("\n");
  assert.equal(lines.length, 3);
  assert.deepEqual(JSON.parse(lines[0]), { ts: NOW, phase: 1, kind: "blocked", text: "commit 2: file gone", sha: null, session: SESSION });
  assert.equal(listEvents(home, "e").length, 3);
  assert.deepEqual(listEvents(home, "e", 1).map((e) => e.kind), ["blocked", "implemented"]);
  assert.deepEqual(listEvents(home, "e", 3), []);
});

test("listEvents on an epic without events returns empty", () => {
  const home = setup();
  assert.deepEqual(listEvents(home, "e"), []);
  assert.equal(existsSync(paths.events(home, "e")), false);
});

test("planet phase event validates kind and phase, records sha, commits", async () => {
  const home = setup();
  const bad = await run(["phase", "event", "e", "1", "napping"], ctx(home));
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /kind must be one of blocked, implemented, reviewed/);
  const missing = await run(["phase", "event", "e", "9", "blocked", "why"], ctx(home));
  assert.equal(missing.code, 1);
  const ok = await run(["phase", "event", "e", "1", "implemented", "--sha", "abc1234", "--json"], ctx(home));
  assert.equal(ok.code, 0);
  assert.deepEqual(ok.json, { ts: NOW, phase: 1, kind: "implemented", text: null, sha: "abc1234", session: SESSION });
  const text = await run(["phase", "event", "e", "1", "blocked", "commit 2: file gone"], ctx(home));
  assert.equal(text.stdout.trim(), "phase 1 blocked");
  assert.equal(listEvents(home, "e", 1).length, 2);
});
