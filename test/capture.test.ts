import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { NOW, SESSION, ctx, run, tmpHome } from "./helpers.ts";
import { handleHook, responseText, approvedPlanText } from "../cli/commands/capture.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { newPhases, readPhase } from "../cli/lib/phase.ts";
import { editedPath, readProposal } from "../cli/lib/proposal.ts";
import { startSession } from "../cli/lib/session.ts";
import { git, paths } from "../cli/lib/store.ts";

const PLAN = "# Phase 1\n\nDo A then B.\n";

function hook(event: string, extra: Record<string, unknown>): string {
  return JSON.stringify({ hook_event_name: event, session_id: SESSION, transcript_path: "/t", cwd: "/c", permission_mode: "plan", ...extra });
}

function approvedResponse(plan: string): string {
  return `User has approved your plan. You can now start coding. Start with updating your todo list if applicable\n\nYour plan has been saved to: /plans/x.md\nYou can refer back to it if needed during implementation.\n\n## Approved Plan:\n${plan}`;
}

function setup(phase: number | null = null): string {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  startSession(home, SESSION, "e", { phase, step: "phase-plan" }, NOW);
  return home;
}

test("responseText flattens strings, arrays, and objects", () => {
  assert.equal(responseText("x"), "x");
  assert.equal(responseText([{ type: "text", text: "a" }, { type: "text", text: "b" }]), "a\nb");
  assert.equal(responseText({ stdout: "out", stderr: "err" }), "out\nerr");
  assert.equal(responseText({ weird: 1 }), '{"weird":1}');
  assert.equal(responseText(null), "");
});

test("approvedPlanText slices after the heading and falls back", () => {
  assert.equal(approvedPlanText(approvedResponse(PLAN), "fb"), PLAN);
  assert.equal(approvedPlanText("no heading", "fb"), "fb");
});

test("no marker means no action", () => {
  const home = tmpHome();
  assert.deepEqual(handleHook(hook("UserPromptSubmit", { user_input: "hi" }), ctx(home)), ["no marker"]);
});

test("UserPromptSubmit appends a prompt line with the latest proposal id", () => {
  const home = setup();
  handleHook(hook("UserPromptSubmit", { user_input: "first" }), ctx(home));
  handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t1", tool_input: { plan: PLAN, planFilePath: "/plans/x.md" } }), ctx(home));
  handleHook(hook("UserPromptSubmit", { prompt: "second via legacy field" }), ctx(home));
  const lines = readFileSync(paths.prompts(home, "e"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(lines[0], { ts: NOW, session: SESSION, kind: "planning", phase: null, proposal: null, text: "first" });
  assert.equal(lines[1].proposal, 1);
  assert.equal(lines[1].text, "second via legacy field");
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "e: capture prompt");
});

test("kind is implementation when the marker has a phase", () => {
  const home = setup(1);
  handleHook(hook("UserPromptSubmit", { user_input: "build it" }), ctx(home));
  assert.equal(JSON.parse(readFileSync(paths.prompts(home, "e"), "utf8")).kind, "implementation");
});

test("PreToolUse snapshots the plan; PostToolUse approval without edits", () => {
  const home = setup();
  const pre = handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t1", tool_input: { plan: PLAN, planFilePath: "/plans/x.md" } }), ctx(home));
  assert.deepEqual(pre, ["proposal 1 created"]);
  const p = readProposal(home, "e", 1);
  assert.equal(p.body, PLAN);
  assert.equal(p.meta.step, "phase-plan");
  assert.equal(p.meta.tool_use, "t1");
  assert.equal(p.meta.plan_file, "/plans/x.md");
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "e: snapshot proposal 1");

  const post = handleHook(hook("PostToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t1", tool_input: { plan: PLAN }, tool_response: approvedResponse(PLAN) }), ctx(home));
  assert.deepEqual(post, ["proposal 1 approved"]);
  const approved = readProposal(home, "e", 1);
  assert.equal(approved.meta.outcome, "approved");
  assert.equal(approved.meta.edited, false);
  assert.ok(!existsSync(editedPath(approved.path)));
});

test("PostToolUse approval with inline edits stores the edited plan", () => {
  const home = setup();
  handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t2", tool_input: { plan: PLAN } }), ctx(home));
  const edited = "# Phase 1\n\nDo B then A.\n";
  handleHook(hook("PostToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t2", tool_input: { plan: PLAN }, tool_response: approvedResponse(edited) }), ctx(home));
  const p = readProposal(home, "e", 1);
  assert.equal(p.meta.edited, true);
  assert.equal(readFileSync(editedPath(p.path), "utf8"), edited);
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "e: approve proposal 1 with edits");
});

