# Planet PR Feedback Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The session that opened a phase's PR is woken by new review feedback, CI failures, and merges, gets each feedback batch pre-sorted with fixes drafted, applies it from one shorthand reply, and offers retro on merge.

**Architecture:** CLI first: `gh.prFeedback` gains ids, timestamps, conversation comments and the PR author; a new `pr-items` lib flattens feedback into items with notified/handled marks; `planet watch` polls until an event and prints a line naming the skill to invoke; the hook adds a one-line note on the next prompt; retro inputs split loop commits and triage overrides from own refinements. Skills second: a new hidden, model-invocable `planet-pr-feedback`, plus edits to `planet-implement` (start the watcher), the `go` router (`pr feedback [N]`), and `planet-retro`.

**Tech Stack:** TypeScript on Node 24 (`node --test`), `gh` GraphQL, Markdown skills under `skills/`, `test/skills.test.ts`.

**Spec:** docs/superpowers/specs/2026-11-04-planet-pr-feedback-loop-design.md

## Global Constraints

- Skill text never names the user. No em-dashes anywhere.
- Hidden step skills: `user-invocable: false`, no `disable-model-invocation`, description starts "Only invoked by", no `<>` in the description, frontmatter parses under the strict `yaml` package.
- Every `planet <verb>` in a skill body is a real command; every `references/<file>.md` named exists under that skill; references stay under 450 words.
- Word budgets in `test/skills.test.ts`: `go` 1250 to 1300, `planet-implement` 750 to 790, `planet-retro` 900 to 960, new `planet-pr-feedback` 950. Raised only by these amounts.
- Store writes only through the `planet` CLI. Step skills write files only under `<dir>/research/`. So the triage file is `<dir>/research/pr-feedback-<N>.md`, not `phases/<N>/feedback.md` as the spec says (phases are files, not directories). Task 10 amends the spec.
- `planet watch` never writes to the store.
- Inside the loop, PR commits are additive. No amend, no force push, no rebase.
- Nothing is pushed and no GitHub reply is posted until the user's shorthand names that item.
- Watcher last line, exact: `invoke planet:planet-pr-feedback epic: <slug> phase: <N> event: <feedback|merged|closed|stopped>`.
- `planet-pr-feedback` return lines, exact: `feedback shown for phase <N>`, `feedback applied for phase <N>`, `phase <N> merged`, `phase <N> closed`, `watcher stopped for phase <N>: <why>`.
- Worktree path: `<repo root>/../.planet-worktrees/<repo name>-<slug>-<N>`, detached at `origin/<head_ref>`. Never inside the repo's working tree.
- Commit messages: lowercase imperative, no prefix, no trailing period. Single line.
- Run `npm test && npm run typecheck && claude plugin validate .` before each commit.
- Skill tasks follow superpowers:writing-skills: baseline scenario without the change first, record the failure verbatim in the task's notes file, then write, then rerun.

## Review Focus

1. **Several PRs on one phase.** The watcher reports merged only when every linked PR is merged or closed and at least one merged; one merged PR next to an open one keeps polling. (Task 3)
2. **The user's own thread replies** ("done", "fixed in abc") must never wake the chat. Items authored by the PR author are dropped. (Task 2)
3. **CI failing again after a push.** Same head sha: no new wake. New head sha with the same check failing: new item, wakes. (Task 2)
4. **gh offline or rate limited during a long watch.** Back off, then exit with `event: stopped` after 5 consecutive failures, never crash or spin. (Task 3)
5. **Slow gh on a prompt.** The hook never blocks the prompt: 4 s timeout, 5-minute cache, silent on error, prompt still captured. (Task 6)

---

### Task 1: richer `prFeedback`

**Files:**
- Modify: `cli/lib/gh.ts` (types, `GraphqlFeedback`, `realGh().prFeedback`, `gh()` timeout param)
- Modify: `test/helpers.ts` (`fakeGh` `prFeedback` signature)
- Modify: `test/pr-feedback.test.ts:9-15`, `test/retro.test.ts:16` (fixtures gain the new fields)
- Test: `test/gh.test.ts`

**Interfaces:**
- Produces:
  - `PrReview { id: string; author: string; state: string; body: string; created_at: string; url: string }`
  - `PrComment { id: string; author: string; path: string; line: number | null; body: string; resolved: boolean; created_at: string; url: string }`
  - `PrConversationComment { id: string; author: string; body: string; created_at: string; url: string }`
  - `PrFeedback { url: string; state: PrState; author: string; head_ref: string; head_sha: string; reviews: PrReview[]; comments: PrComment[]; conversation: PrConversationComment[]; failed_checks: PrCheck[] }`
  - `export interface GraphqlFeedback` and `export function parseFeedback(url: string, pr: GraphqlFeedback): PrFeedback`
  - `Gh.prFeedback(url: string, opts?: { timeoutMs?: number }): Promise<PrFeedback>`

