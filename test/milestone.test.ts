import { test } from "node:test";
import assert from "node:assert/strict";
import { NOW, SESSION, ctx, run, tmpHome } from "./helpers.ts";
import { createEpic, readEpic } from "../cli/lib/epic.ts";
import { dropMilestone, milestoneStatus, newMilestone } from "../cli/lib/milestone.ts";
import { movePhase, newPhases } from "../cli/lib/phase.ts";
import { createProposal, markApproved } from "../cli/lib/proposal.ts";
import { git } from "../cli/lib/store.ts";
import type { PhaseMeta } from "../cli/schema/types.ts";

function epicHome(): string {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repos: ["o/r"] }, NOW);
  return home;
}

function approvedPhasing(home: string): number {
  const p = createProposal(home, "e", { step: "phasing", phase: null, session: SESSION, toolUse: null, planFile: null, body: "# Phases\n" }, NOW);
  markApproved(home, "e", p.meta.id);
  return p.meta.id;
}

const meta = (milestone: number | null, status: PhaseMeta["status"]): PhaseMeta => ({ id: 1, slug: "p", title: "", status, linear: [], prs: [], shipped_at: null, kind: "pr", repo: null, milestone, blocked_by: [] });

test("milestone ids allocate as max + 1 and duplicate slugs throw", () => {
  const home = epicHome();
  assert.equal(newMilestone(home, "e", { slug: "views", title: "Views" }).id, 1);
  assert.equal(newMilestone(home, "e", { slug: "api", title: "API" }).id, 2);
  assert.equal(newMilestone(home, "e", { slug: "ui", title: "UI" }).id, 3);
  dropMilestone(home, "e", 2);
  assert.equal(newMilestone(home, "e", { slug: "docs", title: "Docs" }).id, 4);
  assert.throws(() => newMilestone(home, "e", { slug: "views", title: "Again" }), /milestone 'views' already exists/);
  assert.deepEqual(readEpic(home, "e").milestones.map((m) => m.id), [1, 3, 4]);
});

test("new and drop need an approved phasing proposal once phases exist", () => {
  const home = epicHome();
  newMilestone(home, "e", { slug: "views", title: "Views" });
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  assert.throws(() => newMilestone(home, "e", { slug: "api", title: "API" }), /needs --proposal/);
  assert.throws(() => dropMilestone(home, "e", 1), /needs --proposal/);
  const proposal = approvedPhasing(home);
  assert.equal(newMilestone(home, "e", { slug: "api", title: "API" }, proposal).id, 2);
  assert.equal(dropMilestone(home, "e", 2, proposal).slug, "api");
});

test("drop is refused while phases point at the milestone", () => {
  const home = epicHome();
  newMilestone(home, "e", { slug: "views", title: "Views" });
  newPhases(home, "e", [{ slug: "a", title: "A", milestone: 1 }]);
  const proposal = approvedPhasing(home);
  assert.throws(() => dropMilestone(home, "e", 1, proposal), /milestone 1 still has phases/);
  movePhase(home, "e", 1, null);
  assert.equal(dropMilestone(home, "e", 1, proposal).id, 1);
  assert.throws(() => dropMilestone(home, "e", 1, proposal), /no milestone 1/);
});

test("milestoneStatus is done only when it has phases and all are shipped", () => {
  assert.equal(milestoneStatus(1, []), "open");
  assert.equal(milestoneStatus(1, [meta(2, "shipped")]), "open");
  assert.equal(milestoneStatus(1, [meta(1, "draft")]), "open");
  assert.equal(milestoneStatus(1, [meta(1, "shipped"), meta(1, "in-progress")]), "open");
  assert.equal(milestoneStatus(1, [meta(1, "shipped"), meta(1, "reviewed")]), "done");
});

test("milestone new and drop commit through the CLI", async () => {
  const home = tmpHome();
  await run(["epic", "new", "e", "--title", "E", "--repo", "o/r"], ctx(home));
  const made = await run(["milestone", "new", "e", "views", "--title", "Views"], ctx(home));
  assert.equal(made.code, 0);
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "e: add milestone views");
  assert.deepEqual(readEpic(home, "e").milestones.map((m) => m.slug), ["views"]);
  const dropped = await run(["milestone", "drop", "e", "1"], ctx(home));
  assert.equal(dropped.code, 0);
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "e: drop milestone 1");
  const bad = await run(["milestone", "bogus"], ctx(home));
  assert.equal(bad.code, 1);
});

test("milestone new --proposal latest resolves the approved phasing proposal", async () => {
  const home = tmpHome();
  await run(["epic", "new", "e", "--title", "E", "--repo", "o/r"], ctx(home));
  await run(["phase", "new", "e", "a", "--title", "A"], ctx(home));
  const none = await run(["milestone", "new", "e", "views", "--title", "Views"], ctx(home));
  assert.equal(none.code, 1);
  approvedPhasing(home);
  const ok = await run(["milestone", "new", "e", "views", "--title", "Views", "--proposal", "latest"], ctx(home));
  assert.equal(ok.code, 0);
});
