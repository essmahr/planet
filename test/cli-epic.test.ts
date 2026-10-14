import { test } from "node:test";
import assert from "node:assert/strict";
import { ctx, run, tmpHome, SESSION, NOW } from "./helpers.ts";
import { readEpic } from "../cli/lib/epic.ts";
import { createProposal, markApproved, markRejected } from "../cli/lib/proposal.ts";
import { git } from "../cli/lib/store.ts";
import type { EpicBrief, EpicView } from "../cli/lib/view.ts";
import { linkPrs } from "../cli/lib/link.ts";
import { newPhases } from "../cli/lib/phase.ts";
import { writeRetro } from "../cli/lib/retro.ts";

test("planet with no command prints usage; unknown command exits 2", async () => {
  const home = tmpHome();
  const usage = await run([], ctx(home));
  assert.equal(usage.code, 0);
  assert.match(usage.stdout, /usage: planet/);
  const bad = await run(["frobnicate"], ctx(home));
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /unknown command 'frobnicate'/);
});

test("epic new creates and commits; errors are one line or json", async () => {
  const home = tmpHome();
  const r = await run(["epic", "new", "gql", "--title", "GQL migration", "--repo", "closeio/close-ui", "--linear", "CRM-1", "--linear", "CRM-2"], ctx(home));
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "created epic gql\n");
  assert.deepEqual(readEpic(home, "gql").linear, ["CRM-1", "CRM-2"]);
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "gql: create epic");

  const dup = await run(["epic", "new", "gql", "--title", "x", "--repo", "o/r"], ctx(home));
  assert.equal(dup.code, 1);
  assert.equal(dup.stderr, "planet: epic 'gql' already exists\n");

  const dupJson = await run(["epic", "new", "gql", "--title", "x", "--repo", "o/r", "--json"], ctx(home));
  assert.equal(dupJson.code, 1);
  assert.deepEqual(dupJson.json, { error: "epic 'gql' already exists" });

  const missing = await run(["epic", "new", "other", "--repo", "o/r"], ctx(home));
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /missing --title/);
});

test("epic set changes status, linear, title with manual transitions only", async () => {
  const home = tmpHome();
  await run(["epic", "new", "gql", "--title", "GQL", "--repo", "o/r"], ctx(home));
  const r = await run(["epic", "set", "gql", "--status", "paused", "--title", "GQL v2", "--json"], ctx(home));
  assert.equal(r.code, 0);
  const epic = readEpic(home, "gql");
  assert.equal(epic.status, "paused");
  assert.equal(epic.title, "GQL v2");
  const bad = await run(["epic", "set", "gql", "--status", "shipped"], ctx(home));
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /--status must be paused, abandoned, or active/);
});

test("epic show returns frontmatter and paths, never bodies", async () => {
  const home = tmpHome();
  await run(["epic", "new", "gql", "--title", "GQL", "--repo", "o/r"], ctx(home));
  const r = await run(["epic", "show", "gql", "--json"], ctx(home));
  const view = r.json as EpicView;
  assert.equal(view.epic.slug, "gql");
  assert.deepEqual(view.phases, []);
  assert.equal(view.paths.plan, null);
  assert.equal(view.paths.latest_proposal, null);
  assert.match(view.paths.dir, /epics\/gql$/);
  assert.equal(JSON.stringify(view).includes('"body"'), false);
});

test("epic show --brief carries statuses and open PR urls only; the full view lists applied lessons", async () => {
  const home = tmpHome();
  await run(["epic", "new", "e", "--title", "E", "--repo", "o/r"], ctx(home));
  newPhases(home, "e", [{ slug: "a", title: "A" }, { slug: "b", title: "B" }]);
  linkPrs(home, "e", 1, ["https://github.com/o/r/pull/7"], NOW);
  writeRetro(home, "e", 1, "---\nphase: 1\nlessons:\n  - text: name the spec file\n    skill: planet-phase-plan\n    apply: true\n  - text: taste\n    skill: not-planet\n    apply: false\n---\nbody\n", NOW, "head1");
  const brief = (await run(["epic", "show", "e", "--brief", "--json"], ctx(home))).json as EpicBrief;
  assert.deepEqual(brief.epic, { slug: "e", title: "E", repo: "o/r", status: "active" });
  assert.deepEqual(brief.phases.map((p) => [p.id, p.slug, p.status, p.open_prs]), [[1, "a", "in-progress", ["https://github.com/o/r/pull/7"]], [2, "b", "draft", []]]);
  assert.equal(brief.last_approved_step, null);
  assert.match(brief.paths.dir, /epics\/e$/);
  const text = JSON.stringify(brief);
  for (const key of ["retros", "latest_proposal", "prompts", "merged_at", "shipped_at", "lessons"]) assert.equal(text.includes(`"${key}"`), false, `brief has no ${key}`);
  const full = (await run(["epic", "show", "e", "--json"], ctx(home))).json as EpicView;
  assert.deepEqual(full.lessons, [{ phase: 1, skill: "planet-phase-plan", text: "name the spec file" }]);
  const t = (await run(["epic", "show", "e", "--brief"], ctx(home))).stdout;
  assert.match(t, /01 a {2}in-progress {2}open_prs=1/);
});

test("epic resolve returns candidates", async () => {
  const home = tmpHome();
  await run(["epic", "new", "gql-migration", "--title", "GQL migration", "--repo", "o/r"], ctx(home));
  await run(["epic", "new", "gql-cleanup", "--title", "Cleanup", "--repo", "o/r"], ctx(home));
  const one = await run(["epic", "resolve", "clean", "--json"], ctx(home));
  assert.deepEqual((one.json as { candidates: string[] }).candidates, ["gql-cleanup"]);
  const many = await run(["epic", "resolve", "gql"], ctx(home));
  assert.equal(many.stdout, "gql-cleanup\ngql-migration\n");
  const none = await run(["epic", "resolve", "zzz"], ctx(home));
  assert.equal(none.stdout, "no epic matches 'zzz'\n");
});

test("epic show reports the last approved step", async () => {
  const home = tmpHome();
  await run(["epic", "new", "e", "--title", "E", "--repo", "o/r"], ctx(home));
  const view = async () => (await run(["epic", "show", "e", "--json"], ctx(home))).json as EpicView;
  assert.equal((await view()).last_approved_step, null);
  const base = { phase: null, session: SESSION, toolUse: null, planFile: null, body: "x" };
  createProposal(home, "e", { ...base, step: "intake" }, NOW);
  assert.equal((await view()).last_approved_step, null, "pending does not count");
  markApproved(home, "e", 1);
  assert.equal((await view()).last_approved_step, "intake");
  createProposal(home, "e", { ...base, step: "scoping" }, NOW);
  markRejected(home, "e", 2, "no");
  assert.equal((await view()).last_approved_step, "intake", "a later rejection does not advance it");
  createProposal(home, "e", { ...base, step: "scoping" }, NOW);
  markApproved(home, "e", 3);
  assert.equal((await view()).last_approved_step, "scoping");
  for (const step of ["implement", "retro", "unknown"] as const) {
    const p = createProposal(home, "e", { ...base, step }, NOW);
    markApproved(home, "e", p.meta.id);
    assert.equal((await view()).last_approved_step, "scoping", `an approved ${step} plan does not move the planning step`);
  }
});
