import { test } from "node:test";
import assert from "node:assert/strict";
import { NOW, SESSION, ctx, fakeGh, run, tmpHome } from "./helpers.ts";
import { createEpic, writeEpic, readEpic } from "../cli/lib/epic.ts";
import { linkPrs } from "../cli/lib/link.ts";
import { newPhases } from "../cli/lib/phase.ts";
import { readMarker } from "../cli/lib/session.ts";
import { renderTable } from "../cli/lib/table.ts";
import type { StatusRow } from "../cli/commands/status.ts";

const PR1 = "https://github.com/o/r/pull/1";

function setup(): string {
  const home = tmpHome();
  createEpic(home, { slug: "gql-migration", title: "GQL migration", repo: "o/r", linear: ["CRM-1"] }, NOW);
  newPhases(home, "gql-migration", [{ slug: "a", title: "A" }, { slug: "b", title: "B" }]);
  linkPrs(home, "gql-migration", 1, [PR1], NOW);
  const done = createEpic(home, { slug: "old", title: "Old", repo: "o/r" }, NOW);
  done.status = "shipped";
  writeEpic(home, done);
  return home;
}

test("renderTable pads columns and trims trailing space", () => {
  assert.equal(renderTable(["A", "BB"], [["x", "y"], ["long", ""]]), "A     BB\nx     y\nlong");
});

test("status syncs, hides terminal epics, and renders rows", async () => {
  const home = setup();
  const gh = fakeGh({ [PR1]: { url: PR1, state: "merged", merged_at: NOW } });
  const r = await run(["status", "--json"], ctx(home, { gh }));
  assert.equal(r.code, 0);
  const rows = r.json as StatusRow[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].slug, "gql-migration");
  assert.equal(rows[0].shipped, 1);
  assert.equal(rows[0].total, 2);
  assert.equal(rows[0].unreviewed, 1);
  assert.equal(rows[0].current, "2 b");
  assert.equal(rows[0].stale, false);
  assert.deepEqual(gh.calls, ["prStates:1"]);

  const all = await run(["status", "--all", "--no-sync"], ctx(home, { gh }));
  assert.match(all.stdout, /^EPIC\s+REPO\s+STATUS\s+PHASES\s+CURRENT\s+OPEN\s+REVIEW\s+SYNCED/);
  assert.match(all.stdout, /\nold\s+o\/r\s+shipped/);
  assert.equal(gh.calls.length, 1, "--no-sync does not call gh");
});

test("status marks stale rows when gh is unavailable", async () => {
  const home = setup();
  const r = await run(["status"], ctx(home, { gh: fakeGh({}, {}, true) }));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /active \(stale\)/);
  assert.match(r.stdout, /never/);
});

test("open with a unique match starts the session and returns the epic view", async () => {
  const home = setup();
  const gh = fakeGh({ [PR1]: { url: PR1, state: "open", merged_at: null } });
  const r = await run(["open", "the GQL thing", "--step", "phase-plan", "--json"], ctx(home, { gh }));
  assert.equal(r.code, 0);
  const json = r.json as { match: string; epic: { epic: { slug: string } }; status: StatusRow[] };
  assert.equal(json.match, "gql-migration");
  assert.equal(json.epic.epic.slug, "gql-migration");
  assert.equal(json.status.length, 1);
  assert.deepEqual(readMarker(home, SESSION), { epic: "gql-migration", phase: null, step: "phase-plan", started: NOW });
  assert.deepEqual(readEpic(home, "gql-migration").sessions, [SESSION]);
});

test("open with zero or many matches sets nothing", async () => {
  const home = setup();
  createEpic(home, { slug: "gql-cleanup", title: "Cleanup", repo: "o/r" }, NOW);
  const gh = fakeGh({ [PR1]: { url: PR1, state: "open", merged_at: null } });
  const many = await run(["open", "gql", "--json"], ctx(home, { gh }));
  assert.deepEqual((many.json as { match: null; candidates: string[] }).candidates, ["gql-cleanup", "gql-migration"]);
  assert.equal(readMarker(home, SESSION), null);
  const none = await run(["open", "zzz"], ctx(home, { gh }));
  assert.equal(none.code, 0);
  assert.equal(none.stdout, "no epic matches 'zzz'\n");
});

test("status marks a manual current phase", async () => {
  const home = tmpHome();
  createEpic(home, { slug: "m", title: "M", repo: "o/r" }, NOW);
  newPhases(home, "m", [{ slug: "review", title: "Design review", kind: "manual" }]);
  const r = await run(["status", "--no-sync", "--json"], ctx(home));
  const rows = r.json as StatusRow[];
  assert.equal(rows.find((x) => x.slug === "m")?.current, "1 review (manual)");
});