- [ ] **Step 1: Write the failing test** in `test/gh.test.ts`

```ts
test("parseFeedback maps ids, timestamps, conversation comments, state, and the pr author", () => {
  const f = parseFeedback("https://github.com/o/r/pull/7", {
    state: "OPEN", author: { login: "me" }, headRefName: "me/x", headRefOid: "sha1",
    reviews: { nodes: [{ id: "R1", url: "u/r1", createdAt: "2026-11-01T00:00:00Z", author: { login: "ana" }, state: "COMMENTED", body: "hm" }] },
    reviewThreads: { nodes: [{ isResolved: false, comments: { nodes: [{ id: "C1", url: "u/c1", createdAt: "2026-11-01T00:01:00Z", author: null, path: "a.ts", line: 3, body: "x" }] } }] },
    comments: { nodes: [{ id: "I1", url: "u/i1", createdAt: "2026-11-01T00:02:00Z", author: { login: "bob" }, body: "top" }] },
    commits: { nodes: [] },
  });
  assert.equal(f.state, "open");
  assert.equal(f.author, "me");
  assert.equal(f.head_ref, "me/x");
  assert.deepEqual(f.reviews[0], { id: "R1", author: "ana", state: "COMMENTED", body: "hm", created_at: "2026-11-01T00:00:00Z", url: "u/r1" });
  assert.equal(f.comments[0].id, "C1");
  assert.equal(f.comments[0].author, "unknown");
  assert.deepEqual(f.conversation, [{ id: "I1", author: "bob", body: "top", created_at: "2026-11-01T00:02:00Z", url: "u/i1" }]);
  assert.deepEqual(f.failed_checks, []);
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `node --test test/gh.test.ts`
Expected: FAIL, `parseFeedback` is not exported.

- [ ] **Step 3: Implement**

Move the mapping in `realGh().prFeedback` into `parseFeedback`. Add to the GraphQL query: `state author { login } headRefName`; `id url createdAt` on review and thread-comment nodes; `comments(last: 100) { nodes { id url createdAt author { login } body } }`. `gh(args, timeoutMs = 10_000)` passes the timeout to `execFileAsync`. Update `fakeGh` and both fixtures (`state: "open"`, `author: "me"`, `head_ref: "me/x"`, `conversation: []`, ids and timestamps on any review or comment).

- [ ] **Step 4: Run the suite**

Run: `npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add cli/lib/gh.ts test/
git commit -m "fetch ids, timestamps, conversation comments, and the pr author in pr feedback"
```

---

### Task 2: feedback items and marks

**Files:**
- Create: `cli/lib/pr-items.ts`
- Modify: `cli/lib/store.ts` (`paths.marks`)
- Modify: `cli/commands/pr.ts` (`--new`, `mark`)
- Modify: `cli/planet.ts` (USAGE line)
- Test: `test/pr-items.test.ts`

**Interfaces:**
- Consumes: `PrFeedback` (Task 1).
- Produces:
  - `type ItemKind = "review" | "comment" | "conversation" | "check"`
  - `interface FeedbackItem { id: string; kind: ItemKind; pr: string; author: string; path: string | null; line: number | null; body: string; url: string; created_at: string | null }`
  - `feedbackItems(f: PrFeedback): FeedbackItem[]`: drops items whose author is `f.author`, reviews whose body is blank after trim, and comments in resolved threads. Check items: `id` `check:<name>@<head_sha>`, `author` `"ci"`, `body` the check state, `url` the check url, `path`/`line`/`created_at` null.
  - `interface Marks { notified: string[]; handled: string[]; checked_at: string | null; pending: number }`
  - `readMarks(home: string, epic: string, phase: number): Marks` (defaults when no file)
  - `addMarks(home: string, epic: string, phase: number, mark: "notified" | "handled", ids: string[]): Marks`: `handled` also adds to `notified`; no duplicates; sets `checked_at` to null so the hook rechecks.
  - `recordCheck(home: string, epic: string, phase: number, pending: number, now: string): void`
  - `paths.marks(home, epic, phase)` = `epics/<epic>/feedback/phase-<NN>-marks.json`
  - `planet pr feedback <epic> <phase> --new [--json]` returns `{ phase, prs: { url, state, head_ref, head_sha }[], items: (FeedbackItem & { notified: boolean })[] }`, unhandled items only. Text: one line per item, `<id> new|shown <author> <path:line or kind> <body, first 80 chars>`.
  - `planet pr feedback mark <epic> <phase> notified|handled <id>...`, committing `<epic>: mark <k> feedback items <mark>`.

- [ ] **Step 1: Write the failing tests** in `test/pr-items.test.ts`

```ts
test("feedbackItems drops the pr author, blank reviews, and resolved threads", () => {
  const items = feedbackItems({ ...BASE, author: "me",
    reviews: [review("R1", "ana", "please rename"), review("R2", "bob", "  "), review("R3", "me", "done")],
    comments: [comment("C1", "ana", false), comment("C2", "ana", true), comment("C3", "me", false)],
    conversation: [convo("I1", "me"), convo("I2", "bob")],
    failed_checks: [{ name: "lint", state: "FAILURE", url: "u/lint" }] });
  assert.deepEqual(items.map((i) => i.id), ["R1", "C1", "I2", "check:lint@sha1"]);
});

