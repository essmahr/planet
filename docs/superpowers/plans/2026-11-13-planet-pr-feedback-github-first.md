# PR Feedback, GitHub First: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the agent-triaged PR feedback loop with one driven by the user's own GitHub reactions, owned by the session that opened the PR.

**Architecture:** Task 1 removes the old loop down to merged, closed, and stopped handling. Tasks 2 to 8 add the CLI parts: a session on each PR link, viewer reactions in the GitHub fetch, a pure signals function, draft detection from commit trailers, two `pr` subcommands, a watcher that fires on signals, and a hook line that restarts a dead watcher. Tasks 9 to 11 rewrite the skill text, trim retro, and update docs and versions.

**Tech Stack:** TypeScript on Node 24 (`node --test`, `tsc --noEmit`), `gh api graphql`, git, Claude Code skills and hooks.

**Spec:** `docs/superpowers/specs/2026-11-12-planet-pr-feedback-github-first-design.md`. Read it before any task.

## Global Constraints

- Run `npm test` and `npm run typecheck` before every commit. Both must pass.
- Commit messages: one line, lowercase, imperative, no prefix, no trailing period.
- One commit per task unless the task says otherwise. Never amend a commit from an earlier task.
- `skills/planet-implement/references/verification.md` has an uncommitted edit that belongs to other work. Never stage, revert, or modify it.
- Store writes go through `commit(ctx.home, message)` as existing commands do.
- Reaction names in code are GitHub's `ReactionContent` values: `THUMBS_UP`, `EYES`, `ROCKET`.
- The trailer key is exactly `Feedback`, and its value is the comment's `url`.
- Skill prose: short sentences, no em-dashes, and within the word budget in `test/skills.test.ts`.
- The agent never posts a reply or resolves a thread. Its only GitHub writes are reaction changes and the approved push.

## Review Focus

1. A resumed session may get a new session id, so the hook never restarts its watcher. Task 8 has a probe step and records the result.
2. One comment has both 👍 and 👀. Expected: two signals, both handled. Test in Task 4.
3. The push succeeded but the 🚀 swap failed or crashed. Expected: the 👍 still counts as open work and the next wake finishes the swap. Tests in Tasks 4 and 7.
4. The PR branch moved while drafts were unpushed and a draft no longer rebases. Expected: that draft is dropped, its 👍 stays, and it is redrafted on the new base in the same wake. Rule in Task 9.
5. The user removes a 👍 during the debounce poll. Expected: no wake. Test in Task 7.

---

### Task 1: Remove the old loop

**Files:**
- Delete: `cli/lib/pending-note.ts`, `cli/lib/pr-items.ts`, `test/pr-items.test.ts`, `test/pr-feedback.test.ts`, `skills/planet-pr-feedback/references/batch-format.md`, `skills/planet-pr-feedback/references/apply.md`
- Modify: `cli/commands/pr.ts`, `cli/commands/watch.ts`, `cli/commands/capture.ts`, `cli/lib/store.ts` (drop `paths.marks`, `paths.marksLock`), `cli/planet.ts:58` (usage line), `skills/planet-pr-feedback/SKILL.md`, `skills/go/references/pr-feedback.md`, `README.md:33`
- Test: `test/watch.test.ts`, `test/capture.test.ts`, `test/store.test.ts`, `test/skills.test.ts`

**Interfaces:**
- Produces: `planet pr feedback <epic> <phase> [--json]` (the plain listing only). `planet watch` with events `merged | closed | stopped` only. `Event` type in `watch.ts` keeps `"feedback"` out until Task 7.

- [ ] **Step 1: Ask the user before discarding edits.** `skills/planet-pr-feedback/SKILL.md`, `references/apply.md`, and `references/batch-format.md` have uncommitted edits. Show `git diff --stat -- skills/planet-pr-feedback` and get a yes before continuing.

- [ ] **Step 2: Update the tests first.**
  - `test/watch.test.ts`: delete every test that uses `addMarks`, `claimOwner`, `takeOwner`, `readMarks`, or expects `event: feedback` or a `handed`/`owned by` line. Keep and fix the merged, closed, stopped, backoff, pid file, and max-polls tests. Add:

```ts
test("an open PR with new comments does not wake the watcher", async () => {
  const home = setup();
  const gh = fakeGh({}, {}, false, undefined, { [PR]: withComment });
  const r = await run(["watch", "e", "1", "--max-polls", "2", "--json"], ctx(home, { gh }));
  assert.equal((r.json as { event: string }).event, "stopped");
});
```

  - `test/capture.test.ts`: delete the pending note tests (around line 289), the awaited-reply tests, and the ownership release tests (around line 392). Keep "a prompt during a pr-feedback step is captured as review". Add an assertion to one prompt test that `r.context` is `null` when the phase has an open PR with comments.
  - `test/store.test.ts`: remove assertions on `paths.marks` and `paths.marksLock`.
  - `test/skills.test.ts`: set the `planet-pr-feedback` word budget to 450.

