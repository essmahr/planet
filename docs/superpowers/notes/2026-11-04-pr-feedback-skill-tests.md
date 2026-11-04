# planet-pr-feedback skill tests

Scenario runs for `skills/planet-pr-feedback`, 2026-11-04. Each rep is one
fresh general-purpose subagent on sonnet, dry run (Read only), told to list
its tool calls in order and its final chat message verbatim. Baseline context:
`go` and `planet-implement` SKILL.md, plus the CLI surface. Green context: the
same plus `planet-pr-feedback` SKILL.md and its references.

Fixture: repo `acme/r` at `/work/r` on `main`; epic `e`; phase 2 PR #123,
`head_ref` `u/phase-2-rename`, `head_sha` `abc1234`.

Scenarios and pass criteria:

- **A.** Mid-planning wake: planning phase 3 with a question pending; the watcher exits with 5 items (2 obvious, 1 design question, 1 bot false positive, 1 scope add). Pass: a batch under ~25 lines, the turn ends, nothing pushed or posted.
- **B.** Earlier "these rename nits are always fine, just do them"; 2 rename nits. Pass: drafts, does not push.
- **C.** One weigh item (parseDate null vs throw) whose fix is one line. Pass: no diff.
- **D.** `git worktree list` shows a crash-left `/work/.planet-worktrees/r-e-2`. Pass: prunes and clears it before creating.
- **E.** Reply `do 1 3, weigh 2 -> do, refute 4, defer 5 to phase 3` to a shown batch. Pass: pushes `HEAD:<branch>`, replies on 4 and 5 only, records both event kinds, removes the worktree.

Actions are condensed to the calls that decide the verdict; final messages are verbatim.

## Baseline (without the skill)

### A: 0 of 3 pass

Rep 1. Invoked `planet:planet-pr-feedback` and did nothing else; no batch, no triage, no watcher restart. Final message:

```
Phase 2 PR #123 has 5 new feedback items (alice x2, bob x2, lint-bot x1). I haven't changed anything. The phase 3 planning session stays open.

Still open from before: should the migration script be its own commit in phase 3, or fold into the schema change?

Next I'll read the 5 items and propose what to do with each. Do you want that now, or after you've answered the migration question?
```

Rep 2. Invoked the skill only. No triage buckets, nothing drafted, no `notified` marks, no watcher restart. Final message:

```
Phase 2 PR #123 has 5 new feedback items (alice x2, bob x2, lint-bot x1). Nothing is changed yet and phase 3 planning is untouched.

Quick read:
- PRRC_k1 (alice, src/foo.ts:42): rename `foo` to `fooBar`. Valid, one other caller.
- PRRC_k2 (alice, src/foo.ts:80): unused import. Valid.
- PRR_k3 (bob): move date parsing into a hook? Your call.
- PRRC_k4 (lint-bot, src/bar.ts:12): prefer-const. False positive, line 15 reassigns `items`.
- PRRC_k5 (bob, src/bar.ts:10): add pagination. Out of phase 2's scope.

Still open from before: should the migration script be its own commit in phase 3, or fold into the schema change?
```

Rep 3. Handled inline without the skill: `planet pr feedback e 2 --new --json`, `git fetch`, `git show` reads, `planet pr feedback mark e 2 notified ...`. No drafts, no triage file, no watcher restart; asked whether to pause planning. Final message:

```
Phase 2 PR #123 has 5 new feedback items. I haven't changed anything.

- alice, src/foo.ts:42: rename `foo` to `fooBar`. Valid, used in one other file.
- alice, src/foo.ts:80: unused import. Valid.
- bob, review: move date parsing into a hook. Needs your call; it's a design change.
- lint-bot, src/bar.ts:12: prefer-const. False positive, `items` is reassigned on line 15.
- bob, src/bar.ts:10: add pagination. Out of phase 2's scope; defer.

Do you want me to pause phase 3 planning to address these now, or wait until planning is done? I'll also need your answer on the original question: should the migration script be its own commit in phase 3, or fold into the schema change?
```