test("rejections through PostToolUse text, PostToolUseFailure, and PermissionDenied", () => {
  const home = setup();
  handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t3", tool_input: { plan: PLAN } }), ctx(home));
  const comments = 'User chose to stay in plan mode and continue planning\n\nComments on the plan:\n[Re: "Do A then B"] other order';
  assert.deepEqual(handleHook(hook("PostToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t3", tool_input: { plan: PLAN }, tool_response: comments }), ctx(home)), ["proposal 1 rejected"]);
  assert.equal(readProposal(home, "e", 1).meta.feedback, comments);
  assert.deepEqual(handleHook(hook("PostToolUseFailure", { tool_name: "ExitPlanMode", tool_use_id: "t3", tool_input: { plan: PLAN }, tool_error: comments }), ctx(home)), ["proposal 1 already rejected"]);

  handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t4", tool_input: { plan: PLAN } }), ctx(home));
  assert.deepEqual(handleHook(hook("PermissionDenied", { tool_name: "ExitPlanMode", tool_use_id: "t4", tool_input: { plan: PLAN } }), ctx(home)), ["proposal 2 rejected"]);
  assert.equal(readProposal(home, "e", 2).meta.feedback, "rejected without a message");

  handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t5", tool_input: { plan: PLAN } }), ctx(home));
  assert.deepEqual(handleHook(hook("PostToolUse", { tool_name: "ExitPlanMode", tool_input: { plan: PLAN }, tool_response: "The user doesn't want to proceed. the user said:\nno" }), ctx(home)), ["proposal 3 rejected"], "falls back to latest pending without tool_use_id");
});

test("subagent plan events are ignored", () => {
  const home = setup();
  assert.deepEqual(handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", agent_id: "agent-1", tool_use_id: "t9", tool_input: { plan: PLAN } }), ctx(home)), ["subagent plan ignored"]);
});

test("capture command never fails: bad json is logged and exit code is 0", async () => {
  const home = setup();
  const r = await run(["capture"], ctx(home, { stdin: () => "not json" }));
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "");
  assert.match(readFileSync(paths.hookLog(home), "utf8"), /Unexpected token|not valid JSON/);
});

const PR = "https://github.com/o/r/pull/12";

test("gh pr create output links the PR to the session phase", () => {
  const home = setup(1);
  const actions = handleHook(hook("PostToolUse", {
    tool_name: "Bash",
    tool_input: { command: "gh pr create --title x --body y" },
    tool_response: `Creating pull request for feat in o/r\n\n${PR}\n`,
  }), ctx(home));
  assert.deepEqual(actions, [`linked ${PR} to phase 1`]);
  const phase = readPhase(home, "e", 1);
  assert.equal(phase.meta.status, "in-progress");
  assert.equal(phase.meta.prs[0].url, PR);
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), `e: link phase 1 to ${PR}`);
  assert.deepEqual(handleHook(hook("PostToolUse", { tool_name: "Bash", tool_input: { command: "gh pr create" }, tool_response: { stdout: PR, stderr: "" } }), ctx(home)), ["already linked"]);
});

test("gh pr create is ignored without a phase, without a url, or for other commands", () => {
  const home = setup();
  assert.deepEqual(handleHook(hook("PostToolUse", { tool_name: "Bash", tool_input: { command: "gh pr create" }, tool_response: PR }), ctx(home)), ["no phase in session; not linking"]);
  const withPhase = setup(1);
  assert.deepEqual(handleHook(hook("PostToolUse", { tool_name: "Bash", tool_input: { command: "gh pr create" }, tool_response: "error: not authenticated" }), ctx(withPhase)), ["no PR url in output"]);
  assert.deepEqual(handleHook(hook("PostToolUse", { tool_name: "Bash", tool_input: { command: "gh pr view 12" }, tool_response: PR }), ctx(withPhase)), ["ignored"]);
});

test("a PR from another repo is logged, not linked, and the hook still exits 0", async () => {
  const home = setup(1);
  const raw = hook("PostToolUse", { tool_name: "Bash", tool_input: { command: "gh pr create" }, tool_response: "https://github.com/other/repo/pull/1" });
  const r = await run(["capture"], ctx(home, { stdin: () => raw }));
  assert.equal(r.code, 0);
  assert.match(readFileSync(paths.hookLog(home), "utf8"), /is not in o\/r/);
  assert.deepEqual(readPhase(home, "e", 1).meta.prs, []);
});