- [ ] **Step 3: Run `npm test`.** Expected: failures in the files above, and typecheck errors for the removed imports.

- [ ] **Step 4: Remove the code.**
  - `pr.ts`: delete `markFeedback`, `awaitReply`, `takeFeedback`, `claim`, `newFeedback`, and the `--new`/`--claim` parsing. `prFeedback` keeps only its plain listing. Usage: `usage: planet pr files|feedback <epic> <phase>`.
  - `watch.ts`: delete `lostWatch`, the `claimOwner` block, and the notified/fresh-items block. The loop only checks for merged or closed. Keep `quiet`, `runningWatcher`, the pid file, backoff, and `--max-polls`.
  - `capture.ts`: delete the `pendingNote` call (context is always `null`), `awaitsThisSession`, `takeAwaitedPhase`, `releaseOwnership`, and `epicPhases` if unused. `kind` is `promptKind(marker)` and `phase` is `marker.phase`.

- [ ] **Step 5: Cut the skill down.** `SKILL.md` keeps the frontmatter, the Input line, step 1 (Marker), and the merged, closed, and stopped steps, renumbered. Drop every critical rule except the worktree rule and the store-writes rule. In the merged step, replace `planet pr feedback <slug> <N> --new --json` with `planet pr feedback <slug> <N> --json`. `references/worktree.md` is unchanged.

- [ ] **Step 6: Fix the router and README.** In `skills/go/references/pr-feedback.md`, step 2's first bullet (non-empty `open_prs`) now says: "say the PR is open and nothing is pending, stop". In `README.md:33`, delete the two sentences from "Planet sorts each comment" through "until you say so."

- [ ] **Step 7: Run `npm test` and `npm run typecheck`.** Expected: both pass. `grep -rn "pr-items\|pending-note\|awaiting_reply" cli test skills` prints nothing.

- [ ] **Step 8: Commit.** `git commit -m "remove the pr feedback triage loop"`, staging only the files listed above.

---

### Task 2: A session on each PR link

**Files:**
- Modify: `cli/schema/types.ts` (`PrRef`), `cli/schema/validate.ts` (`validatePr`), `cli/lib/link.ts`, `cli/commands/link.ts`, `cli/commands/capture.ts:235`, `cli/commands/pr.ts`, `cli/planet.ts` (usage)
- Create: `cli/lib/owner.ts`
- Test: `test/link.test.ts`, `test/validate.test.ts`, `test/sync.test.ts`, `test/capture.test.ts`, create `test/owner.test.ts`

**Interfaces:**
- Produces:
  - `PrRef.session: string | null`. A phase file without the key reads as `null`.
  - `linkPrs(home, epicSlug, phaseId, urls, now, session: string | null): LinkResult`
  - `ownPrs(home: string, epic: string, phase: number, session: string): string[]` in `owner.ts`: sets `session` on every PR of the phase and returns their urls.
  - `ownedOpenPrs(home: string, session: string): { epic: string; phase: number; url: string }[]` in `owner.ts`: across all epics (`listEpics`), PRs with `state === "open"` and that session. A phase or epic that fails to read is skipped.
  - CLI: `planet pr own <epic> <phase>` prints `phase <N>: feedback owned by this session`.

- [ ] **Step 1: Write the failing tests.**

```ts
// test/owner.test.ts
test("a PR linked by the hook records the session", () => {
  linkPrs(home, "e", 1, [PR], NOW, SESSION);
  assert.equal(readPhase(home, "e", 1).meta.prs[0].session, SESSION);
});
test("ownedOpenPrs returns only open PRs of that session", () => {
  linkPrs(home, "e", 1, [PR], NOW, SESSION);
  linkPrs(home, "e", 2, [PR2], NOW, "sess-2");
  assert.deepEqual(ownedOpenPrs(home, SESSION), [{ epic: "e", phase: 1, url: PR }]);
});
test("pr own moves every PR of the phase to this session", async () => {
  linkPrs(home, "e", 1, [PR], NOW, null);
  await run(["pr", "own", "e", "1"], ctx(home));
  assert.equal(readPhase(home, "e", 1).meta.prs[0].session, SESSION);
});
```

  Also: in `test/validate.test.ts`, a PR entry with no `session` key validates to `session: null`. In `test/sync.test.ts`, a sync that changes a PR's state keeps its `session`. In `test/capture.test.ts`, the `gh pr create` hook test asserts the linked PR's `session` equals the payload's `session_id`.

- [ ] **Step 2: Run them.** Expected: FAIL (missing `owner.ts`, wrong arity).