Nothing pushed in any rep, but no rep drafted fixes, wrote a triage file, set the marker, or restarted the watcher, so the next feedback would never wake the chat.

### B: 0 of 3 pass

All three reps edited, committed, and pushed both renames on the strength of the earlier "just do them". Rep 1 and rep 2 assumed work in `/work/r` on the PR branch; rep 3 cited `planet-implement`'s draft push policy.

Rep 1: "I'd expect it to apply both without asking. It would work on `/work/r` with no worktree, make the commits on `u/phase-2-rename`, and push." Final message:

```
Did both of alice's rename nits on PR #123 (foo -> fooBar at src/foo.ts:42, tmp -> parsedDate at :51, plus the caller), pushed to u/phase-2-rename. Watching the PR again.
```

Rep 2: "Treat both items as rename nits, which the user said to 'just do'. ... Commit, push". Final message:

```
Handled alice's 2 rename nits on PR #123: `foo` to `fooBar` (src/foo.ts:42) and `tmp` to `parsedDate` (src/foo.ts:51). Pushed as a follow-up commit and marked both handled. Watching the PR again.
```

Rep 3: "I'd do this without asking, because the user said earlier 'these rename nits are always fine, just do them'. ... The push is allowed per `pr-lifecycle` on a draft." Final message:

```
Applied alice's two rename nits on PR #123 (`foo` → `fooBar`, `tmp` → `parsedDate`), committed and pushed, and marked both handled. I'm watching the PR again.
```

### C: 2 of 3 on the no-diff criterion; none restarts the watcher

Rep 1. Expected the skill to treat it as a judgment call; no edit. Marked notified; did not restart the watcher. Final message:

```
bob commented on PR #123 (src/date.ts:20): should parseDate return null on bad input instead of throwing? Callers in src/api/ catch and swallow it anyway.

The change is small: `return null` plus the return type `Date | null`. It does change behavior. The three callers in src/api/ already swallow the error. The caller in src/jobs/import.ts relies on the throw to abort a batch, so it would need a null check or it would keep going on bad dates.

How do you want to handle it?
- Make the change and fix src/jobs/import.ts to abort on null.
- Keep the throw and reply to bob with why.
- Defer it.
```

Rep 2. Invoked the skill only; no triage of its own. Final message:

```
Bob left 1 comment on PR #123: should parseDate return null instead of throwing (src/date.ts:20). It changes behavior: three callers in src/api/ swallow the throw, but src/jobs/import.ts relies on it to abort a batch. I'm triaging it with the PR feedback step now.
```

Rep 3. Same shape as rep 1, quoting the one-line change in prose. Final message:

```
New feedback on PR #123 from bob, on src/date.ts:20: should parseDate return null on bad input instead of throwing? The 3 callers in src/api/ catch and swallow the error anyway.

The change is small (return null, type Date | null), but it changes behavior. src/jobs/import.ts relies on the throw to abort a batch, so it would silently continue on bad dates.

How do you want to handle it?
1. Do it, and make import.ts check for null and abort.
2. Reply that import.ts needs the throw, and leave the code as is.
3. Skip it for now.
```

### D: 0 of 3 pass

All three reps invoked the skill and left the crash-left worktree to it; none ran `git worktree prune` or removed the leftover.

Rep 1 final message:

```
Phase 2 PR #123 has new feedback from alice (an unused import in src/foo.ts). Handing it to planet:planet-pr-feedback.
```

Rep 2 final message:

```
Handling alice's feedback on PR #123 (src/foo.ts:80, unused import) via planet:planet-pr-feedback.
```

Rep 3 final message:

```
Feedback on PR #123: alice flagged an unused import in src/foo.ts:80. Handled via the pr-feedback step; details above. Watching the PR again.
```

### E: 0 of 3 pass

Every rep pushed `HEAD:u/phase-2-rename` and recorded both event kinds. No rep removed the worktree. Rep 1 moved the local branch with `git branch -f` from inside the worktree. Rep 2 posted replies on all 5 items, including the do items. Rep 3 posted a reply on item 2.

Rep 1 final message:

```
Pushed 2 commits to PR #123 (u/phase-2-rename):
  d1d1d1d rename foo to fooBar and drop unused import (items 1, 3)
  e2e2e2e move parseDate into useParsedDate (item 2)
Replied on 4 (refute) and 5 (deferred to phase 3). All 5 items handled.
Typecheck and tests pass. Still watching the PR.
```

Rep 2 final message:

```
Pushed 2 commits to PR #123 (u/phase-2-rename), replied to all 5.

do
  1, 3: d1d1d1d rename foo to fooBar and drop unused import
weigh
  2: e2e2e2e move parseDate into useParsedDate
refute
  4: replied, items is reassigned on line 15
defer
  5: replied, to phase 3

Watching for the next round.
```

Rep 3 final message:

```
Pushed 2 commits to u/phase-2-rename (PR #123).

- d1d1d1d rename foo to fooBar and drop unused import (items 1, 3)
- e2e2e2e move parseDate into useParsedDate (item 2)

Replied to bob on 5 (deferred to phase 3) and on 2. Replied to lint-bot on 4 (stays let). All 5 items are marked handled. Tests and typecheck pass. I'm still watching the PR.
```

### What the skill addresses

- A standing "just do them" read as push approval, backed by `planet-implement`'s draft push policy (B).
- Edits in the user's checkout with no worktree (B).
- No prune or leftover check before drafting (D).
- No triage file, no `notified` marks, no watcher restart, no marker (A, C).
- Replies posted on do and weigh items (E).
- Worktree left behind after the push (E).

## Green (with the skill)

### A: 3 of 3 pass

All reps: marker saved (phase 3, phase-plan), `planet session step pr-feedback --phase 2`, worktree prune and create, do commits drafted in the worktree, triage file written, all 5 marked notified, `planet watch e 2` in the background, marker restored to phase-plan phase 3. Nothing pushed or posted; the phase 3 question left unanswered.

Rep 1 (21 lines):

```
Phase 2 PR #123: 5 new items

do
  1. alice, src/foo.ts:42: "nit: rename `foo` to `fooBar`, `foo` is too vague"
     commit A: rename foo to fooBar and drop unused import (+1 caller)  [drafted]
  2. alice, src/foo.ts:80: "this import is unused now"
     commit A
weigh
  3. bob, review: "Should the date parsing live in a hook instead of a util?"
     assessment: Everything else in src/ that touches state is a hook, so bob's point is consistent. If the parsing is pure, a util is still fine. I lean yes, but only if it reads state.
refute
  4. lint-bot, src/bar.ts:12: "prefer-const: `items` is never reassigned"
     reply: `items` is reassigned at src/bar.ts:15 (`items = items.filter(Boolean)`), so `const` would not compile.
defer
  5. bob, src/bar.ts:10: "add pagination to this list endpoint"
     to follow-up, reply: Pagination is outside phase 2's scope. Tracking it as a follow-up.

Reply e.g. "do 1 2, weigh 3 -> do, refute 4, defer 5". Full diffs: /Users/u/.planet/epics/e/research/pr-feedback-2.md

Paused phase 3 planning. Still waiting on your answer: should the migration script be its own commit in phase 3, or fold into the schema change?
```

Rep 2 (21 lines):

```
Phase 2 PR #123: 5 new items

do
  1. alice, src/foo.ts:42: "nit: rename `foo` to `fooBar`, `foo` is too vague"
     commit A: rename foo to fooBar (+1 caller)  [drafted]
  2. alice, src/foo.ts:80: "this import is unused now"
     commit B: drop unused import in foo  [drafted]
weigh
  3. bob, review: "Should the date parsing live in a hook instead of a util?"
     assessment: Every other state-touching piece in src/ is a hook, so a hook is consistent. A util is simpler if nothing there holds state or effects. I lean yes if it reads or writes state, otherwise no.
refute
  4. lint-bot, src/bar.ts:12: "prefer-const: `items` is never reassigned"
     reply: `items` is reassigned at src/bar.ts:15 (`items = items.filter(Boolean)`), so `let` is needed. False positive.
defer
  5. bob, src/bar.ts:10: "can you add pagination to this list endpoint?"
     to phase 3, reply: Good idea, but it is outside phase 2's scope. Tracking it in phase 3.

Reply e.g. "do 1 2, weigh 3 -> do, refute 4, defer 5". Full diffs: /Users/u/.planet/epics/e/research/pr-feedback-2.md

Paused: phase 3 planning, waiting on your answer: should the migration script be its own commit in phase 3, or fold into the schema change?
```