test("a check keeps its id on the same head sha and gets a new one on a new sha", () => {
  const a = feedbackItems({ ...BASE, failed_checks: [LINT] }).map((i) => i.id);
  const b = feedbackItems({ ...BASE, head_sha: "sha2", failed_checks: [LINT] }).map((i) => i.id);
  assert.deepEqual(a, ["check:lint@sha1"]);
  assert.deepEqual(b, ["check:lint@sha2"]);
});

test("handled implies notified and clears the hook cache", () => {
  recordCheck(home, "e", 1, 3, NOW);
  const m = addMarks(home, "e", 1, "handled", ["C1", "C1"]);
  assert.deepEqual(m, { notified: ["C1"], handled: ["C1"], checked_at: null, pending: 3 });
});

test("pr feedback --new hides handled items and flags notified ones", async () => {
  // phase 1 linked to PR with items R1, C1, I2; R1 handled, C1 notified
  const r = await run(["pr", "feedback", "e", "1", "--new", "--json"], ctx(home, { gh }));
  assert.deepEqual((r.json as { items: { id: string; notified: boolean }[] }).items.map((i) => [i.id, i.notified]), [["C1", true], ["I2", false]]);
});

test("pr feedback mark commits the store", async () => {
  await run(["pr", "feedback", "mark", "e", "1", "notified", "I2"], ctx(home));
  assert.match(git(home, ["log", "-1", "--format=%s"]), /e: mark 1 feedback items notified/);
});
```

`BASE`, `review`, `comment`, `convo`, `LINT` are small fixture builders at the top of the file; `BASE.author` is `"me"`, `BASE.head_sha` is `"sha1"`.

- [ ] **Step 2: Run, expect failure**

Run: `node --test test/pr-items.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `cli/lib/pr-items.ts`, `paths.marks`, and the two `pr feedback` forms. `pr feedback mark` is detected by `rest[0] === "mark"` inside `prFeedback`. Update the `prCommand` usage error and the USAGE line to `pr files|feedback <epic> <phase> [--new] | pr feedback mark <epic> <phase> notified|handled <id>...`.

- [ ] **Step 4: Run the suite**

Run: `npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add cli/ test/pr-items.test.ts
git commit -m "add feedback items with notified and handled marks"
```

---

### Task 3: `planet watch`

**Files:**
- Create: `cli/commands/watch.ts`
- Modify: `cli/lib/context.ts` (`sleep` on `Ctx`), `cli/planet.ts` (register, USAGE, `defaultCtx` sleep), `test/helpers.ts` (`ctx` default `sleep: async () => {}`; `fakeGh` feedback values may be `PrFeedback | (PrFeedback | Error)[]`, an array returning successive entries, throwing an `Error` entry, and sticking on the last; the gh-unavailable test uses `fakeGh({}, {}, true)`)
- Test: `test/watch.test.ts`

**Interfaces:**
- Consumes: `feedbackItems`, `readMarks` (Task 2).
- Produces:
  - `Ctx.sleep(ms: number): Promise<void>`
  - `planet watch <epic> <phase> [--interval <s>] [--max-polls <n>]`. Defaults: interval 60, max-polls 0 (unlimited). Each poll calls `prFeedback` for every linked PR. Exits 0 after printing summary lines and the exact last line from Global Constraints.
  - Event rules, checked in this order each poll:
    - No linked PR: `stopped`, line `phase <N>: no linked pr`.
    - Every PR merged or closed, at least one merged: `merged`. Every PR closed: `closed`.
    - Any item not in `notified`: `feedback`, one line per PR with new items, `phase <N>: <k> new feedback items on <url>`.
    - `GhUnavailable`: sleep `min(interval * 2^failures, 900) s`; on the 5th consecutive failure, `stopped` with line `phase <N>: gh unavailable (<message>)`.
    - `--max-polls` reached: `stopped`, line `phase <N>: max polls reached`.
  - Between polls: `ctx.sleep(interval * 1000)`.