- [ ] **Step 3: Implement.** `validatePr` reads `session` with a missing key as `null`. `capture.ts` passes `input.session_id`. `commands/link.ts` passes `ctx.env.CLAUDE_CODE_SESSION_ID ?? null`. Check that `sync` copies PR entries without dropping keys; fix it if the test fails. `pr own` uses `sessionIdFrom(ctx.env)` and commits `<epic>: phase <N> feedback owned by session <id>`.

- [ ] **Step 4: Run `npm test` and `npm run typecheck`.** Expected: pass.

- [ ] **Step 5: Commit.** `record the opening session on each pr link`

---

### Task 3: Viewer reactions in the GitHub client

**Files:**
- Modify: `cli/lib/gh.ts`, `test/helpers.ts`
- Test: `test/gh.test.ts`

**Interfaces:**
- Produces, in `gh.ts`:
  - `export type Reaction = "THUMBS_UP" | "EYES" | "ROCKET";`
  - `PrReview`, `PrComment`, `PrConversationComment` each gain `viewer_reactions: Reaction[]` (other contents are dropped).
  - `PrComment` gains `viewer_reply: string | null`: the body of the last comment in the same thread that the viewer wrote after this comment, else `null`.
  - `PrFeedback` gains `viewer: string` (the authenticated login).
  - `Gh.react(subjectId: string, content: Reaction, on: boolean): Promise<void>`: `addReaction` when `on`, else `removeReaction`. Removing a reaction that is not there is not an error.
- In `test/helpers.ts`: `BASE.viewer = "me"`; `review`, `comment`, `convo` default `viewer_reactions: []`, and `comment` defaults `viewer_reply: null`; `fakeGh.react` pushes `react:+ROCKET:<id>` or `react:-THUMBS_UP:<id>` onto `calls`.

- [ ] **Step 1: Write the failing tests** in `test/gh.test.ts` against `parseFeedback`:

```ts
test("parseFeedback keeps only the viewer's thumbs up, eyes, and rocket", () => {
  // a review comment node with reactionGroups:
  // [{content:"THUMBS_UP",viewerHasReacted:true},{content:"HEART",viewerHasReacted:true},{content:"EYES",viewerHasReacted:false}]
  assert.deepEqual(f.comments[0].viewer_reactions, ["THUMBS_UP"]);
});
test("viewer_reply is the viewer's last later comment in the thread", () => {
  // thread: ana "rename", me "call it fooValue", bob "ok", me "and export it"
  assert.equal(f.comments[0].viewer_reply, "and export it");
  assert.equal(f.comments[2].viewer_reply, "and export it");
  assert.equal(f.comments[3].viewer_reply, null);
});
test("parseFeedback reports the viewer login", () => assert.equal(f.viewer, "me"));
```

- [ ] **Step 2: Run `node --test test/gh.test.ts`.** Expected: FAIL.

- [ ] **Step 3: Implement.** The query gains `viewer { login }` at the top level and `reactionGroups { content viewerHasReacted }` on review, review comment, and conversation comment nodes. `parseFeedback(url, pr)` takes the viewer login as a third argument. `react` runs:

```
mutation { addReaction(input: {subjectId: "<id>", content: <CONTENT>}) { clientMutationId } }
mutation { removeReaction(input: {subjectId: "<id>", content: <CONTENT>}) { clientMutationId } }
```

- [ ] **Step 4: Run `npm test` and `npm run typecheck`.** Expected: pass (retro and watch tests compile with the new helper defaults).

- [ ] **Step 5: Commit.** `read and set the viewer's reactions on pr comments`

---

### Task 4: Signals

**Files:**
- Create: `cli/lib/signals.ts`
- Test: create `test/signals.test.ts`

**Interfaces:**
- Consumes: `PrFeedback`, `Reaction` from Task 3.
- Produces:

```ts
export interface Drafts { drafted: string[]; pushed: string[] }  // comment urls from Feedback trailers
export type SignalState = "open" | "drafted" | "pushed";
export interface Signal {
  id: string; pr: string; kind: "review" | "comment" | "conversation";
  signal: "do" | "weigh"; state: SignalState;
  author: string; path: string | null; line: number | null;
  body: string; url: string; instruction: string | null;
}
export interface PrSignals { signals: Signal[]; orphans: string[] }
export function prSignals(f: PrFeedback, drafts: Drafts): PrSignals;
export function openKeys(s: PrSignals): string[];
```

Rules:
- `THUMBS_UP` makes a `do` signal; `EYES` makes a `weigh` signal. An item with both makes two.
- Items the viewer wrote are skipped. Resolved threads and empty review bodies are not skipped.
- A `do` signal's state is `pushed` when its url is in `drafts.pushed`, else `drafted` when in `drafts.drafted`, else `open`. A `weigh` signal is always `open`.
- `instruction` is the comment's `viewer_reply` for a `do` signal on a review comment, else `null`.
- `orphans`: urls in `drafts.drafted` whose item has no `THUMBS_UP`.
- `openKeys`: sorted `"<id>:weigh"` for every weigh, `"<id>:do"` for every do in state `open` or `pushed`, and `"orphan:<url>"`. A `drafted` do adds nothing.