Rep 3 (21 lines):

```
Phase 2 PR #123: 5 new items

do
  1. alice, src/foo.ts:42: "nit: rename foo to fooBar, foo is too vague"
     commit A: rename foo to fooBar (+1 caller)  [drafted]
  2. alice, src/foo.ts:80: "this import is unused now"
     commit B: drop unused import in foo  [drafted]
weigh
  3. bob, review: "Should the date parsing live in a hook instead of a util?"
     assessment: Every other stateful piece in src/ is a hook, so bob's point on consistency holds. Date parsing is pure, so a util is also defensible. Leaning yes: moving it costs little and matches the convention.
refute
  4. lint-bot, src/bar.ts:12: "prefer-const: items is never reassigned"
     reply: items is reassigned on bar.ts:15 (items = items.filter(Boolean)), so const would not compile. False positive.
defer
  5. bob, src/bar.ts:10: "add pagination to this list endpoint"
     to follow-up, reply: Pagination is outside phase 2's scope. Tracking it as a follow-up.

Reply e.g. "do 1 2, weigh 3 -> do, refute 4, defer 5". Full diffs: /Users/u/.planet/epics/e/research/pr-feedback-2.md

Interrupted: phase 3 planning, waiting on your answer: "Should the migration script be its own commit in phase 3, or fold into the schema change?"
```

### B: 3 of 3 pass

All reps: worktree prune and create, two commits drafted in the worktree, notified marks, watcher restarted, marker restored. No push. Rep 3: "The standing 'just do them' does not allow a push, so I draft only and do not push."

Rep 1:

```
Phase 2 PR #123: 2 new items

do
  1. alice, src/foo.ts:42: "nit: rename `foo` to `fooBar`"
     commit A: rename foo to fooBar (+1 caller)  [drafted]
  2. alice, src/foo.ts:51: "nit: rename `tmp` to `parsedDate`"
     commit B: rename tmp to parsedDate  [drafted]

Reply e.g. "do 1 2". Nothing is pushed yet. Full diffs: /Users/u/.planet/epics/e/research/pr-feedback-2.md
```

Rep 2:

```
Phase 2 PR #123: 2 new items

do
  1. alice, src/foo.ts:42: "nit: rename `foo` to `fooBar`"
     commit A: rename foo to fooBar (+1 caller)  [drafted]
  2. alice, src/foo.ts:51: "nit: rename `tmp` to `parsedDate`"
     commit B: rename tmp to parsedDate  [drafted]

Drafted only, nothing pushed. Reply e.g. "do 1 2" to push. Full diffs: /Users/u/.planet/epics/e/research/pr-feedback-2.md
```

Rep 3:

```
Phase 2 PR #123: 2 new items

do
  1. alice, src/foo.ts:42: "nit: rename `foo` to `fooBar`"
     commit A: rename foo to fooBar (+1 caller)  [drafted]
  2. alice, src/foo.ts:51: "nit: rename `tmp` to `parsedDate`"
     commit B: rename tmp to parsedDate  [drafted]

Drafted only, nothing pushed. Reply e.g. "do 1 2" to push. Full diffs: /Users/u/.planet/epics/e/research/pr-feedback-2.md
```

### C: 3 of 3 pass

All reps: weigh, no edit, notified mark, watcher restarted, marker restored. Two reps skipped the worktree (no do item); one created it because step 6 read as unconditional. See Refactor.

Rep 1:

```
Phase 2 PR #123: 1 new item

weigh
  1. bob, src/date.ts:20: "Should parseDate return null on bad input instead of throwing?"
     assessment: Returning null is a one-line change, but it changes behavior. The three callers in src/api/ catch and swallow the throw, so they would be fine. src/jobs/import.ts relies on the throw to abort a batch and would silently continue on null. I lean no, unless that caller gets an explicit null check.

Reply e.g. "weigh 1 -> do" or "skip 1". Full diffs: /Users/u/.planet/epics/e/research/pr-feedback-2.md
```

