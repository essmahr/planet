import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BASE, NOW, PR as OPEN_PR, SESSION, comment, convo, ctx, fakeGh, review, run, tmpHome } from "./helpers.ts";
import { handleHook, responseText, approvedPlanText, userText } from "../cli/commands/capture.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { linkPrs } from "../cli/lib/link.ts";
import { addMarks, recordCheck } from "../cli/lib/pr-items.ts";
import { newPhases, readPhase, writePhase } from "../cli/lib/phase.ts";
import { readProposal } from "../cli/lib/proposal.ts";
import { readMarker, setSessionStep, startSession } from "../cli/lib/session.ts";
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

test("no marker means no action", async () => {
  const home = tmpHome();
  assert.deepEqual((await handleHook(hook("UserPromptSubmit", { user_input: "hi" }), ctx(home))).actions, ["no marker"]);
});

test("UserPromptSubmit appends a prompt line with the latest proposal id", async () => {
  const home = setup();
  await handleHook(hook("UserPromptSubmit", { user_input: "first" }), ctx(home));
  await handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t1", tool_input: { plan: PLAN, planFilePath: "/plans/x.md" } }), ctx(home));
  await handleHook(hook("UserPromptSubmit", { prompt: "second via legacy field" }), ctx(home));
  const lines = readFileSync(paths.prompts(home, "e"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(lines[0], { ts: NOW, session: SESSION, kind: "planning", phase: null, proposal: null, text: "first" });
  assert.equal(lines[1].proposal, 1);
  assert.equal(lines[1].text, "second via legacy field");
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "e: capture prompt");
});

test("kind follows the session step, not the phase", async () => {
  const home = setup(1);
  await handleHook(hook("UserPromptSubmit", { user_input: "still planning" }), ctx(home));
  setSessionStep(home, SESSION, "implement");
  await handleHook(hook("UserPromptSubmit", { user_input: "build it" }), ctx(home));
  const lines = readFileSync(paths.prompts(home, "e"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(lines[0].kind, "planning");
  assert.equal(lines[1].kind, "implementation");
});

test("PreToolUse snapshots the plan; PostToolUse approval marks it approved", async () => {
  const home = setup();
  const pre = (await handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t1", tool_input: { plan: PLAN, planFilePath: "/plans/x.md" } }), ctx(home))).actions;
  assert.deepEqual(pre, ["proposal 1 created"]);
  const p = readProposal(home, "e", 1);
  assert.equal(p.body, PLAN);
  assert.equal(p.meta.step, "phase-plan");
  assert.equal(p.meta.tool_use, "t1");
  assert.equal(p.meta.plan_file, "/plans/x.md");
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "e: snapshot proposal 1");

  const post = (await handleHook(hook("PostToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t1", tool_input: { plan: PLAN }, tool_response: approvedResponse(PLAN) }), ctx(home))).actions;
  assert.deepEqual(post, ["proposal 1 approved"]);
  const approved = readProposal(home, "e", 1);
  assert.equal(approved.meta.outcome, "approved");
  assert.ok(!existsSync(paths.hookLog(home)), "matching text logs nothing");
});

test("an approved text that differs from the snapshot is logged, and the snapshot is kept", async () => {
  const home = setup();
  await handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t2", tool_input: { plan: PLAN } }), ctx(home));
  await handleHook(hook("PostToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t2", tool_input: { plan: PLAN }, tool_response: approvedResponse("# Phase 1\n\nDo B then A.\n") }), ctx(home));
  const p = readProposal(home, "e", 1);
  assert.equal(p.meta.outcome, "approved");
  assert.equal(p.body, PLAN);
  assert.match(readFileSync(paths.hookLog(home), "utf8"), /approved text for proposal 1 differs from its snapshot/);
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "e: approve proposal 1");
});

test("an unrecognized PostToolUse result leaves the proposal pending and logs it", async () => {
  const home = setup();
  await handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t6", tool_input: { plan: PLAN } }), ctx(home));
  const actions = (await handleHook(hook("PostToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t6", tool_input: { plan: PLAN }, tool_response: { isAgent: false, filePath: "/plans/x.md" } }), ctx(home))).actions;
  assert.deepEqual(actions, ["proposal 1 left pending: unrecognized result"]);
  assert.equal(readProposal(home, "e", 1).meta.outcome, "pending");
  assert.match(readFileSync(paths.hookLog(home), "utf8"), /unrecognized ExitPlanMode result/);
});