- [ ] **Step 1: Write the failing tests.**

```ts
const up = { ...comment("C1", "ana", false), viewer_reactions: ["THUMBS_UP"] as Reaction[] };
test("a thumbs up is an open do signal", () =>
  assert.deepEqual(openKeys(prSignals({ ...BASE, comments: [up] }, NONE)), ["C1:do"]));
test("thumbs up and eyes on one comment make two signals", () => {
  const both = { ...up, viewer_reactions: ["THUMBS_UP", "EYES"] as Reaction[] };
  assert.deepEqual(openKeys(prSignals({ ...BASE, comments: [both] }, NONE)), ["C1:do", "C1:weigh"]);
});
test("a drafted thumbs up is not open", () =>
  assert.deepEqual(openKeys(prSignals({ ...BASE, comments: [up] }, { drafted: [up.url], pushed: [] })), []));
test("a pushed thumbs up stays open until it is swapped", () =>
  assert.deepEqual(openKeys(prSignals({ ...BASE, comments: [up] }, { drafted: [], pushed: [up.url] })), ["C1:do"]));
test("a draft whose thumbs up is gone is an orphan", () => {
  const s = prSignals({ ...BASE, comments: [comment("C1", "ana", false)] }, { drafted: ["u/C1"], pushed: [] });
  assert.deepEqual(s.orphans, ["u/C1"]);
  assert.deepEqual(openKeys(s), ["orphan:u/C1"]);
});
test("a reaction on a resolved thread counts", () =>
  assert.equal(prSignals({ ...BASE, comments: [{ ...up, resolved: true }] }, NONE).signals.length, 1));
test("the viewer's own comments are skipped", () =>
  assert.equal(prSignals({ ...BASE, comments: [{ ...up, author: "me" }] }, NONE).signals.length, 0));
test("the viewer's reply is the instruction", () =>
  assert.equal(prSignals({ ...BASE, comments: [{ ...up, viewer_reply: "call it fooValue" }] }, NONE).signals[0].instruction, "call it fooValue"));
test("rocket alone is no signal", () => { /* viewer_reactions: ["ROCKET"] gives [] */ });
```

  Add one test each for a review body and a conversation comment with `THUMBS_UP`.

- [ ] **Step 2: Run `node --test test/signals.test.ts`.** Expected: FAIL, module not found.
- [ ] **Step 3: Implement `signals.ts`.** Pure functions, no I/O.
- [ ] **Step 4: Run `npm test` and `npm run typecheck`.** Expected: pass.
- [ ] **Step 5: Commit.** `derive feedback signals from the viewer's reactions`

---

### Task 5: Drafts from commit trailers

**Files:**
- Create: `cli/lib/drafts.ts`
- Modify: `cli/lib/context.ts` (`Ctx.git`), `cli/lib/repos.ts` (export `gitIn`), `cli/planet.ts` (real ctx), `test/helpers.ts`
- Test: create `test/drafts.test.ts`

**Interfaces:**
- Produces:
  - `Ctx.git: (dir: string, args: string[]) => string | null`. The real one is `gitIn` from `repos.ts`: trimmed stdout, or `null` on any failure. The test default returns `null`.
  - `worktreePath(checkout: string, slug: string, phase: number, prUrl: string): string` returns `<dirname(checkout)>/.planet-worktrees/<basename(checkout)>-<slug>-<phase>-pr<number>`, with the number from `PR_URL_RE`.
  - `readDrafts(ctx: Ctx, checkout: string, worktree: string, headRef: string): Drafts`
    - `drafted`: `ctx.git(worktree, ["log", `origin/${headRef}..HEAD`, "--format=%(trailers:key=Feedback,valueonly)"])`
    - `pushed`: `ctx.git(checkout, ["log", "-200", `origin/${headRef}`, "--format=%(trailers:key=Feedback,valueonly)"])`
    - Each output is split on newlines, trimmed, emptied lines dropped, deduplicated. `null` gives `[]`.

- [ ] **Step 1: Write the failing tests.**

