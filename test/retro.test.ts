import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NOW, SESSION, ctx, fakeGh, run, tmpHome } from "./helpers.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { appendEvent, listEvents } from "../cli/lib/events.ts";
import { linkPrs } from "../cli/lib/link.ts";
import { newPhases, readPhase } from "../cli/lib/phase.ts";
import { listRetros, retroFileName } from "../cli/lib/retro.ts";
import { paths } from "../cli/lib/store.ts";
import type { PrFeedback } from "../cli/lib/gh.ts";

const PR = "https://github.com/o/r/pull/7";
const FEEDBACK: PrFeedback = { url: PR, head_sha: "head777", reviews: [], comments: [], failed_checks: [] };
const LATER = "2026-09-03T16:00:00.000Z";

function setup(): string {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  linkPrs(home, "e", 1, [PR], NOW);
  return home;
}

test("retro inputs bundles events, prs, files, and prompts after the implemented event", async () => {
  const home = setup();
  appendEvent(home, "e", { phase: 1, kind: "blocked", text: "commit 2", session: SESSION }, NOW);
  appendEvent(home, "e", { phase: 1, kind: "implemented", sha: "impl123", session: SESSION }, LATER);
  mkdirSync(paths.feedback(home, "e"), { recursive: true });
  appendFileSync(paths.prompts(home, "e"), `${JSON.stringify({ ts: NOW, session: SESSION, kind: "implementation", phase: 1, proposal: null, text: "before" })}\n`);
  appendFileSync(paths.prompts(home, "e"), `${JSON.stringify({ ts: "2026-09-03T17:00:00.000Z", session: SESSION, kind: "implementation", phase: 1, proposal: null, text: "rename useFoo to useBar" })}\n`);
  appendFileSync(paths.prompts(home, "e"), `${JSON.stringify({ ts: "2026-09-03T17:00:00.000Z", session: SESSION, kind: "planning", phase: null, proposal: null, text: "other" })}\n`);
  const gh = fakeGh({}, { [PR]: [{ path: "src/a.ts", additions: 3, deletions: 1 }] }, false, undefined, { [PR]: FEEDBACK });
  const r = await run(["retro", "inputs", "e", "1", "--json"], ctx(home, { gh }));
  assert.equal(r.code, 0);
  const j = r.json as Record<string, unknown>;
  assert.equal((j.phase as { id: number }).id, 1);
  assert.equal(j.implemented_sha, "impl123");
  assert.equal(j.implemented_at, LATER);
  assert.equal((j.events as unknown[]).length, 2);
  assert.deepEqual(j.prompts, [{ ts: "2026-09-03T17:00:00.000Z", text: "rename useFoo to useBar" }]);
  assert.deepEqual((j.prs as PrFeedback[])[0].head_sha, "head777");
  assert.equal(((j.files as { files: unknown[] }).files).length, 1);
});

test("retro write validates frontmatter, writes the file, appends the reviewed event", async () => {
  const home = setup();
  const draft = join(tmpdir(), `retro-${Date.now()}.md`);
  writeFileSync(draft, ["---", "phase: 1", "lessons:", "  - text: name the test file in the plan", "    skill: planet-phase-plan", "    steer: true", "  - text: one-off rename", "    skill: not-planet", "    steer: false", "---", "# Retro: phase 1", "", "## Blocks", "none", ""].join("\n"));
  const bad = join(tmpdir(), `retro-bad-${Date.now()}.md`);
  writeFileSync(bad, "---\nphase: 1\nlessons:\n  - text: x\n    skill: planet-nope\n    steer: true\n---\nbody\n");
  const rb = await run(["retro", "write", "e", "1", "--file", bad], ctx(home));
  assert.equal(rb.code, 1);
  assert.match(rb.stderr, /skill must be one of/);
  const statusBefore = readPhase(home, "e", 1).meta.status;
  const r = await run(["retro", "write", "e", "1", "--file", draft, "--json"], ctx(home));
  assert.equal(r.code, 0);
  const file = join(paths.retros(home, "e"), retroFileName(1, "a"));
  assert.ok(existsSync(file));
  const text = readFileSync(file, "utf8");
  assert.match(text, /^---\n/);
  assert.match(text, /written: "?2026-09-03T15:00:00.000Z"?/);
  assert.match(text, /prs:\n  - https:\/\/github.com\/o\/r\/pull\/7/);
  const retros = listRetros(home, "e");
  assert.equal(retros.length, 1);
  assert.equal(retros[0].meta.lessons.length, 2);
  assert.equal(retros[0].meta.lessons[0].steer, true);
  assert.deepEqual(listEvents(home, "e", 1).map((e) => e.kind), ["reviewed"]);
  assert.equal(readPhase(home, "e", 1).meta.status, statusBefore);
});

test("retro write falls back to the draft's frontmatter head_sha when --head is omitted", async () => {
  const home = setup();
  const draft = join(tmpdir(), `retro-headsha-${Date.now()}.md`);
  writeFileSync(draft, "---\nphase: 1\nhead_sha: fromdraft\nlessons: []\n---\nbody\n");

  const r1 = await run(["retro", "write", "e", "1", "--file", draft, "--json"], ctx(home));
  assert.equal(r1.code, 0);
  assert.equal((r1.json as { meta: { head_sha: string } }).meta.head_sha, "fromdraft");

  const r2 = await run(["retro", "write", "e", "1", "--file", draft, "--head", "cli1", "--json"], ctx(home));
  assert.equal(r2.code, 0);
  assert.equal((r2.json as { meta: { head_sha: string } }).meta.head_sha, "cli1");
});
