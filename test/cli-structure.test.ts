import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NOW, SESSION, ctx, run, tmpHome } from "./helpers.ts";
import { readEpic } from "../cli/lib/epic.ts";
import { readPhase } from "../cli/lib/phase.ts";
import { createProposal, readProposal } from "../cli/lib/proposal.ts";
import { parseTags } from "../cli/lib/report.ts";
import { readMarker } from "../cli/lib/session.ts";
import { git, paths } from "../cli/lib/store.ts";
import { FEEDBACK_TAGS } from "../cli/schema/types.ts";

const PR = "https://github.com/o/r/pull/5";

async function setup(): Promise<string> {
  const home = tmpHome();
  await run(["epic", "new", "e", "--title", "E", "--repo", "o/r"], ctx(home));
  return home;
}

test("phase new: single and batch forms, one commit for the batch", async () => {
  const home = await setup();
  const one = await run(["phase", "new", "e", "codegen", "--title", "Codegen", "--linear", "CRM-9"], ctx(home));
  assert.equal(one.code, 0);
  assert.deepEqual(readPhase(home, "e", 1).meta.linear, ["CRM-9"]);
  const before = git(home, ["rev-list", "--count", "HEAD"]).trim();
  const batch = await run(["phase", "new", "e", "--phase", "hooks:Write hooks", "--phase", "cleanup:Remove REST: the last bits", "--json"], ctx(home));
  assert.equal(batch.code, 0);
  assert.equal(readPhase(home, "e", 3).meta.title, "Remove REST: the last bits");
  assert.equal(Number(git(home, ["rev-list", "--count", "HEAD"]).trim()), Number(before) + 1);
  const bad = await run(["phase", "new", "e"], ctx(home));
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /pass <slug> --title or --phase slug:title/);
});

test("phase write and set", async () => {
  const home = await setup();
  await run(["phase", "new", "e", "a", "--title", "A"], ctx(home));
  const body = join(home, "body.md");
  writeFileSync(body, "# Detailed plan\n");
  assert.equal((await run(["phase", "write", "e", "1", "--body-file", body], ctx(home))).code, 0);
  assert.equal(readPhase(home, "e", 1).body, "# Detailed plan\n");
  assert.equal((await run(["phase", "set", "e", "1", "--status", "planned"], ctx(home))).code, 0);
  assert.equal(readPhase(home, "e", 1).meta.status, "planned");
  const bad = await run(["phase", "set", "e", "1", "--status", "shipped"], ctx(home));
  assert.match(bad.stderr, /only a manual phase with no linked prs can be shipped by hand/);
});

test("link and unlink", async () => {
  const home = await setup();
  await run(["phase", "new", "e", "a", "--title", "A"], ctx(home));
  const r = await run(["link", "e", "1", PR, "--json"], ctx(home));
  assert.equal(r.code, 0);
  assert.equal(readPhase(home, "e", 1).meta.status, "in-progress");
  assert.equal(readEpic(home, "e").status, "active");
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), `e: link phase 1 to ${PR}`);
  const u = await run(["unlink", "e", "1", PR], ctx(home));
  assert.equal(u.code, 0);
  assert.deepEqual(readPhase(home, "e", 1).meta.prs, []);
});

test("session start, step, end use the env session id or --session", async () => {
  const home = await setup();
  await run(["phase", "new", "e", "a", "--title", "A"], ctx(home));
  const s = await run(["session", "start", "e", "--phase", "1", "--step", "phase-plan", "--json"], ctx(home));
  assert.equal(s.code, 0);
  assert.deepEqual(readMarker(home, SESSION), { epic: "e", phase: 1, step: "phase-plan", started: NOW });
  const badStep = await run(["session", "step", "napping"], ctx(home));
  assert.match(badStep.stderr, /step must be one of/);
  assert.equal((await run(["session", "step", "retro"], ctx(home))).code, 0);
  assert.equal(readMarker(home, SESSION)?.step, "retro");
  assert.equal((await run(["session", "step", "implement"], ctx(home))).code, 0);
  assert.equal(readMarker(home, SESSION)?.step, "implement");
  const withPhase = await run(["session", "step", "phase-plan", "--phase", "1", "--json"], ctx(home));
  assert.equal(withPhase.code, 0);
  assert.deepEqual(readMarker(home, SESSION), { epic: "e", phase: 1, step: "phase-plan", started: NOW });
  const other = await run(["session", "start", "e", "--session", "sess-2"], ctx(home, { env: {} }));
  assert.equal(other.code, 0);
  assert.ok(readMarker(home, "sess-2"));
  const noId = await run(["session", "end"], ctx(home, { env: {} }));
  assert.match(noId.stderr, /no session id/);
  assert.equal((await run(["session", "end"], ctx(home))).code, 0);
  assert.equal(readMarker(home, SESSION), null);
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "e: end session");
});

test("propose and proposal approve --to", async () => {
  const home = await setup();
  await run(["phase", "new", "e", "a", "--title", "A"], ctx(home));
  const file = join(home, "draft.md");
  writeFileSync(file, "# Draft phase plan\n");
  const p = await run(["propose", "e", "phase-plan", "--file", file, "--phase", "1", "--json"], ctx(home));
  assert.equal(p.code, 0);
  assert.equal(readProposal(home, "e", 1).body, "# Draft phase plan\n");
  const a = await run(["proposal", "approve", "e", "1", "--to", "phase:1"], ctx(home));
  assert.equal(a.code, 0);
  assert.equal(readPhase(home, "e", 1).body, "# Draft phase plan\n");
  assert.equal(readProposal(home, "e", 1).meta.outcome, "approved");
  createProposal(home, "e", { step: "scoping", phase: null, session: SESSION, toolUse: null, planFile: null, body: "# Scope\n" }, NOW);
  const plan = await run(["proposal", "approve", "e", "2", "--to", "plan"], ctx(home));
  assert.equal(plan.code, 0);
  assert.match(plan.stdout, /\(2 words\)\n$/);
  assert.equal(readFileSync(paths.plan(home, "e"), "utf8"), "# Scope\n");
  const bad = await run(["proposal", "approve", "e", "2", "--to", "nowhere"], ctx(home));
  assert.match(bad.stderr, /--to must be plan, phase:<n>, or review/);
});