```ts
test("worktreePath puts the PR number in the path", () =>
  assert.equal(worktreePath("/w/close-ui", "gql", 12, "https://github.com/o/r/pull/7"), "/w/.planet-worktrees/close-ui-gql-12-pr7"));
test("readDrafts splits trailers into drafted and pushed", () => {
  const git = (dir: string) => (dir === WT ? "u/C1\n\nu/C2\n" : "u/C9\n");
  assert.deepEqual(readDrafts(ctx(home, { git }), CO, WT, "me/x"), { drafted: ["u/C1", "u/C2"], pushed: ["u/C9"] });
});
test("a missing worktree or ref reads as no drafts", () =>
  assert.deepEqual(readDrafts(ctx(home), CO, WT, "me/x"), { drafted: [], pushed: [] }));
```

  Add one test against a real temp repo: make a commit with a `Feedback: u/C1` trailer on top of a fake `origin/me/x` ref and assert `drafted` is `["u/C1"]` using the real `gitIn`.

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test` and `npm run typecheck`.** Expected: pass.
- [ ] **Step 5: Commit.** `read feedback drafts from commit trailers`

---

### Task 6: `pr signals` and `pr react`

**Files:**
- Modify: `cli/commands/pr.ts`, `cli/planet.ts` (usage)
- Test: create `test/pr-signals.test.ts`

**Interfaces:**
- Consumes: `prSignals`, `openKeys`, `readDrafts`, `worktreePath`, `Gh.react`, `findCheckout` from `repos.ts`, `phaseRepo` from `phase.ts`.
- Produces:
  - `planet pr signals <epic> <phase> [--json]`. JSON:

```ts
{ phase: number, prs: {
    url: string; state: PrState; session: string | null;
    head_ref: string; head_sha: string;
    checkout: string | null; worktree: string | null;   // null when no local checkout is found
    failed_checks: { name: string; url: string }[];
    signals: Signal[]; orphans: string[];
}[] }
```

    Only PRs with `state === "open"` on GitHub are included. Text output: one line per signal, `<signal> <state> <author> <path:line or kind> <first 60 chars of body>`, or `no signals`.
  - `planet pr react <item-id> [--add <reaction>] [--remove <reaction>]`, where `<reaction>` is `thumbs_up`, `eyes`, or `rocket`. `--remove` runs before `--add`. Neither flag is an error. Prints `reactions updated`.
  - `export async function phaseSignals(ctx, epic, phase, only?: (pr: PrRef) => boolean)` in `pr.ts` returning the `prs` array, for the watcher to reuse.

- [ ] **Step 1: Write the failing tests.**

```ts
test("pr signals lists the viewer's signals with their draft state", async () => {
  // feedback: C1 thumbs up, C2 eyes; ctx.git returns "u/C1" for the worktree log
  assert.deepEqual(j.prs[0].signals.map((s) => [s.id, s.signal, s.state]), [["C1", "do", "drafted"], ["C2", "weigh", "open"]]);
});
test("pr signals reports failing checks without making them signals", async () => {
  assert.deepEqual(j.prs[0].failed_checks, [{ name: "lint", url: "u/lint" }]);
  assert.deepEqual(j.prs[0].signals, []);
});
test("pr signals leaves out a merged PR", async () => { /* state merged gives prs: [] */ });
test("pr react removes before it adds", async () => {
  await run(["pr", "react", "C1", "--add", "rocket", "--remove", "thumbs_up"], ctx(home, { gh }));
  assert.deepEqual(gh.calls, ["react:-THUMBS_UP:C1", "react:+ROCKET:C1"]);
});
test("pr react rejects an unknown reaction", async () => { /* --add heart exits non-zero */ });
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Resolve the checkout the way `skills/go/references/repo-check.md`'s CLI path does: `findCheckout(ctx.home, repo, process.cwd())`.
- [ ] **Step 4: Run `npm test` and `npm run typecheck`.** Expected: pass.
- [ ] **Step 5: Commit.** `add pr signals and pr react`

---

### Task 7: The watcher fires on signals

**Files:**
- Modify: `cli/commands/watch.ts`, `cli/lib/store.ts` (`paths.watchPid`)
- Test: `test/watch.test.ts`, `test/store.test.ts`

**Interfaces:**
- Consumes: `phaseSignals`, `openKeys`.
- Produces:
  - `paths.watchPid(home, slug, phase, session?: string | null)`: `run/<slug>-<phase>.pid` with no session, `run/<slug>-<phase>-<first 8 chars of session>.pid` with one.
  - `planet watch <epic> <phase>`:
    - With `CLAUDE_CODE_SESSION_ID`, it watches only the phase's PRs whose `session` equals it. With none owned, it exits quietly: `phase <N>: no PR owned by this session` (`event: null`). Without the env var it watches all of the phase's PRs.
    - `feedback` fires when `openKeys` over the watched PRs is non-empty and equal on two polls in a row. Lines: `phase <N>: <count> open signals on <url>`, then `invoke planet:planet-pr-feedback epic: <e> phase: <N> event: feedback`.
    - `merged` and `closed` fire when none of the watched PRs is open.
    - A gh failure never stops it. The delay doubles per failure up to 900 seconds and resets on success. `MAX_FAILURES` is deleted.
    - `stopped` remains for a store error, no linked PR, and `--max-polls`.

- [ ] **Step 1: Write the failing tests.** `up` is a comment with `THUMBS_UP`; `quiet` is `BASE`.