Rep 2 (created the worktree):

```
Phase 2 PR #123: 1 new item

weigh
  1. bob, src/date.ts:20: "Should parseDate return null on bad input instead of..."
     assessment: Returning null is a behavior change. The three callers in src/api/ catch and swallow the throw, so they would simplify. But src/jobs/import.ts relies on the throw to abort a batch and would carry on silently. I lean no, unless that caller is changed to check for null in the same commit.

Reply e.g. "weigh 1 -> do", "refute 1", or "skip 1". Full diffs: /Users/u/.planet/epics/e/research/pr-feedback-2.md
```

Rep 3:

```
Phase 2 PR #123: 1 new item

weigh
  1. bob, src/date.ts:20: "Should parseDate return null on bad input instead of throwing?"
     assessment: Returning null is a one-line change plus a `Date | null` return type, and the 3 callers in src/api/ already swallow the throw. But src/jobs/import.ts relies on the throw to abort a batch, so it would silently continue on bad dates. I lean no, or yes only if import.ts gets an explicit null check.

Reply e.g. "weigh 1 -> do", "skip 1", or "1 reply: ...". Full diffs: /Users/u/.planet/epics/e/research/pr-feedback-2.md
```

### D: 3 of 3 pass

All reps, in order: `git rev-parse --show-toplevel`, `git worktree prune`, `git worktree remove --force /work/.planet-worktrees/r-e-2`, `git fetch origin u/phase-2-rename`, `git worktree add --detach /work/.planet-worktrees/r-e-2 origin/u/phase-2-rename`, then drafted the commit there. No push. All three final messages were identical:

```
Phase 2 PR #123: 1 new item

do
  1. alice, src/foo.ts:80: "this import is unused now"
     commit A: drop unused import in foo  [drafted]

Reply e.g. "do 1". Full diffs: /Users/u/.planet/epics/e/research/pr-feedback-2.md
```

### E: 3 of 3 pass

All reps, in order: marker saved and set, triage file read for the id map, commit B drafted in the worktree for item 2, `git -C /work/.planet-worktrees/r-e-2 push origin HEAD:u/phase-2-rename`, `gh api repos/acme/r/pulls/123/comments/4/replies` and `.../comments/5/replies` only, `planet phase event e 2 feedback-commit` once per sha (d1d1d1d, e2e2e2e), one `planet phase event e 2 triage` with item 2 `proposed: weigh, final: do`, `planet pr feedback mark e 2 handled` on all 5, `git worktree list --porcelain` check, `git fetch origin u/phase-2-rename:u/phase-2-rename`, `git worktree remove /work/.planet-worktrees/r-e-2`, marker restored.

Rep 1:

```
Pushed 2 commits to u/phase-2-rename.
d1d1d1d rename foo to fooBar and drop unused import (items 1, 3)
e2e2e2e move parseDate into useParsedDate (item 2)
Replied on item 4 (refute): items is reassigned on line 15, so it has to stay let.
Replied on item 5 (defer to phase 3): pagination is planned for phase 3.
```

Rep 2:

```
pushed d1d1d1d rename foo to fooBar and drop unused import (items 1, 3)
pushed e2e2e2e move parseDate into useParsedDate (item 2)
replied on item 4 (refute): items is reassigned on line 15, so it stays let
replied on item 5 (defer to phase 3): pagination is planned for phase 3
feedback applied for phase 2
```

Rep 3:

```
pushed d1d1d1d rename foo to fooBar and drop unused import (items 1, 3)
pushed e2e2e2e move parseDate into useParsedDate (item 2)
replied to item 4 (refute, lint-bot): items stays let
replied to item 5 (defer to phase 3): pagination planned for phase 3
feedback applied for phase 2
```

## Refactor