test("rejections through PostToolUse text, PostToolUseFailure, and PermissionDenied", async () => {
  const home = setup();
  await handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t3", tool_input: { plan: PLAN } }), ctx(home));
  const comments = 'User chose to stay in plan mode and continue planning\n\nComments on the plan:\n[Re: "Do A then B"] other order';
  assert.deepEqual((await handleHook(hook("PostToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t3", tool_input: { plan: PLAN }, tool_response: comments }), ctx(home))).actions, ["proposal 1 rejected"]);
  assert.equal(readProposal(home, "e", 1).meta.feedback, comments);
  assert.deepEqual((await handleHook(hook("PostToolUseFailure", { tool_name: "ExitPlanMode", tool_use_id: "t3", tool_input: { plan: PLAN }, tool_error: comments }), ctx(home))).actions, ["proposal 1 already rejected"]);

  await handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t4", tool_input: { plan: PLAN } }), ctx(home));
  assert.deepEqual((await handleHook(hook("PermissionDenied", { tool_name: "ExitPlanMode", tool_use_id: "t4", tool_input: { plan: PLAN } }), ctx(home))).actions, ["proposal 2 rejected"]);
  assert.equal(readProposal(home, "e", 2).meta.feedback, "rejected without a message");

  await handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t5", tool_input: { plan: PLAN } }), ctx(home));
  assert.deepEqual((await handleHook(hook("PostToolUse", { tool_name: "ExitPlanMode", tool_input: { plan: PLAN }, tool_response: "The user doesn't want to proceed. the user said:\nno" }), ctx(home))).actions, ["proposal 3 rejected"], "falls back to latest pending without tool_use_id");
});

test("subagent plan events are ignored", async () => {
  const home = setup();
  assert.deepEqual((await handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", agent_id: "agent-1", tool_use_id: "t9", tool_input: { plan: PLAN } }), ctx(home))).actions, ["subagent plan ignored"]);
});

test("capture command never fails: bad json is logged and exit code is 0", async () => {
  const home = setup();
  const r = await run(["capture"], ctx(home, { stdin: () => "not json" }));
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "");
  assert.match(readFileSync(paths.hookLog(home), "utf8"), /Unexpected token|not valid JSON/);
});

const PR = "https://github.com/o/r/pull/12";

test("gh pr create output links the PR to the session phase", async () => {
  const home = setup(1);
  const { actions } = await handleHook(hook("PostToolUse", {
    tool_name: "Bash",
    tool_input: { command: "gh pr create --title x --body y" },
    tool_response: `Creating pull request for feat in o/r\n\n${PR}\n`,
  }), ctx(home));
  assert.deepEqual(actions, [`linked ${PR} to phase 1`]);
  const phase = readPhase(home, "e", 1);
  assert.equal(phase.meta.status, "in-progress");
  assert.equal(phase.meta.prs[0].url, PR);
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), `e: link phase 1 to ${PR}`);
  assert.deepEqual((await handleHook(hook("PostToolUse", { tool_name: "Bash", tool_input: { command: "gh pr create" }, tool_response: { stdout: PR, stderr: "" } }), ctx(home))).actions, ["already linked"]);
});

test("gh pr create is ignored without a phase, without a url, or for other commands", async () => {
  const home = setup();
  assert.deepEqual((await handleHook(hook("PostToolUse", { tool_name: "Bash", tool_input: { command: "gh pr create" }, tool_response: PR }), ctx(home))).actions, ["no phase in session; not linking"]);
  const withPhase = setup(1);
  assert.deepEqual((await handleHook(hook("PostToolUse", { tool_name: "Bash", tool_input: { command: "gh pr create" }, tool_response: "error: not authenticated" }), ctx(withPhase))).actions, ["no PR url in output"]);
  assert.deepEqual((await handleHook(hook("PostToolUse", { tool_name: "Bash", tool_input: { command: "gh pr view 12" }, tool_response: PR }), ctx(withPhase))).actions, ["ignored"]);
});

