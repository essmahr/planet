# Planet PR feedback loop: design

Follow-on to `2026-09-10-planet-implement-design.md`. Today a phase's loop goes
quiet once `planet-implement` opens the PR. Review feedback reaches the session
only when the user pastes a comment link with "do this, additive commit" or
"weigh this change", and a merge is noticed only on the next `/planet:go`.
This design makes the session that opened the PR hear about new feedback and
merges on its own, pre-sorts the feedback, and drafts fixes for approval.

## Problem

The user's judgment per comment is fast. The labor is the round trip: open
GitHub, copy a link, paste it, type the instruction, once per comment. Merges
have the same gap: the phase ships and the retro waits until someone runs
`/planet:go`.

## Goals

- New review feedback, CI failures, and merges reach the chat that opened the
  PR without the user pasting anything.
- Each feedback item arrives pre-sorted into the user's two buckets, with the
  work for "do" items already drafted.
- The user acts on a whole batch with one shorthand reply.
- On merge, the phase is marked shipped and the user picks retro now or later.
- Planet cleans up every worktree and local branch it creates.

## Non-goals

- Acting on feedback without approval. Nothing is pushed and no reply is posted
  until the user says so.
- Enforcing one session per PR. A session may span several PRs; overlap is the
  user's to manage.
- Depending on Claude Desktop features (`auto_fix`, `set_monitor`, session
  cards). Planet may run under another harness (e.g. T3).
- Background LLM work outside a chat (launchd, cron, headless `claude -p`).

## Anti-goals

- A feedback payload landing in a chat and burying planning work. Wake-ups
  carry a short batch summary; the user can defer it.
- Leftover worktrees or local branches after a batch or a merge.
- Commits pushed or replies posted that the user did not approve.

## Decisions

