import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NOW, SESSION, ctx, run, tmpHome } from "./helpers.ts";
import { handleHook } from "../cli/commands/capture.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { REVIEW, paths } from "../cli/lib/store.ts";
import { readMarker } from "../cli/lib/session.ts";
import { createProposal, listProposals, readProposal } from "../cli/lib/proposal.ts";

function hook(event: string, extra: Record<string, unknown>): string {
  return JSON.stringify({ hook_event_name: event, session_id: SESSION, transcript_path: "/t", ...extra });
}

test("review paths live under reviews/ and epic new refuses the slug", async () => {
  const home = tmpHome();
  assert.equal(paths.proposals(home, REVIEW), join(home, "reviews", "proposals"));
  assert.equal(paths.prompts(home, REVIEW), join(home, "reviews", "prompts.jsonl"));
  assert.equal(paths.notes(home, REVIEW), join(home, "reviews", "notes.md"));
  const r = await run(["epic", "new", "review", "--title", "R", "--repo", "o/r"], ctx(home));
  assert.equal(r.code, 1);
  assert.match(r.stderr, /reserved/);
});

test("planet session review marks the session and hooks capture under reviews/", async () => {
  const home = tmpHome();
  const r = await run(["session", "review", "--json"], ctx(home));
  assert.equal(r.code, 0);
  assert.deepEqual(readMarker(home, SESSION), { epic: REVIEW, phase: null, step: "feedback-review", started: NOW });
  handleHook(hook("UserPromptSubmit", { user_input: "review the rejections" }), ctx(home));
  assert.ok(existsSync(paths.prompts(home, REVIEW)));
  handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t1", tool_input: { plan: "# Findings\n" } }), ctx(home));
  const proposals = listProposals(home, REVIEW);
  assert.equal(proposals.length, 1);
  assert.match(proposals[0].path, /reviews\/proposals\/001-feedback-review\.md$/);
  handleHook(hook("PostToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t1", tool_response: { plan: "# Findings\n", filePath: "/p", isAgent: false } }), ctx(home));
  const a = await run(["proposal", "approve", REVIEW, "latest", "--to", "review", "--json"], ctx(home));
  assert.equal(a.code, 0);
  const record = join(home, "reviews", "2026-09-03.md");
  assert.equal(readFileSync(record, "utf8"), "# Findings\n");
  const b = await run(["proposal", "approve", REVIEW, "latest", "--to", "review", "--from", record, "--json"], ctx(home));
  assert.equal(b.code, 0);
  assert.ok(existsSync(join(home, "reviews", "2026-09-03-2.md")));
  const end = await run(["session", "end"], ctx(home));
  assert.equal(end.code, 0);
  assert.equal(readMarker(home, SESSION), null);
  const status = await run(["status", "--no-sync", "--json"], ctx(home));
  assert.deepEqual(status.json, []);
});

test("proposal approve guards review destinations before mutating the proposal", async () => {
  const home = tmpHome();
  await run(["session", "review", "--json"], ctx(home));
  handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t1", tool_input: { plan: "# Findings\n" } }), ctx(home));
  const bad = await run(["proposal", "approve", REVIEW, "latest", "--to", "plan"], ctx(home));
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /only approve --to review/);
  assert.equal(readProposal(home, REVIEW, 1).meta.outcome, "pending");

  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  createProposal(home, "e", { step: "phasing", phase: null, session: SESSION, toolUse: null, planFile: null, body: "# Phases\n" }, NOW);
  const wrong = await run(["proposal", "approve", "e", "1", "--to", "review"], ctx(home));
  assert.equal(wrong.code, 1);
  assert.match(wrong.stderr, /only for the review pseudo-epic/);
});