test("a PR from another repo is logged, not linked, and the hook still exits 0", async () => {
  const home = setup(1);
  const raw = hook("PostToolUse", { tool_name: "Bash", tool_input: { command: "gh pr create" }, tool_response: "https://github.com/other/repo/pull/1" });
  const r = await run(["capture"], ctx(home, { stdin: () => raw }));
  assert.equal(r.code, 0);
  assert.match(readFileSync(paths.hookLog(home), "utf8"), /is not in o\/r/);
  assert.deepEqual(readPhase(home, "e", 1).meta.prs, []);
});

test("PostToolUse approval arrives as a structured result carrying the approved plan", async () => {
  const home = setup();
  await handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "s1", tool_input: { plan: PLAN, planFilePath: "/plans/x.md" } }), ctx(home));
  const same = (await handleHook(hook("PostToolUse", { tool_name: "ExitPlanMode", tool_use_id: "s1", tool_input: {}, tool_response: { filePath: "/plans/x.md", isAgent: false, plan: PLAN } }), ctx(home))).actions;
  assert.deepEqual(same, ["proposal 1 approved"]);
  assert.equal(readProposal(home, "e", 1).meta.outcome, "approved");
});

test("a new plan while one is pending rejects the pending one with the transcript's feedback", async () => {
  const home = setup();
  const transcript = join(home, "transcript.jsonl");
  const rejection = {
    type: "user",
    toolDenialKind: "user-rejected",
    userFeedback: "trim down, too much surface area",
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: "r1", is_error: true, content: "The user doesn't want to proceed with this tool use. To tell you how to proceed, the user said:\ntrim down, too much surface area" }] },
  };
  writeFileSync(transcript, `${JSON.stringify({ type: "assistant", message: { content: [] } })}\n${JSON.stringify(rejection)}\n`);
  await handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "r1", tool_input: { plan: PLAN }, transcript_path: transcript }), ctx(home));
  const actions = (await handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "r2", tool_input: { plan: PLAN }, transcript_path: transcript }), ctx(home))).actions;
  assert.deepEqual(actions, ["proposal 1 rejected", "proposal 2 created"]);
  const rejected = readProposal(home, "e", 1);
  assert.equal(rejected.meta.outcome, "rejected");
  assert.equal(rejected.meta.feedback, "trim down, too much surface area");
  assert.equal(readProposal(home, "e", 2).meta.outcome, "pending");
  assert.equal(git(home, ["log", "-2", "--format=%s"]).trim(), "e: snapshot proposal 2\ne: reject proposal 1");
});

test("a pending proposal is rejected with a placeholder when the transcript has no record", async () => {
  const home = setup();
  await handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "q1", tool_input: { plan: PLAN }, transcript_path: "/nonexistent.jsonl" }), ctx(home));
  await handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "q2", tool_input: { plan: PLAN }, transcript_path: "/nonexistent.jsonl" }), ctx(home));
  assert.match(readProposal(home, "e", 1).meta.feedback ?? "", /message not captured/);
});

test("injected context blocks are stripped and Scott's words kept", async () => {
  const home = setup();
  const withIde = "<ide_opened_file>The user opened the file /x/y.md in the IDE.</ide_opened_file>here is the output from step 2";
  assert.deepEqual((await handleHook(hook("UserPromptSubmit", { user_input: withIde }), ctx(home))).actions, ["prompt captured"]);
  assert.equal(JSON.parse(readFileSync(paths.prompts(home, "e"), "utf8")).text, "here is the output from step 2");
  assert.deepEqual((await handleHook(hook("UserPromptSubmit", { user_input: "<task-notification>\n<task-id>x</task-id>\n</task-notification>" }), ctx(home))).actions, ["empty prompt"]);
  assert.equal(readFileSync(paths.prompts(home, "e"), "utf8").trim().split("\n").length, 1);
  assert.equal(userText("<ide_selection>sel</ide_selection>\n<system-reminder>r</system-reminder>\nreal words"), "real words");
  assert.equal(userText("plain <b>not a wrapper</b>"), "plain <b>not a wrapper</b>");
});