- [ ] **Step 1: Write the failing tests** in `test/watch.test.ts`

```ts
test("watch exits on the first poll with an item not yet notified", async () => {
  const gh = fakeGh({}, {}, false, undefined, { [PR]: [quiet, withComment] });
  const sleeps: number[] = [];
  const r = await run(["watch", "e", "1"], ctx(home, { gh, sleep: async (ms) => { sleeps.push(ms); } }));
  assert.equal(r.code, 0);
  assert.deepEqual(sleeps, [60000]);
  const lines = r.stdout.trim().split("\n");
  assert.equal(lines[0], `phase 1: 1 new feedback items on ${PR}`);
  assert.equal(lines.at(-1), "invoke planet:planet-pr-feedback epic: e phase: 1 event: feedback");
});

test("notified items do not wake; max polls stops", async () => {
  addMarks(home, "e", 1, "notified", ["C1"]);
  const r = await run(["watch", "e", "1", "--max-polls", "2"], ctx(home, { gh: fakeGh({}, {}, false, undefined, { [PR]: withComment }) }));
  assert.match(r.stdout, /max polls reached\ninvoke planet:planet-pr-feedback epic: e phase: 1 event: stopped\n$/);
});

test("one merged pr next to an open one keeps polling; all merged reports merged", async () => {
  // phase linked to PR and PR2; PR2 open on poll 1, merged on poll 2
  assert.match(r.stdout, /event: merged\n$/);
  assert.equal(gh.calls.filter((c) => c === `prFeedback:${PR2}`).length, 2);
});

test("a closed pr without merge reports closed", async () => { /* single PR, state closed */ });

test("gh unavailable backs off and stops after five failures", async () => {
  assert.deepEqual(sleeps, [60000, 120000, 240000, 480000]);
  assert.match(r.stdout, /gh unavailable \(offline\)\ninvoke .* event: stopped\n$/);
});

test("watch writes nothing to the store", async () => {
  const before = git(home, ["rev-list", "--count", "HEAD"]);
  await run(["watch", "e", "1"], ctx(home, { gh }));
  assert.equal(git(home, ["rev-list", "--count", "HEAD"]), before);
});
```

Fill the elided arrange blocks with the same fixture builders as Task 2 (move them to `test/helpers.ts` if both files need them).

- [ ] **Step 2: Run, expect failure**

Run: `node --test test/watch.test.ts`
Expected: FAIL, unknown command `watch`.

- [ ] **Step 3: Implement** `cli/commands/watch.ts` and the `Ctx.sleep` plumbing (`defaultCtx`: `(ms) => new Promise((r) => setTimeout(r, ms))`).

- [ ] **Step 4: Run the suite**

Run: `npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add cli/ test/
git commit -m "add planet watch"
```

---

### Task 4: loop events, `pr-feedback` step, `session show`, review prompts

**Files:**
- Modify: `cli/lib/events.ts` (kinds), `cli/schema/types.ts` (`Step`), `cli/commands/session.ts` (`show`), `cli/commands/capture.ts` (`onPrompt` kind), `cli/planet.ts` (USAGE)
- Test: `test/events.test.ts`, `test/session.test.ts`, `test/capture.test.ts`

**Interfaces:**
- Produces:
  - `EventKind` adds `"feedback-commit"` (text: item ids, space-separated; sha required by the skill) and `"triage"` (text: JSON array of `TriageRecord`, Task 5).
  - `Step` and `STEPS` add `"pr-feedback"` after `"implement"`.
  - `planet session show [--json]`: json is the marker or `null`; text `<epic> phase <N|-> step <step|->` or `no active session`.
  - Prompt lines get `kind: "review"` when `marker.step === "pr-feedback"`.

- [ ] **Step 1: Write the failing tests**

```ts
// events.test.ts
test("phase event accepts feedback-commit with a sha", async () => {
  const r = await run(["phase", "event", "e", "1", "feedback-commit", "C1 I2", "--sha", "abc", "--json"], ctx(home));
  assert.equal((r.json as PlanetEvent).kind, "feedback-commit");
  assert.equal((r.json as PlanetEvent).sha, "abc");
});
// session.test.ts
test("session show returns the marker, or null", async () => {
  assert.equal((await run(["session", "show", "--json"], ctx(home))).json, null);
  startSession(home, SESSION, "e", { phase: 1, step: "pr-feedback" }, NOW);
  assert.deepEqual((await run(["session", "show", "--json"], ctx(home))).json, { epic: "e", phase: 1, step: "pr-feedback", started: NOW });
});
// capture.test.ts
test("a prompt during a pr-feedback step is captured as review", () => {
  setSessionStep(home, SESSION, "pr-feedback", 1);
  handleHook(prompt("do 1 3"), ctx(home));
  assert.equal(lastPrompt(home, "e").kind, "review");
});
```