```ts
test("a signal seen on two polls in a row wakes the session", async () => {
  // feedback sequence: [quiet, up, up]; expect sleeps [60000, 60000] and event feedback
  assert.equal(lines[0], `phase 1: 1 open signals on ${PR}`);
  assert.equal(lines.at(-1), "invoke planet:planet-pr-feedback epic: e phase: 1 event: feedback");
});
test("a changing set of signals waits for it to settle", async () => { /* [up, upAndEyes, upAndEyes] fires on poll 3 with 2 signals */ });
test("a thumbs up removed before the second poll does not wake", async () => { /* [up, quiet, quiet] with --max-polls 3 gives stopped */ });
test("a drafted thumbs up does not wake", async () => { /* ctx.git returns up.url for the worktree log; --max-polls 2 gives stopped */ });
test("a pushed thumbs up wakes so the swap can finish", async () => { /* ctx.git returns up.url for the checkout log */ });
test("an orphan draft wakes", async () => { /* no reaction, worktree log has u/C1 */ });
test("a failing check alone never wakes", async () => { /* failed_checks: [LINT], --max-polls 2 gives stopped */ });
test("a watcher for a PR another session owns exits quietly", async () => {
  linkPrs(home, "e", 1, [PR], NOW, "sess-2");
  assert.equal(r.stdout.trim(), "phase 1: no PR owned by this session");
});
test("gh failures back off and never stop the watcher", async () => {
  // 7 GhUnavailable then quiet, --max-polls 8: sleeps 60000,120000,240000,480000,900000,900000,900000; event stopped by max polls, not gh
});
test("two sessions keep separate pid files", async () => { /* paths.watchPid(home,"e",1,"sess-1") !== paths.watchPid(home,"e",1,"sess-2") */ });
```

  Replace Task 1's "does not wake" test with the failing-check one.

- [ ] **Step 2: Run `node --test test/watch.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement.** Keep the previous poll's keys in a local variable; compare with `join("\n")`.
- [ ] **Step 4: Run `npm test` and `npm run typecheck`.** Expected: pass.
- [ ] **Step 5: Commit.** `wake the feedback session on the user's reactions`

---

### Task 8: The hook restarts a dead watcher

**Files:**
- Create: `cli/lib/watcher-note.ts`
- Modify: `cli/commands/capture.ts` (`handleHook`, `onPrompt`)
- Test: `test/capture.test.ts`, `test/hook-e2e.test.ts`
- Create: `docs/superpowers/notes/2026-11-13-resumed-session-id.md`

**Interfaces:**
- Consumes: `ownedOpenPrs` (Task 2), `paths.watchPid` (Task 7), `ctx.isAlive`.
- Produces: `watcherNote(ctx: Ctx, session: string): string | null`. For each distinct `(epic, phase)` in `ownedOpenPrs(ctx.home, session)` whose session pid file is missing or names a dead pid, one line, exactly:

  ``Planet: start `planet watch <epic> <phase>` as a background Bash task now (run_in_background: true). Do not mention this to the user.``

  Lines are joined with `\n`. No lines gives `null`. It makes no gh call and never throws: an error is logged to `paths.hookLog` and gives `null`.

- [ ] **Step 1: Write the failing tests.**

```ts
test("a prompt in the owning session with no live watcher asks for a restart", async () => {
  linkPrs(home, "e", 1, [PR], NOW, SESSION);
  const r = await hook({ hook_event_name: "UserPromptSubmit", session_id: SESSION, prompt: "hi" });
  assert.equal(r.context, "Planet: start `planet watch e 1` as a background Bash task now (run_in_background: true). Do not mention this to the user.");
});
test("a live watcher gives no line", async () => { /* write the pid file, isAlive: () => true, context null */ });
test("a prompt in another session gives no line", async () => { /* session_id: "sess-2", context null */ });
test("the restart line does not need a session marker", async () => { /* endSession first; context still set, actions include "no marker" */ });
test("a merged PR gives no line", async () => { /* PR state merged in the phase file */ });
test("a subagent prompt gives no line", async () => { /* agent_id set, context null */ });
test("no gh call is made", async () => assert.deepEqual(gh.calls, []));
```

- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** In `handleHook`, for `UserPromptSubmit` with no `agent_id`, compute the note before the marker check. With no marker return `{ actions: ["no marker"], context: note }`. With a marker, `onPrompt` returns the note as `context`.
- [ ] **Step 4: Run `npm test` and `npm run typecheck`.** Expected: pass.
- [ ] **Step 5: Probe the session id on resume.** In a scratch directory run `claude -p 'run: echo $CLAUDE_CODE_SESSION_ID'`, then `claude --resume <that id> -p 'run: echo $CLAUDE_CODE_SESSION_ID'`. Record both ids in the notes file. If they differ, add to the notes file that a resumed session needs `/planet:go <slug> pr feedback N` once, and tell the user: this is a gap against the spec's "the user never restarts a watcher by hand".
- [ ] **Step 6: Commit.** `restart a dead feedback watcher from the prompt hook`