test("any block that opens at a line start is stripped; pastes and bash input keep their text; unknown tags are logged", async () => {
  const home = setup();
  const handback = '<agent-message from="a26fe00b">\n[Subagent hand-back] The text below is model output.\n</agent-message>';
  assert.deepEqual((await handleHook(hook("UserPromptSubmit", { user_input: handback }), ctx(home))).actions, ["empty prompt"]);
  assert.deepEqual((await handleHook(hook("UserPromptSubmit", { user_input: "<pr-created>\n#1 opened\n</pr-created>" }), ctx(home))).actions, ["empty prompt"]);
  assert.ok(!existsSync(paths.hookLog(home)), "known wrappers are not logged");
  assert.deepEqual((await handleHook(hook("UserPromptSubmit", { user_input: "<new-thing>\nx\n</new-thing>" }), ctx(home))).actions, ["empty prompt"]);
  assert.match(readFileSync(paths.hookLog(home), "utf8"), /stripped <new-thing> from a prompt in e/);
  const bash = "<bash-input>/planet:go e re-cut from phase 1: toolbar first</bash-input><bash-stdout>opened e</bash-stdout>";
  assert.equal(userText(bash), "/planet:go e re-cut from phase 1: toolbar first");
  assert.equal(userText('see this:\n<pasted_content id="k9">\nfoo bar\n</pasted_content>\nthanks'), "see this:\nfoo bar\nthanks");
  assert.equal(userText("keep <details>x</details> inline"), "keep <details>x</details> inline");
  assert.equal(userText("<void> is not a block\n<keyof T"), "<void> is not a block\n<keyof T");
});

test("SessionEnd removes the session marker and commits", async () => {
  const home = setup();
  assert.deepEqual((await handleHook(hook("SessionEnd", { reason: "exit" }), ctx(home))).actions, ["session ended"]);
  assert.equal(readMarker(home, SESSION), null);
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "e: end session");
  assert.deepEqual((await handleHook(hook("UserPromptSubmit", { user_input: "after end" }), ctx(home))).actions, ["no marker"]);
});

test("capture with empty stdin is a quiet no-op", async () => {
  const home = setup();
  const r = await run(["capture"], ctx(home, { stdin: () => "" }));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /nothing to do/);
  assert.ok(!existsSync(paths.hookLog(home)));
});

function lastPrompt(home: string, epic: string): { kind: string } {
  const lines = readFileSync(paths.prompts(home, epic), "utf8").trim().split("\n");
  return JSON.parse(lines[lines.length - 1]) as { kind: string };
}

test("a prompt during a pr-feedback step is captured as review", async () => {
  const home = setup(1);
  setSessionStep(home, SESSION, "pr-feedback", 1);
  await handleHook(hook("UserPromptSubmit", { user_input: "do 1 3" }), ctx(home));
  assert.equal(lastPrompt(home, "e").kind, "review");
});

function noteSetup(): { home: string; gh: ReturnType<typeof fakeGh> } {
  const home = setup(1);
  linkPrs(home, "e", 1, [OPEN_PR], NOW);
  const gh = fakeGh({}, {}, false, undefined, { [OPEN_PR]: { ...BASE, reviews: [review("r1", "bob", "fix it")], comments: [comment("c1", "bob", false)] } });
  return { home, gh };
}

test("a prompt gets a note when a phase has items not yet notified", async () => {
  const { home, gh } = noteSetup();
  const r = await handleHook(hook("UserPromptSubmit", { user_input: "hi" }), ctx(home, { gh }));
  assert.match(r.context ?? "", /^Planet: phase 1 PR has 2 new review items\. Mention this in one line; handle them only when the user asks \(\/planet:go e pr feedback 1\)\.$/);
  assert.deepEqual(r.actions, ["prompt captured"]);
  assert.equal(git(home, ["status", "--porcelain"]).trim(), "", "the check write is committed with the prompt");
});

test("no note once every item is notified", async () => {
  const { home, gh } = noteSetup();
  addMarks(home, "e", 1, "notified", ["r1", "c1"]);
  const r = await handleHook(hook("UserPromptSubmit", { user_input: "hi" }), ctx(home, { gh }));
  assert.equal(r.context, null);
});

test("a fresh check is reused without calling gh", async () => {
  const { home, gh } = noteSetup();
  recordCheck(home, "e", 1, 2, NOW);
  const r = await handleHook(hook("UserPromptSubmit", { user_input: "hi" }), ctx(home, { gh }));
  assert.equal(gh.calls.filter((c) => c.startsWith("prFeedback")).length, 0);
  assert.match(r.context ?? "", /2 new review items/);
});