| Question | Decision |
|---|---|
| Skills | One new step skill, `planet-pr-feedback`, plus edits to `planet-implement`, the router (`go`), `planet-retro`, and the hook. Not a family. |
| Where feedback arrives | The chat that opened the PR (user's call). |
| How the chat wakes | A background Bash task running `planet watch`, which exits on the first new event. The exit wakes the chat. Claude Code core tool, not a desktop feature. |
| Why not `Monitor` | Its 30-minute cap forces a re-arm turn every half hour while idle. A background task wakes the chat only when something happened. |
| When the watcher is not running | (App quit, chat closed.) The `UserPromptSubmit` hook adds one line on the next prompt in any Planet session for that epic: `phase 2 PR: 3 new feedback items, /planet:go feedback`. `/planet:go feedback` from any session handles the batch and restarts the watcher there. |
| Triage buckets | **do** (agree, commit drafted), **weigh** (assessment drafted, no diff), **refute** (reply drafted), **defer** (reply drafted plus a target: follow-up or phase M). Several do items may share one commit. |
| When diffs are drafted | On wake, for do items only. Weigh items get a diff only after the user moves them to do. |
| Where diffs are drafted | A separate worktree on the PR branch (user's call), so the user's checkout is untouched even if it is on another branch. |
| Cleanup | Remove what Planet created as soon as it is no longer needed (user's call). See Worktree lifecycle. |
| Commits | Additive, always, inside this loop, including on a draft PR. `pr-lifecycle.md`'s draft force-push rule still applies to work outside the loop. |
| Draft PRs | The watcher runs on drafts too (CI failures, bot reviews). Marking ready for review stays with the user. |
| CI failure ids | `check:<name>@<head sha>`. A push that leaves the check failing wakes the chat again, which is correct. A refute or defer on a CI item posts no reply. |
| Merge | Watcher exits on merge. `planet sync` marks the phase shipped. AskUserQuestion with **Now** (run `planet-retro` in this chat) and **Later** (router's REVIEW column already shows "retro pending"). (user's call) |

## Flow

1. `planet-implement` opens the PR. The hook links it to the phase, as today.
   The skill then starts `planet watch <epic> <phase>` as a background Bash
   task and says so in one line.
2. The watcher polls GitHub. On the first item not yet notified, or a merge or close, it
   prints a short summary and exits.
3. The exit wakes the chat. `go` is not model-invocable, so the watcher's
   output tells the model what to do, as its last line:
   `invoke planet:planet-pr-feedback epic: <slug> phase: <N> event: <feedback|merged|closed>`.
   `planet-pr-feedback` handles all three events:
   - merged: step 6 below.
   - closed without merge: say so, remove the worktree, stop.
   - feedback: step 4.
   Its description says it runs only on that watcher line or from the router,
   like the other step skills. It works after compaction or unrelated work in
   between, because the line carries everything it needs.
4. `planet-pr-feedback` reads `planet pr feedback <epic> <phase> --new`,
   triages each item, drafts do commits in the worktree, writes the triage
   file, and shows the batch (format below). It then restarts the watcher and
   ends its turn.
5. The user replies in shorthand, e.g. `do 1 3, weigh 2 -> do, refute 4, defer
   5 to phase 3, 6 merge into 1`. The skill applies it: commits in the
   worktree, pushes `HEAD:<branch>`, posts approved replies, marks the items
   handled, removes the worktree, and reports.
6. On merge: `planet sync <epic>`, worktree and local branch cleanup, then
   AskUserQuestion Now/Later for retro.

Each item has two marks:

- **notified**: set when a batch shows it. The watcher and the hook fire only
  on items not yet notified, so a batch waiting for a reply never re-wakes the
  chat or repeats on every prompt.
- **handled**: set when the user acts on it (do, refute, defer, or `skip N`).
  Notified-but-unhandled items are listed again at the top of the next batch.
  `/planet:go feedback` shows them on demand.

## Batch format (shown in chat)

```
Phase 2 PR #123: 5 new items

do
  1. alice, src/foo.ts:42: "rename to fooBar"
     commit A: rename foo to fooBar (+1 caller)  [drafted]
  3. alice, src/foo.ts:80: "drop the unused import"
     commit A
weigh
  2. bob, review: "should this be a hook?"
     assessment: <2-3 sentences, leaning yes/no>
refute
  4. bot, CI lint: "prefer const"
     reply: <draft>
defer
  5. bob, src/bar.ts:10: "add pagination"
     to phase 3, reply: <draft>

Reply e.g. "do 1 3, weigh 2 -> do, refute 4, defer 5". Full diffs: <triage file path>
```

The triage file, `phases/<N>/feedback.md` in the epic directory, holds the same
batch plus the full drafted diffs, so the chat shows only the summary.

## CLI

- `planet watch <epic> <phase> [--interval <s>]`: polls the phase's open PRs
  until it finds a feedback item not yet notified, a merge, or a close. Prints one
  summary line per event, then exits 0. On `GhUnavailable` it keeps retrying
  with backoff and prints one line only after repeated failures, then exits.
- `planet pr feedback <epic> <phase> --new`: today's command, limited to items
  not yet handled, each with its notified flag. Each item gets a stable id.
- `planet pr feedback mark <epic> <phase> notified|handled <id>...`: sets an item's mark.
- `gh.prFeedback` changes: include each comment's and review's node id and
  `createdAt`; include top-level PR conversation comments, which today's query
  omits; drop empty review bodies and the user's own comments (the PR author).
- Marks live in the phase frontmatter or a sidecar file in the phase
  directory, committed to the `~/.planet` store like other writes.

## Worktree lifecycle

- Path: under the scratch or `~/.planet` area, never inside the repo's working
  tree. Name includes epic and phase.
- Created detached at `origin/<pr branch>` after a fetch. No local branch is
  created. This avoids git's refusal to check out a branch already checked out
  in the user's main checkout.
- Commits are pushed with `git push origin HEAD:<pr branch>`.
- Removed (`git worktree remove`) after each batch's push, and on merge or
  close. Recreated for the next batch.
- After each push, the user's local PR branch is fast-forwarded to the pushed
  head (`git fetch origin <branch>:<branch>`) when it is not checked out. When
  it is checked out, the skill says it is behind and leaves it.
- On merge, the local PR branch is deleted with `git branch -D` only if it is
  not checked out and its tip is the PR's last head sha from GitHub, or an
  ancestor of it. That check works for squash merges, where `-d` refuses. The
  remote branch is left to GitHub's auto-delete setting.
- Any `git worktree prune` and orphan check runs at the start of each batch,
  for worktrees left by a crash.

## Hook

`UserPromptSubmit`, in a Planet session: if the session's epic has a phase with
feedback not yet notified, add one line naming the phase and the count. Never the
content. The check calls GitHub at most once per 5 minutes per epic (like
`planet sync`'s max age), with a timeout under the hook's 10 s, and stays
silent on any failure. The hook must work when no watcher is running, so it
cannot rely on a watcher's poll result.

## Retro

Feedback-loop work is included in the retro, split by who caught each fix
(user's call). The point of the split is to send each lesson to the right
skill.

| Source | How the retro finds it | Lessons go to |
|---|---|---|
| Own refinements | Commits in `implemented..head` that are not loop commits, plus prompts outside batches. Same as today. | `planet-implement`, `planet-phase-plan`, `not-planet` |
| Reviewer-driven | Loop commits, by sha, with the items each one addressed. | `planet-implement` (things to check before opening the PR), `not-planet` (team conventions) |
| Triage overrides | Override events: a bucket the user changed, a draft the user edited before approving, an item merged into another commit. | `planet-pr-feedback` |
| Deferred items | Defer events with their target phase. | Reported as planning signal, not as a mistake. No lesson by default. |

Changes:

- **Events.** New kinds in `cli/lib/events.ts`: `feedback-commit` (one per
  pushed loop commit: `sha`, `text` = the item ids) and `triage` (one per
  applied batch: `text` = JSON of item id, proposed bucket, final bucket,
  whether the draft was edited, defer target). `planet-pr-feedback` writes
  them when it applies a batch.
- **Retro inputs.** `planet retro inputs` returns these events with the
  others.
- **Refinement sweep.** `planet-retro`'s `references/refinement-brief.md`
  gets the loop commit shas. It categorizes own refinements and loop commits
  as two separate tables, so the categories (naming, tests, ...) stay
  comparable.
- **Prompts.** Shorthand replies and other prompts made while a batch is open
  are tagged as loop prompts, so they pair with loop commits, not own
  refinements. The builder picks the mechanism (session step marker set to
  `pr-feedback` while a batch is open, or batch time windows).
- **Lesson targets.** `planet-pr-feedback` is added to `RETRO_SKILLS` in
  `cli/lib/retro.ts`, so `planet-feedback-review` can turn repeated triage
  overrides into edits to the new skill.
- **Retro body.** One more section, "Review feedback", after Refinements: the
  reviewer-driven table, the override count with one example per kind, and the
  deferred items with targets.

## Testing

- CLI: unit tests with the fake `Gh`, as today: notified and handled filtering, watcher exit
  conditions, new GraphQL fields.
- Skill: writing-skills baseline first. Pressure cases: a wake-up mid-planning
  (does it summarize and stop instead of taking over?), "obvious" items that
  tempt a push without approval, a weigh item that tempts a diff, a crash-left
  worktree.

## Left to the builder

- Poll interval default and backoff numbers.
- Exact shorthand grammar, as long as the example above parses.
- Where the triage file's diffs come from (`git format-patch` or `git diff`).
- Whether marks live in frontmatter or a sidecar.

## Calls made without the user (check these)

- Retro: deferred items produce no lesson by default.
- Retro: own refinements and loop commits get separate category tables.

- Weigh items get an assessment only; no diff until moved to do.
- CI failures are feedback items and go through the same buckets.
- Items have notified and handled marks; only un-notified items wake the chat.
- The watcher's last line names the skill to invoke; `go` stays not model-invocable.
- Feedback commits are additive even on a draft PR.
- The local PR branch is fast-forwarded after pushes, and deleted with `-D` on merge after a head-sha check.
- Worktree is detached, no local branch; removed after every batch.
- Remote branch deletion is left to GitHub.
- Replies are posted only for items the user approved in the shorthand.
- The PR author's own comments never wake the chat.