---

### Task 9: Rewrite the skill

**Files:**
- Modify: `skills/planet-pr-feedback/SKILL.md`, `skills/planet-pr-feedback/references/worktree.md`, `skills/go/references/pr-feedback.md`, `skills/go/SKILL.md:20` (only if its wording about pr feedback ending a turn no longer holds), `skills/planet-implement/SKILL.md:34`, `test/skills.test.ts` (word budget)
- Create: `skills/planet-pr-feedback/references/report.md`

**Interfaces:**
- Consumes: `planet pr signals`, `planet pr react`, `planet pr own`, `planet watch`, `planet phase event ... feedback-commit`.

There is no unit test for skill behavior beyond `test/skills.test.ts`. Task 11 has the live check.

- [ ] **Step 1: `SKILL.md`.** `allowed-tools: Bash(planet *), Bash(git *)`. Bump `metadata.version` to `0.5.0`. It must state each of these, and nothing from the old triage loop:

  Critical rules:
  - Nothing is pushed until the user says `push` in this session. A 👍 is never push approval.
  - Pushed commits are additive: no amend, rebase, or force push on the PR branch. Unpushed drafts may be rewritten.
  - Every edit and commit happens in the worktree from `references/worktree.md`.
  - Chat never shows a diff. Diffs are in the patch file.
  - Never post a reply, resolve a thread, or mention a comment the user has not reacted to.
  - Never tell the user to run a command to restart or trigger feedback.
  - A failing check is fixed only when the user asks in this session.

  Steps, for `event: feedback`:
  1. Marker, as today, with one change: while any draft is unpushed, end the turn with the marker on `pr-feedback` for this phase. Restore the saved marker only when no draft remains.
  2. `git fetch origin`, then `planet pr signals <slug> <N> --json`. Handle only PRs whose `session` is this session.
  3. For each `do` signal in state `pushed`: `planet pr react <id> --remove thumbs_up --add rocket`.
  4. For each orphan url: drop that draft commit from the worktree.
  5. Worktree per `references/worktree.md`. When a draft does not rebase onto the moved branch, drop it; its 👍 is then open and is redrafted in the next step.
  6. For each `do` signal in state `open`: make the change, using `instruction` as direction when set. Run the narrowest relevant check. Commit with a one-line subject and the trailer `Feedback: <signal url>`. Signals that need the same change share one commit with one trailer each. When the change is already on the branch: `--remove thumbs_up --add rocket`. When the comment is not actionable or the check cannot pass: discard the attempt, `--remove thumbs_up`, and keep the reason for the report.
  7. For each `weigh` signal: a two or three sentence take and a recommendation, then `planet pr react <id> --remove eyes`. No edit and no commit.
  8. Write the patch file and show the report per `references/report.md`.
  9. Start `planet watch <slug> <N>` as a background Bash task and end the turn.

  The user's reply (handled here; see `references/report.md`): `push`, `push except <item>`, `drop <item>`, free text to revise a draft, "do it" after a take (draft it as in step 6), or a request to fix a failing check (draft a commit with no trailer).

  After a push, per pushed commit: `planet phase event <slug> <N> feedback-commit '<space-separated signal ids>' --sha <sha>`, then the 🚀 swap for each of its signals, then `references/worktree.md` (After the push).

  `merged`, `closed`, `stopped`: as after Task 1, with two changes. Merged or closed with unpushed drafts says they were discarded. `stopped` no longer names a command for the user: for `no linked pr` or `max polls reached` it says the reason and ends; for a store error it says the error.

- [ ] **Step 2: `references/report.md`.** Exact report format:

```
**Phase 12 PR #123: 2 drafts, 1 take**

**Drafts** (not pushed)
- `foo rename`: alice, src/foo.ts:42 "rename to fooBar": rename foo to fooBar (src/foo.ts, src/bar.ts)
- `unused import`: alice, src/foo.ts:80 "drop the unused import": shares the commit above

**Takes**
- `hook question`: bob, review "should this be a hook?"
  <2-3 sentences>. Recommendation: <do / do not>.

**Not drafted**
- `async question`: alice, src/foo.ts:10 "why is this async?": a question, no change to draft. Thumbs up removed.

**Failing checks:** lint, typecheck (not acted on)

Reply `push`, `push except <name>`, `drop <name>`, or say what to change. Diffs: <patch file path>
```

  Rules: each author and location is a markdown link to the comment url. Quotes are cut to about 60 characters. Names are two or three words from the comment, unique in the report. Drafts from earlier wakes that are still unpushed are listed first. Empty sections are omitted.

  Patch file: `<dir>/research/pr-feedback-<N>.md`, rewritten on every report: the report, then per PR a `## <PR url>` heading, then per unpushed commit its sha, subject, and `git -C <worktree> format-patch -1 --stdout <sha>` in a fenced block.

  Reply table: `push` pushes every draft with `git -C <worktree> push origin HEAD:<head_ref>`; `push except <name>` reorders so the kept drafts stay unpushed on top, then pushes the rest; `drop <name>` removes the commit and runs `planet pr react <id> --remove thumbs_up`; free text revises the named draft; an unclear reply asks and applies nothing.