test("a stale check calls gh again", async () => {
  const { home, gh } = noteSetup();
  recordCheck(home, "e", 1, 0, "2026-09-03T14:50:00.000Z");
  const r = await handleHook(hook("UserPromptSubmit", { user_input: "hi" }), ctx(home, { gh }));
  assert.equal(gh.calls.filter((c) => c.startsWith("prFeedback")).length, 1);
  assert.match(r.context ?? "", /2 new review items/);
});

test("a gh failure gives no note, logs one line, and still captures the prompt", async () => {
  const { home } = noteSetup();
  const r = await handleHook(hook("UserPromptSubmit", { user_input: "hi" }), ctx(home, { gh: fakeGh({}, {}, true) }));
  assert.equal(r.context, null);
  assert.match(readFileSync(paths.prompts(home, "e"), "utf8"), /hi/);
  assert.equal(readFileSync(paths.hookLog(home), "utf8").trim().split("\n").length, 1);
});

test("a corrupt marks file skips the phase and still captures the prompt", async () => {
  const { home, gh } = noteSetup();
  writeFileSync(paths.marks(home, "e", 1), "{{{");
  const r = await handleHook(hook("UserPromptSubmit", { user_input: "hi" }), ctx(home, { gh }));
  assert.equal(r.context, null);
  assert.match(readFileSync(paths.prompts(home, "e"), "utf8"), /hi/);
  assert.equal(readFileSync(paths.hookLog(home), "utf8").trim().split("\n").length, 1);
});

test("a malformed phase file gives no note, logs one line, and still captures the prompt", async () => {
  const { home, gh } = noteSetup();
  writeFileSync(join(home, "epics", "e", "phases", readdirSync(join(home, "epics", "e", "phases"))[0]), "---\n: : [\n---\n");
  const r = await handleHook(hook("UserPromptSubmit", { user_input: "hi" }), ctx(home, { gh }));
  assert.equal(r.context, null);
  assert.match(readFileSync(paths.prompts(home, "e"), "utf8"), /hi/);
  assert.equal(readFileSync(paths.hookLog(home), "utf8").trim().split("\n").length, 1);
});

test("phases are polled concurrently", async () => {
  const home = setup(1);
  newPhases(home, "e", [{ slug: "b", title: "B" }]);
  const PR2 = "https://github.com/o/r/pull/8";
  linkPrs(home, "e", 1, [OPEN_PR], NOW);
  linkPrs(home, "e", 2, [PR2], NOW);
  let started = 0;
  let release!: () => void;
  const both = new Promise<void>((resolve) => { release = resolve; });
  const gh = fakeGh();
  gh.prFeedback = async (url) => {
    started++;
    if (started === 2) release();
    await both;
    return { ...BASE, url, reviews: [review(`r-${url}`, "bob", "x")] };
  };
  const r = await Promise.race([
    handleHook(hook("UserPromptSubmit", { user_input: "hi" }), ctx(home, { gh })),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("phases were polled one after another")), 2000)),
  ]);
  assert.match(r.context ?? "", /phase 1 PR has 1 new review items\.[^\n]*\nPlanet: phase 2 PR has 1 new review items\./);
});

test("a gh failure is remembered so the next prompt makes no gh call", async () => {
  const { home } = noteSetup();
  const down = fakeGh({}, {}, true);
  await handleHook(hook("UserPromptSubmit", { user_input: "one" }), ctx(home, { gh: down }));
  await handleHook(hook("UserPromptSubmit", { user_input: "two" }), ctx(home, { gh: down }));
  assert.equal(down.calls.filter((c) => c.startsWith("prFeedback")).length, 1);
});

test("only prompts and open prs produce a note", async () => {
  const { home, gh } = noteSetup();
  const post = await handleHook(hook("PostToolUse", { tool_name: "Read" }), ctx(home, { gh }));
  assert.equal(post.context, null);
  const closed = setup(1);
  linkPrs(closed, "e", 1, [OPEN_PR], NOW);
  const phase = readPhase(closed, "e", 1);
  phase.meta.prs[0].state = "merged";
  writePhase(phase);
  const r = await handleHook(hook("UserPromptSubmit", { user_input: "hi" }), ctx(closed, { gh }));
  assert.equal(r.context, null);
  assert.equal(gh.calls.length, 0);
});