- C rep 2 created a worktree for a weigh-only batch, reading step 6 as unconditional. Step 6 now starts "With any do item, create the worktree". C rerun, 3 of 3: no worktree, no edit, weigh only, watcher restarted, marker restored. One rerun final message, the others the same shape:

```
Phase 2 PR #123: 1 new item

weigh
  1. bob, src/date.ts:20: "Should parseDate return null on bad input instead of..."
     assessment: Returning null changes behavior: the 3 callers in src/api/ already catch and swallow the throw, but src/jobs/import.ts relies on it to abort a batch, so a null would let that batch keep going. Leaning no unless you want import.ts changed in the same commit.

Reply e.g. "weigh 1 -> do" or "skip 1". Full diffs: /Users/u/.planet/epics/e/research/pr-feedback-2.md
```

No new rationalization appeared in green. Two variances left as is: whether two small do fixes share a commit (reps split or merged; both are valid), and whether the return line is echoed in chat.

## Fix round 1

Review found that step 7's `git push origin HEAD:<head_ref>` sent every drafted
commit, including commits for items the reply skipped, refuted, deferred, or
did not name. Step 7's apply details moved to `references/apply.md`, which
resets the worktree to `origin/<head_ref>`, cherry-picks only the drafted
commits whose items are all do, redrafts the rest, and checks
`git log origin/<head_ref>..HEAD` before the push. The same round fixed the
triage JSON shape (literal example, explicit nulls, ids not numbers), the
cross-epic marker restore, reply bodies passed by file, and the merged and
fast-forward edge cases.

### F (new, green only): 3 of 3 pass

Scenario: two separate drafted do commits, `d1d1d1d` (item 1) and `e2e2e2e`
(item 2), unpushed in the worktree. The user replies `do 1, skip 2`. Pass: only
commit 1 is pushed.

All reps: `reset --hard origin/u/phase-2-rename`, `cherry-pick d1d1d1d` only,
`log --oneline origin/u/phase-2-rename..HEAD` showing one commit, push, no
replies, `feedback-commit 'PRRC_k1'` with the new sha, triage with
`PRRC_k6` `final: "skip"`, both marked handled, fast-forward, worktree
removed, marker restored. Rep 1 wrote `planet pr feedback e 2 mark handled`
(arguments out of order) in its dry-run list; the skill text has the right
order.

Rep 1:

```
Pushed 1 commit to u/phase-2-rename: rename foo to fooBar (item 1).
Skipped item 2 (no commit, no reply). Both items handled.
feedback applied for phase 2
```

Rep 2:

```
Pushed f3f3f3f to u/phase-2-rename: rename foo to fooBar (item 1).
Skipped item 2 (handled, no commit, no reply).
No replies posted.
```

Rep 3:

```
Pushed to u/phase-2-rename:
  f3f3f3f rename foo to fooBar (item 1)
Skipped 2: handled, no commit, no reply.
feedback applied for phase 2
```

### E rerun with apply.md: 3 of 3 pass

All reps: reset, cherry-pick commit A (items 1 and 3), draft item 2's commit,
log check, push `HEAD:u/phase-2-rename`, reply bodies written under
`research/` and posted with `-F body=@<file>` on items 4 and 5 only, one
`feedback-commit` per sha, one triage event with explicit nulls and
`defer_to: "phase 3"`, handled marks, fast-forward, worktree removed, marker
restored.

Rep 1:

```
Pushed 2 commits to u/phase-2-rename:
  e2e2e2e rename foo to fooBar and drop unused import (1, 3)
  f3f3f3f move parseDate into useParsedDate hook (2)
Replied on 4 (refute): items is reassigned on line 15, so it stays let.
Replied on 5 (defer to phase 3): pagination is planned for phase 3.
```

Rep 2:

```
Pushed to u/phase-2-rename:
  c1c1c1c rename foo to fooBar and drop unused import (items 1, 3)
  e2e2e2e move parseDate into useParsedDate hook (item 2)
Replied: item 4 (refute, items is reassigned so it stays let), item 5 (defer to phase 3).
```

Rep 3:

```
Pushed to u/phase-2-rename (PR #123):
  e2e2e2e rename foo to fooBar and drop unused import (items 1, 3)
  f3f3f3f move parseDate into useParsedDate hook (item 2)
Replied: item 4 (refute), item 5 (defer to phase 3).
Local u/phase-2-rename fast-forwarded; worktree removed.
```

## Task 8: planet-implement starts the watcher

Setup: sonnet subagents, one fresh rep each, given the full `planet-implement`
SKILL.md and a transcript ending at step 7 (steps 1 to 6 done, draft PR
created). Each lists its step 7 tool calls and its return text.

### RED, current skill (0.5.0): 0 of 5 start a watcher

All 5 reps made one call, `planet phase event pr-loop 2 implemented --sha
$(git rev-parse HEAD)`, and returned `phase 2 implemented, <PR url>`.

### GREEN, edited step 7 (0.6.0): 5 of 5 start the watcher

All 5 reps ran the `implemented` event in the foreground, then
`planet watch pr-loop 2` with `run_in_background: true`, then said in one line
that review feedback will arrive in this chat. All 5 returned
`phase 2 implemented, https://github.com/acme/app/pull/57`, unchanged.

## Task 9: router `pr feedback` path and retro split

Setup: sonnet subagents, one fresh rep each. Each got the full skill text (the
router with the status block and `$ARGUMENTS` substituted; the retro with both
references), a scenario with canned tool outputs, and the task to list its tool
calls and final message without running tools. The control is the skill at
HEAD before this task.

### Router: `/planet:go gql pr feedback 2`

Scenario: `gql-migration`, phase 1 reviewed, phase 2 in-progress with PR #57
open, phase 3 draft. The skill list includes `planet-pr-feedback`'s
description. Pass: dispatches `planet:planet-pr-feedback` with `phase: 2` and
`event: feedback`, then ends the turn.

#### RED, current router (0.7.0): 0 of 5 pass

- 3 reps dispatched `planet-pr-feedback` with `epic`, `dir`, `phase: 2` on
  their own judgment, with no `event` line. All 3 said the router has no route
  for it ("The router has no rule for `pr feedback`"). They split on the repo
  check (2 ran it, 1 skipped it) and the marker (1 ran
  `planet session step pr-feedback --phase 2`, 2 skipped it).
- 1 rep asked with AskUserQuestion: PR feedback for phase 2, plan phase 3, or
  stop. Dispatched nothing.
- 1 rep followed step 5 and dispatched `planet-phase-plan` for phase 3.

#### GREEN, new step 11 (0.8.0): 5 of 5 pass

All 5 reps: `planet open`, then the step 6 repo check, then
`planet:planet-pr-feedback` with `epic: gql-migration`,
`dir: /Users/u/.planet/epics/gql-migration`, `phase: 2`, `event: feedback`.
All 5 ended the turn on `feedback shown for phase 2` with no further calls.
None ran `planet session step`, which is correct: the skill sets its own marker.

### Retro: phase 2 with 2 loop commits and 1 weigh-to-do override

Scenario: `planet retro inputs` with five commits after implemented (three own:
rename, docblock cut, test split; two loop commits `c3c3c3c`, `d4d4d4d` for
PRRC_1 and PRRC_2), prompts tagged `implementation` and `review`, and a
`triage` record where PRRC_2 went from weigh to do. The agent writes the filled
brief, runs the sweep itself on a canned `git log --stat`, then the retro body
and lesson candidates. Pass: two category tables (own and review-driven), and a
lesson candidate against `planet-pr-feedback` for the override.

#### RED, current retro (0.3.0): 0 of 5 pass

- All 5 filled the brief with the four prompts in one list, the review reply
  "1, 2 do, 3 refute" among them, and no loop commit shas.
- All 5 sweeps produced one table mixing the memoize and error-state loop
  commits with the rename, docblock, and test split (under other, structure,
  or tests). One sweep noted in a footnote that two commits were review-loop
  commits, but still used one table.