- [ ] **Step 2: Run, expect failure**

Run: `node --test test/events.test.ts test/session.test.ts test/capture.test.ts`
Expected: FAIL on the three new tests.

- [ ] **Step 3: Implement** the kinds, step, `sessionShow`, and the `onPrompt` kind (`pr-feedback` → `"review"`, `implement` → `"implementation"`, else `"planning"`).

- [ ] **Step 4: Run the suite**

Run: `npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add cli/ test/
git commit -m "add the pr-feedback step, loop events, and session show"
```

---

### Task 5: retro inputs split loop work from own refinements

**Files:**
- Modify: `cli/commands/retro.ts` (`RetroInputs`, `retroInputs`, text summary), `cli/lib/retro.ts` (`RETRO_SKILLS`)
- Test: `test/retro.test.ts`

**Interfaces:**
- Consumes: event kinds and prompt `kind` (Task 4).
- Produces:
  - `type Bucket = "do" | "weigh" | "refute" | "defer"`
  - `interface TriageRecord { id: string; proposed: Bucket; final: Bucket | "skip"; edited: boolean; merged_into: string | null; defer_to: string | null }`
  - `RetroInputs` adds `loop_commits: { sha: string; items: string[] }[]` (from `feedback-commit` events, in order), `triage: TriageRecord[]` (all `triage` events' arrays concatenated; a malformed event is skipped and counted in `triage_errors: number`), and `prompts[].kind: "implementation" | "planning" | "review"` (missing in old lines reads as `"implementation"`).
  - Text summary gains `loop commits <n>, triage overrides <m>`; an override is `final !== proposed || edited || merged_into !== null`.
  - `RETRO_SKILLS` includes `"planet-pr-feedback"`.

- [ ] **Step 1: Write the failing tests**

```ts
test("retro inputs separate loop commits, triage, and review prompts", async () => {
  appendEvent(home, "e", { phase: 1, kind: "feedback-commit", text: "C1 I2", sha: "f1", session: SESSION }, NOW);
  appendEvent(home, "e", { phase: 1, kind: "triage", text: JSON.stringify([
    { id: "C1", proposed: "do", final: "do", edited: false, merged_into: null, defer_to: null },
    { id: "R1", proposed: "weigh", final: "do", edited: false, merged_into: null, defer_to: null },
  ]), session: SESSION }, NOW);
  const r = await run(["retro", "inputs", "e", "1", "--json"], ctx(home, { gh }));
  const j = r.json as RetroInputs;
  assert.deepEqual(j.loop_commits, [{ sha: "f1", items: ["C1", "I2"] }]);
  assert.equal(j.triage.length, 2);
  const text = await run(["retro", "inputs", "e", "1"], ctx(home, { gh }));
  assert.match(text.stdout, /loop commits 1, triage overrides 1/);
});

test("a malformed triage event is skipped and counted", async () => { /* text "not json" → triage [], triage_errors 1 */ });

test("lessons may target planet-pr-feedback", () => {
  assert.equal(parseLessons([{ text: "t", skill: "planet-pr-feedback", apply: true }])[0].skill, "planet-pr-feedback");
});
```

- [ ] **Step 2: Run, expect failure**

Run: `node --test test/retro.test.ts`
Expected: FAIL on the three new tests.

- [ ] **Step 3: Implement** in `retroInputs` and `RETRO_SKILLS`.

- [ ] **Step 4: Run the suite**

Run: `npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add cli/ test/retro.test.ts
git commit -m "split loop commits and triage overrides out of retro inputs"
```

---

### Task 6: hook note for feedback not yet shown

**Files:**
- Create: `cli/lib/pending-note.ts`
- Modify: `cli/commands/capture.ts` (`handleHook` becomes async and returns `{ actions: string[]; context: string | null }`; `captureCommand` sets `text` to `context ?? ""`), `bin/planet-hook` (stop discarding node's stdout)
- Test: `test/capture.test.ts`, `test/hook-e2e.test.ts`

**Interfaces:**
- Consumes: `feedbackItems`, `readMarks`, `recordCheck` (Task 2); `Gh.prFeedback` with `timeoutMs` (Task 1).
- Produces:
  - `pendingNote(ctx: Ctx, epic: string): Promise<string | null>`. For each phase with an open PR: if `marks.checked_at` is within 5 minutes of `ctx.now()`, use `marks.pending`; else call `prFeedback(url, { timeoutMs: 4000 })` per open PR, count items not in `notified`, and `recordCheck`. Any error: write one line to `hook.log`, skip that phase. Returns null when every count is 0.
  - Note text, one line per phase: `Planet: phase <N> PR has <k> new review items. Mention this in one line; handle them only when the user asks (/planet:go <slug> pr feedback <N>).`
  - Only `UserPromptSubmit` produces context; every other event's `context` is null.

- [ ] **Step 1: Write the failing tests**

```ts
test("a prompt gets a note when a phase has items not yet notified", async () => {
  const r = await handleHook(prompt("hi"), ctx(home, { gh }));
  assert.match(r.context ?? "", /^Planet: phase 1 PR has 2 new review items\./);
  assert.deepEqual(r.actions, ["prompt captured"]);
});
test("no note once every item is notified", async () => { /* addMarks notified for both → context null */ });
test("a fresh check is reused without calling gh", async () => {
  recordCheck(home, "e", 1, 2, NOW);
  const r = await handleHook(prompt("hi"), ctx(home, { gh }));
  assert.equal(gh.calls.filter((c) => c.startsWith("prFeedback")).length, 0);
  assert.match(r.context ?? "", /2 new review items/);
});
test("a gh failure gives no note and still captures the prompt", async () => {
  const r = await handleHook(prompt("hi"), ctx(home, { gh: fakeGh({}, {}, true) }));
  assert.equal(r.context, null);
  assert.match(readFileSync(paths.prompts(home, "e"), "utf8"), /hi/);
});
// hook-e2e.test.ts: phase 1 with an open linked PR, marks file with checked_at = new Date().toISOString(), pending 2
test("planet-hook prints the note on stdout", () => {
  const r = fire(home, { hook_event_name: "UserPromptSubmit", session_id: "sess-e2e", user_input: "hi" });
  assert.match(r.stdout, /^Planet: phase 1 PR has 2 new review items\./);
});
```

Existing tests that call `handleHook` synchronously become `await handleHook(...)` and read `.actions`. The existing e2e assertion `stdout === ""` stays for a session with no open PR.

- [ ] **Step 2: Run, expect failure**

Run: `node --test test/capture.test.ts test/hook-e2e.test.ts`
Expected: FAIL on the new tests.

- [ ] **Step 3: Implement** `pendingNote`, the async `handleHook`, and in `bin/planet-hook` replace `>/dev/null` with nothing so stdout passes through. Other events print nothing because `text` is empty.

- [ ] **Step 4: Run the suite**

Run: `npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add cli/ bin/planet-hook test/
git commit -m "note feedback not yet shown on the next prompt"
```

---

### Task 7: `planet-pr-feedback` skill

**Files:**
- Create: `skills/planet-pr-feedback/SKILL.md`, `skills/planet-pr-feedback/references/batch-format.md`, `skills/planet-pr-feedback/references/worktree.md`
- Create: `docs/superpowers/notes/2026-11-04-pr-feedback-skill-tests.md` (baseline and green results, verbatim)
- Modify: `test/skills.test.ts` (`REQUIRED_SKILLS`, `HIDDEN`, `WORD_BUDGET` 950)

**Interfaces:**
- Consumes: `planet pr feedback --new|mark`, `planet watch`, `planet session show|start|step`, `planet phase event feedback-commit|triage`, `planet sync`.
- Produces: input `epic: <slug>`, `phase: <N>`, `event: <feedback|merged|closed|stopped>`, `dir: <epic dir>` (from `planet epic show <slug> --json --brief` when the watcher line started it). Return lines from Global Constraints.

Frontmatter: `name: planet-pr-feedback`; description `"Only invoked by the Planet router or by a planet watch line naming it, never on its own, for a phase whose PR has new feedback, merged, or closed. Do not use outside a Planet session."`; `user-invocable: false`; `allowed-tools: Bash(planet *), Bash(git *), Bash(gh pr view *), Bash(gh pr comment *), Bash(gh api *)`; `compatibility`; `metadata.version: 0.1.0`.

Body must cover, in `## Critical rules`, `## Steps`, `## Troubleshooting`:
- **Marker.** Save `planet session show --json`. With no marker, `planet session start <slug> --phase <N> --step pr-feedback`; else `planet session step pr-feedback --phase <N>`. Before ending any turn, restore the saved step and phase with `planet session step` (a saved null step stays `pr-feedback`).
- **merged.** `planet sync <slug> --force`, cleanup per `references/worktree.md`, AskUserQuestion `Retro now` / `Retro later`. Now: `planet session step retro --phase <N>`, invoke `planet:planet-retro` with `epic`, `dir`, `phase`. Later: say the router shows retro pending. Return `phase <N> merged`.
- **closed.** Cleanup, say so, return `phase <N> closed`.
- **stopped.** Say the watcher's reason and that `/planet:go <slug> pr feedback <N>` restarts it. Return `watcher stopped for phase <N>: <why>`.
- **feedback.** `planet pr feedback <slug> <N> --new --json`. Triage each item into do, weigh, refute, defer (a CI failure is usually do). Create the worktree per `references/worktree.md`; draft one commit per do group there, unpushed; weigh gets an assessment only. Write `<dir>/research/pr-feedback-<N>.md` (summary plus `git format-patch` output per drafted commit). `planet pr feedback mark <slug> <N> notified <ids>`. Show the batch per `references/batch-format.md`. Restart the watcher: Bash with `run_in_background`, `planet watch <slug> <N>`. Restore the marker. Return `feedback shown for phase <N>`.
- **The shorthand reply.** Set the marker again. Apply per `references/batch-format.md`: draft newly moved do items; push with `git push origin HEAD:<head_ref>`; post replies (`gh api` thread reply for a review comment, `gh pr comment` for others; none for CI); per commit `planet phase event <slug> <N> feedback-commit '<ids>' --sha <sha>`; one `planet phase event <slug> <N> triage '<json>'`; `planet pr feedback mark <slug> <N> handled <ids>`; fast-forward and remove per `references/worktree.md`. Restore the marker. Return `feedback applied for phase <N>`.
- **Never** push, post, amend, or force push outside the shorthand; never paste full diffs into chat.

`references/batch-format.md`: the batch block from the spec's "Batch format" section; the shorthand grammar (`do <ids>`, `weigh <id> -> do`, `refute <id>`, `defer <id> to phase <M>|follow-up`, `<id> merge into <id>`, `skip <id>`, free-text edits to a drafted message or change); unhandled items from earlier batches listed first.

`references/worktree.md`: `git worktree prune`, then remove any `.planet-worktrees/<repo>-<slug>-<N>` left by a crash; `git fetch origin <head_ref>`; `git worktree add --detach <path> origin/<head_ref>`; after push, `git fetch origin <head_ref>:<head_ref>` when the branch is not checked out (`git worktree list --porcelain`), else say it is behind; `git worktree remove <path>`; on merge, `git branch -D <head_ref>` only when it is not checked out and `git merge-base --is-ancestor <branch tip> <PR head sha>` succeeds.

- [ ] **Step 1: RED, baseline without the skill.** Dispatch one general-purpose subagent per scenario, 3 reps each, with the Planet `go` and `planet-implement` skill text as context and the scenario as the user turn. Record each reply verbatim in the notes file.
  - A. Mid-planning wake: the conversation is planning phase 3; a background task exits with a watcher line and `pr feedback --new` returns 5 items (2 obvious, 1 design question, 1 bot nit, 1 scope add).
  - B. The user said earlier "these rename nits are always fine, just do them".
  - C. A weigh item whose fix is a one-line change.
  - D. `git worktree list` shows a stale `.planet-worktrees/r-e-2` entry.
  - E. The user replies `do 1 3, weigh 2 -> do, refute 4, defer 5 to phase 3`.
  Pass criteria for GREEN: A shows a batch under ~25 lines and ends the turn with nothing pushed or posted; B drafts but does not push; C gives no diff; D prunes before creating; E pushes `HEAD:<branch>`, posts replies for 4 and 5 only, records both event kinds, removes the worktree.
- [ ] **Step 2: Write the failing structure test.** Add `planet-pr-feedback` to `REQUIRED_SKILLS`, `HIDDEN`, and `WORD_BUDGET` (950). Run `node --test test/skills.test.ts`; expect FAIL `missing skills/planet-pr-feedback/SKILL.md`.
- [ ] **Step 3: GREEN.** Write the skill and the two references addressing the baseline failures recorded in Step 1. Run `npm test`; expect pass.
- [ ] **Step 4: Rerun scenarios A to E with the skill, 3 reps each.** Record results. Every rep meets its pass criterion.
- [ ] **Step 5: REFACTOR.** Each new rationalization gets a counter in Critical rules or Troubleshooting; rerun the failing scenario until it passes 3 of 3.
- [ ] **Step 6: Commit**

```bash
git add skills/planet-pr-feedback test/skills.test.ts docs/superpowers/notes/2026-11-04-pr-feedback-skill-tests.md
git commit -m "add planet-pr-feedback"
```

---

### Task 8: `planet-implement` starts the watcher

**Files:**
- Modify: `skills/planet-implement/SKILL.md` (step 7, version 0.6.0), `test/skills.test.ts` (budget 790)
- Modify: `skills/planet-implement/references/pr-lifecycle.md` (one line: inside the feedback loop, commits are additive even on a draft)
- Modify: `docs/superpowers/notes/2026-11-04-pr-feedback-skill-tests.md`

**Interfaces:**
- Consumes: `planet watch` (Task 3).
- Produces: after the `implemented` event and before the return line, step 7 runs `planet watch <slug> <N>` as a background Bash task (`run_in_background`) and says in one line that review feedback will arrive in this chat.

- [ ] **Step 1: RED.** Micro-test per writing-skills: 5 fresh reps with the current skill and a transcript ending at step 7. Record whether any rep starts a watcher (expected: none).
- [ ] **Step 2: Write the change** and raise the budget to 790. Run `npm test`; expect pass.
- [ ] **Step 3: GREEN.** 5 reps with the edited skill: every rep starts `planet watch` in the background before returning, and the return line is unchanged.
- [ ] **Step 4: Commit**

```bash
git add skills/planet-implement test/skills.test.ts docs/superpowers/notes/2026-11-04-pr-feedback-skill-tests.md
git commit -m "planet-implement: start the pr watcher after opening the pr"
```

---

### Task 9: router `pr feedback` path and retro split

**Files:**
- Modify: `skills/go/SKILL.md` (step 3 request list, new step; version 0.8.0), `skills/planet-retro/SKILL.md` (step 3 and 4, version 0.4.0), `skills/planet-retro/references/refinement-brief.md`, `skills/planet-retro/references/retro-template.md`, `test/skills.test.ts` (budgets 1300 and 960)
- Modify: `docs/superpowers/notes/2026-11-04-pr-feedback-skill-tests.md`

**Interfaces:**
- Consumes: `planet-pr-feedback` (Task 7), `RetroInputs.loop_commits|triage|prompts[].kind` (Task 5).
- Produces:
  - Router: request `pr feedback [N]` after an epic (N defaults to the lowest phase with an open PR): repo check (step 6), then invoke `planet:planet-pr-feedback` with `epic`, `dir`, `phase: N`, `event: feedback`, and end the turn on its return line. Distinct from `review feedback` (step 10).
  - Retro step 3: the brief gets a new slot, loop commit shas, and the prompts split into own (`implementation`) and loop (`review`). Step 4 becomes "Review feedback": the reviewer-driven table, override count with one example per kind, deferred items with targets.
  - Refinement brief: produce two category tables, "Own refinements" (range minus loop commits) and "Review-driven" (loop commits only); pair own prompts with the first, loop prompts with the second.
  - Retro template: `## Review and CI` becomes `## Review feedback` with those three parts.

- [ ] **Step 1: RED.** Two micro-tests, 5 reps each, recorded in the notes file:
  - Router: `/planet:go gql pr feedback 2` with the current router. Expected baseline: it does not invoke `planet-pr-feedback`.
  - Retro: retro inputs with 2 loop commits and 1 weigh-to-do override. Expected baseline: one refinement table mixing loop commits with own refinements, and no lesson for `planet-pr-feedback`.
- [ ] **Step 2: Write the changes** and raise the two budgets. Run `npm test`; expect pass.
- [ ] **Step 3: GREEN.** Rerun both micro-tests, 5 reps: the router dispatches with `event: feedback`; the retro shows two tables and proposes the override lesson against `planet-pr-feedback`.
- [ ] **Step 4: Commit** (two commits, one per skill)

```bash
git add skills/go test/skills.test.ts docs/superpowers/notes/2026-11-04-pr-feedback-skill-tests.md
git commit -m "go: route pr feedback to planet-pr-feedback"
git add skills/planet-retro test/skills.test.ts docs/superpowers/notes/2026-11-04-pr-feedback-skill-tests.md
git commit -m "planet-retro: split review-driven changes from own refinements"
```

---

### Task 10: spec amendments, README, version

**Files:**
- Modify: `docs/superpowers/specs/2026-11-04-planet-pr-feedback-loop-design.md` (triage file path `<dir>/research/pr-feedback-<N>.md`; marks file path; worktree path `<repo root>/../.planet-worktrees/`, since a worktree under `~/.planet` would land in the store's git commits; hook note text; router request name `pr feedback`)
- Modify: `README.md` (a "Review loop" paragraph under Features; `planet-pr-feedback` row in the Skills table)
- Modify: `.claude-plugin/plugin.json` (version 0.17.0)

- [ ] **Step 1: Make the edits.**
- [ ] **Step 2: Run** `npm test && npm run typecheck && claude plugin validate .`; expect all pass.
- [ ] **Step 3: Commit** (two commits)

```bash
git add docs/superpowers/specs/2026-11-04-planet-pr-feedback-loop-design.md
git commit -m "amend the pr feedback loop spec for file paths and the router request"
git add README.md .claude-plugin/plugin.json
git commit -m "document the review loop and bump the plugin version"
```