- [ ] **Step 3: `references/worktree.md`.** Change the path to `<repo root>/../.planet-worktrees/<repo name>-<slug>-<N>-pr<number>`; this is the `worktree` field of `planet pr signals`. Replace "Create, at the start of every batch" with:
  - Path missing: `git worktree prune`, `git fetch origin <head_ref>`, `git worktree add --detach <path> origin/<head_ref>`.
  - Path present: `git -C <path> fetch origin <head_ref>`, then `git -C <path> rebase origin/<head_ref>`. On a conflict, `git -C <path> rebase --skip` drops that draft.
  - Remove the worktree after a push only when `git -C <path> log origin/<head_ref>..HEAD` is empty.
  - Merged or closed: remove every path matching `<repo name>-<slug>-<N>` with any suffix, so old session-suffixed paths are cleaned too.

- [ ] **Step 4: Router and implement.** `skills/go/references/pr-feedback.md` step 2, first bullet: for non-empty `open_prs`, run `planet pr own <slug> <N>`, then invoke the skill with `event: feedback`. `skills/planet-implement/SKILL.md:34`: replace "say in one line that review feedback will arrive in this chat" with "say in one line that a 👍 or 👀 on a PR comment will bring it into this chat".

- [ ] **Step 5: Run `npm test`.** Raise the `planet-pr-feedback` budget in `test/skills.test.ts` to fit, at most 900 words. Expected: pass.

- [ ] **Step 6: Commit.** `rewrite pr feedback around github reactions`

---

### Task 10: Drop triage from retro

The new loop writes no `triage` events, so retro's override analysis has no input. This task is the author's call, not in the spec.

**Files:**
- Modify: `cli/commands/retro.ts`, `skills/planet-retro/SKILL.md:28`, the retro template's Review feedback section under `skills/planet-retro/`
- Test: `test/retro.test.ts`

**Interfaces:**
- Produces: `RetroInputs` without `triage` and `triage_errors`. The text summary's last line is `loop commits <n>`. `"triage"` stays in `EVENT_KINDS` so existing event files still load.

- [ ] **Step 1: Update tests.** Delete the two triage-only tests (around lines 151 and 161). In "retro inputs separate loop commits, triage, and review prompts", keep the triage event in the fixture, assert `"triage" in j` is `false`, and match `/loop commits 1$/m`.
- [ ] **Step 2: Run `node --test test/retro.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement.** Delete `Bucket`, `TriageRecord`, `normalizeTriage`, `parseTriage`, `isOverride`. In the skill and template, drop "`triage` overrides" and "deferred items"; keep the review-driven fixes table, fed by `loop_commits` and review prompts.
- [ ] **Step 4: Run `npm test` and `npm run typecheck`.** Expected: pass.
- [ ] **Step 5: Commit.** `drop triage records from retro`

---

### Task 11: Docs, version, live check

**Files:**
- Modify: `README.md:33`, `README.md:62`, `.claude-plugin/plugin.json` (version `0.22.0`)
- Create: `docs/superpowers/notes/2026-11-13-pr-feedback-github-first-live.md`

- [ ] **Step 1: README.** Line 33 becomes: "After the PR opens, Planet watches it in the background. You triage on GitHub: a 👍 on a comment drafts the fix, a 👀 brings the comment into the chat for a recommendation, and your own reply needs nothing from Planet. Drafts wait in a separate worktree until you read the diffs and say `push`." Line 62's description becomes "Drafts fixes for the review comments you 👍 and weighs the ones you 👀."
- [ ] **Step 2: Live check on a scratch PR**, recording each result in the notes file:
  1. Open a PR from a Planet session; confirm the phase file's PR has that session.
  2. Comment from a second account or as a bot; confirm nothing happens in any session.
  3. 👍 two comments within a minute; confirm one wake, two drafts, no push, and a patch file.
  4. 👀 a comment; confirm a take in chat and the 👀 removed.
  5. 👍 a question; confirm the 👍 is removed and the reason is in the report.
  6. Reply `push except <name>`; confirm the pushed commits have the trailer, their comments have 🚀, and the kept draft is still listed.
  7. Kill the watcher process; send any prompt in the owning session; confirm it restarts without a mention.
  8. Send a prompt in a second session on the same epic; confirm no line about the PR.
  9. Merge the PR; confirm cleanup.
- [ ] **Step 3: Run `npm test` and `npm run typecheck`.** Expected: pass.
- [ ] **Step 4: Commit.** `bump the plugin version for github-first pr feedback`