test("check reports every invalid file and exits 1", async () => {
  const home = await setup();
  await run(["phase", "new", "e", "a", "--title", "A"], ctx(home));
  assert.equal((await run(["check"], ctx(home))).code, 0);
  writeFileSync(join(home, "epics", "e", "phases", "01-a.md"), "---\nid: 1\nslug: a\ntitle: A\nstatus: bogus\n---\n");
  writeFileSync(paths.session(home, "s9"), "{\"epic\": 5}\n");
  const r = await run(["check", "--json"], ctx(home));
  assert.equal(r.code, 1);
  const errors = (r.json as { errors: { file: string; message: string }[] }).errors;
  assert.equal(errors.length, 2);
  assert.match(errors[0].message, /status must be one of/);
  assert.match(errors[1].message, /epic must be a non-empty string/);
});

test("check validates prompts.jsonl lines and skips dotfiles in sessions", async () => {
  const home = await setup();
  const valid = { ts: "t", session: "s", kind: "planning", phase: null, proposal: null, text: "hi" };
  writeFileSync(paths.prompts(home, "e"), `${JSON.stringify(valid)}\n${JSON.stringify({ ts: "t", kind: "nap" })}\n`);
  writeFileSync(join(paths.sessions(home), ".DS_Store"), "junk");
  const r = await run(["check", "--json"], ctx(home));
  assert.equal(r.code, 1);
  const errors = (r.json as { errors: { file: string; message: string }[] }).errors;
  assert.equal(errors.length, 1);
  assert.match(errors[0].file, /prompts\.jsonl:2$/);
  assert.match(errors[0].message, /kind must be one of/);
});

test("proposal approve accepts latest; proposal tag validates and commits", async () => {
  const home = await setup();
  await run(["phase", "new", "e", "a", "--title", "A"], ctx(home));
  const file = join(home, "draft.md");
  writeFileSync(file, "# Draft\n");
  await run(["propose", "e", "phase-plan", "--file", file, "--phase", "1"], ctx(home));
  await run(["propose", "e", "phase-plan", "--file", file, "--phase", "1"], ctx(home));
  const approved = await run(["proposal", "approve", "e", "latest", "--to", "phase:1"], ctx(home));
  assert.equal(approved.code, 0);
  assert.equal(readProposal(home, "e", 2).meta.outcome, "approved");
  assert.equal(readProposal(home, "e", 1).meta.outcome, "pending");

  const tagged = await run(["proposal", "tag", "e", "latest-1", "scope-cut", "--json"], ctx(home));
  assert.equal(tagged.code, 0);
  assert.deepEqual(tagged.json, { proposal: 1, tag: "scope-cut", line: "- proposal 1 · scope-cut" });
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "e: tag proposal 1 scope-cut");
  assert.deepEqual(parseTags(readFileSync(paths.notes(home, "e"), "utf8")), { "scope-cut": 1 });

  const bad = await run(["proposal", "tag", "e", "latest", "meh"], ctx(home));
  assert.equal(bad.code, 1);
  assert.equal(bad.stderr, `planet: tag must be one of ${FEEDBACK_TAGS.join(", ")}\n`);
});

test("proposal approve refuses latest from another session, but a plain id bypasses the check", async () => {
  const home = await setup();
  createProposal(home, "e", { step: "scoping", phase: null, session: "other", toolUse: null, planFile: null, body: "# Scope\n" }, NOW);
  const refused = await run(["proposal", "approve", "e", "latest", "--to", "plan"], ctx(home));
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /from another session/);
  const approved = await run(["proposal", "approve", "e", "1", "--to", "plan"], ctx(home));
  assert.equal(approved.code, 0);
});

test("phase new --manual, set --status shipped, and drop", async () => {
  const home = await setup();
  assert.equal((await run(["phase", "new", "e", "review", "--title", "Design review", "--manual"], ctx(home))).code, 0);
  assert.equal(readPhase(home, "e", 1).meta.kind, "manual");
  const bad = await run(["phase", "new", "e", "--phase", "a:A", "--manual"], ctx(home));
  assert.match(bad.stderr, /--manual applies to the single form only/);
  await run(["phase", "new", "e", "code", "--title", "Code"], ctx(home));
  const refused = await run(["phase", "set", "e", "2", "--status", "shipped"], ctx(home));
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /only a manual phase/);
  const ok = await run(["phase", "set", "e", "1", "--status", "shipped", "--json"], ctx(home));
  assert.equal(ok.code, 0);
  assert.equal(readPhase(home, "e", 1).meta.shipped_at, NOW);
  await run(["phase", "set", "e", "1", "--status", "reviewed"], ctx(home));
  await run(["epic", "set", "e", "--status", "active"], ctx(home));
  const drop = await run(["phase", "drop", "e", "2"], ctx(home));
  assert.equal(drop.code, 0);
  assert.equal(readEpic(home, "e").status, "shipped", "dropping the last unfinished phase recomputes the epic");
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "e: drop phase 2");
  const noDrop = await run(["phase", "drop", "e", "1"], ctx(home));
  assert.match(noDrop.stderr, /cannot drop phase 1: status is reviewed/);
});