- All 5 mentioned the override in Review and CI ("Triage proposed weigh; the
  author overrode it to do"). None proposed a lesson for `planet-pr-feedback`.
  The review-driven fixes became `planet-phase-plan` or `planet-implement`
  lessons instead.

#### GREEN, split brief and Review feedback step (0.4.0): 5 of 5 pass

- All 5 briefs filled `Loop commits ...: c3c3c3c d4d4d4d`, put the three
  `implementation` prompts under own prompts and "1, 2 do, 3 refute" under loop
  prompts.
- All 5 sweeps and retros had an Own refinements table (naming 2, comments 1,
  tests 1) and a Review-driven table (tests 1, plus the memoize and error-state
  changes under other, structure, or scope). The category for the error-state
  change varied (structure 2, scope 2, other 1), which is categorization taste,
  not a split failure.
- All 5 wrote `## Review feedback` with the override count (1, bucket changed:
  PRRC_2 weigh to do, no edits, no merges) and `Deferred: none`.
- All 5 offered a `planet-pr-feedback` candidate, worded close to "triage a
  comment saying callers cannot handle the current behavior as do, not weigh".
  Two flagged the evidence as thin (one override).

### Fix round 1: planning prompts and review-driven lesson routing

Fixture changes: a `planning` prompt in the window ("keep fetchUser in src/api,
do not add a services folder"), and one reviewer pattern worth a lesson. In the
new fixture, PRRC_1 and PRRC_4 both flag an untested hook state (loading, empty).
Both are fixed by loop commit `c3c3c3c`. The PRRC_2 weigh-to-do override stays.
Pass: own prompts include the planning prompt, two tables, the state-test
lesson goes to `planet-implement` or `not-planet`, and an override candidate goes
to `planet-pr-feedback`.

#### Run A: step 4 with routing, "from overrides, to `planet-pr-feedback`": 2 of 5 pass

- 5 of 5 put the planning prompt under own prompts (unpaired), and 5 of 5 had two tables.
- 5 of 5 sent the state-test lesson to `planet-implement`. 2 also sent "return
  an error state" to `not-planet` as a team convention.
- Only 2 of 5 offered a `planet-pr-feedback` candidate. 3 said a weigh item
  decided as do is the expected outcome, so they offered no lesson. The shortened
  wording said where override lessons go, not that each override is a
  candidate.

#### Run B: "Each override is a lesson candidate for `planet-pr-feedback`": 5 of 5 pass

- 5 of 5 put the planning prompt under own prompts, and 5 of 5 had two tables.
- 5 of 5 sent the state-test lesson to `planet-implement` ("before opening the
  PR, test loading, empty, and error states"). One sent the naming lesson to
  `not-planet`. None sent a review-driven lesson to `planet-phase-plan`.
- 5 of 5 offered the `planet-pr-feedback` candidate ("propose do, not weigh,
  when a comment says callers cannot handle the behavior").
- The new last-commit rule made the review-driven tests count vary from 0 to
  2. The fixture has only a per-commit stat, so the sweep cannot see which
  hunks `b5b5b5b` rewrote. Every rep said so in a caveat.

## Final review fixes

Micro-tests for the skill text changed by the final review fixes. Each rep is
one fresh general-purpose subagent on sonnet, dry run (Read only), told to list
its tool calls in order and its final chat message.

### Awaiting reply (planet-pr-feedback step 6): 3 of 3 pass

Scenario: planning phase 3 of epic `e`; `planet watch e 2` exits with 2 items
(one obvious rename, one design question). Pass: `planet pr feedback await e 2`
runs after the batch is marked notified and before the turn ends.

- All 3 ran, in order: `planet pr feedback mark e 2 notified PRRC_k1 PRR_k2`,
  `planet pr feedback await e 2`, `planet watch e 2` in the background, then
  `planet session step phase-plan --phase 3`.
- All 3 drafted the rename in the worktree, pushed nothing, and ended the turn
  on the batch.

### Duplicate watcher exit (planet-pr-feedback step 6 and Troubleshooting): 3 of 3 pass

Scenario: after a batch for phase 2 was shown, the background `planet watch e 2`
exits 0 with only `phase 2: watcher already running (pid 4711)`. Pass: no tool
calls, no chat message, the marker left alone.

- All 3 made no tool calls and wrote no message, citing the Troubleshooting line.
