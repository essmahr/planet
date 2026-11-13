# PR feedback, GitHub first

Replaces the PR feedback loop from `2026-11-04-planet-pr-feedback-loop-design.md`.

## Why

The current loop has two problems.

1. The agent sorts every item into do, weigh, refute, or defer. The user then answers by item name in shorthand. Tracking the buckets and naming items is a burden.
2. `pendingNote` adds a reminder to every prompt for each phase with unseen items, in sessions doing unrelated work.

Watching the PR in the background works and stays.

## Intent

Triage happens on GitHub, by the user, once. The agent reads the user's reactions and acts on them. It never sorts items, never drafts replies, and never mentions items the user has not reacted to.

## Signals

Only the viewer's own reactions count (`reactionGroups { content viewerHasReacted }`). Review comments, review bodies, and conversation comments all accept reactions.

| User does on GitHub | Agent does | Marker |
|---|---|---|
| 👍 on a comment | Drafts one commit in the worktree. No push. | 👍 stays until the push, then the agent swaps it for 🚀 |
| 👍 plus a reply of their own on the thread | Same, with the reply as the instruction for the fix | Same |
| 👀 on a comment | Pulls the comment into the session, discusses it, gives a recommendation | The agent removes 👀 after the recommendation |
| Reply, no reaction | Nothing | None |
| Nothing | Nothing | None |

A 👍 that yields no commit ends too. When the change is already on the PR branch, the agent swaps 👍 for 🚀. When the comment is not actionable or the fix fails its check, the agent removes the 👍, discards any attempt, and gives the reason in the report. It adds no reaction in its place. Adding 👍 again retries.

After a 👀 discussion the user decides either way: "do it" in the session, or 👍 on GitHub. Both lead to the same draft.

The agent posts nothing on the PR: no replies, no thread resolution. Its only writes to GitHub are the reaction changes above and the approved push.

## State

GitHub and git hold all of it.

- Open work: comments with the viewer's 👍 or 👀.
- Drafted: an unpushed commit in the worktree with a `Feedback: <comment url>` trailer.
- Pushed: the comment has 🚀 and no 👍.

The trailer stays on the pushed commit, so the PR's commit list shows which comment each commit addresses. Feedback commits are multi-line for that reason. When a crash lands between the push and the 🚀 swap, the next wake reads the trailers on the pushed branch and finishes the swap.

The marks file goes away, along with notified, handled, pending, awaiting reply, owner, claim, and take.

## One session per PR

The session that opens a PR owns its feedback. The `gh pr create` hook links the PR to its phase today; it also has the session id, and now stores it on the link.

- Only the owning session runs the PR's watcher, receives its wakes, and takes the `push` reply.
- No other session hears about the PR, from a hook or a watcher.
- A session that opens several PRs owns each of them.
- `/planet:go <slug> pr feedback [N]` in another session moves ownership to that session. It is needed only after the owning session is archived or deleted. A PR linked without a session (by `planet sync`, or before this change) is owned by the first session that runs that command.

The owning session may move to another branch or phase, so drafts never go in its checkout. They go in the worktree below.

## Watcher

`planet watch <slug> <N>` keeps its poll loop, pid file, backoff, and its merged, closed, and stopped events. `planet-implement` still starts it after the PR opens.

The feedback event changes:

- It fires on the viewer's signals, not on new items. A signal is open when it is a 👀, or a 👍 with no drafted commit.
- It waits until the set of open signals is the same on two polls in a row, so several quick reactions make one wake.
- A 👍 removed after its draft also fires, so the draft can be dropped.
- Failing checks never fire it.

One watcher per phase, started only by the owning session. The pid file only prevents a double start. The handoff and owner checks in `watch.ts` go away.

The user never starts or restarts a watcher by hand, and the agent never asks them to.

- A gh failure does not stop the watcher. It keeps polling at the 15 minute backoff cap until gh works again. The `stopped` event remains only for a store error or a phase with no linked PR.
- The skill restarts the watcher at the end of every wake, including a `stopped` wake whose cause it could fix.
- The `UserPromptSubmit` hook checks the open PRs the prompting session owns. When a PR's phase has no live watcher process, it adds one line telling the agent to start `planet watch <slug> <N>` in the background and say nothing about it. This covers a resumed session, an app restart, and a killed background task. The check reads the pid file only; it makes no gh call.
- A watcher started this way polls at once, so reactions made while no watcher was alive are handled on that first poll.

While the owning session is closed, reactions wait until its next prompt.

## The feedback session

On a wake:

1. Fetch the signals. Create the worktree if it does not exist.
2. For each open 👍: edit, run the narrowest relevant check, commit with the trailer. One commit per comment. Comments that need the same change share a commit with one trailer each.
3. For each 👀: give a two or three sentence take in chat and a recommendation. Remove the 👀. Discussion continues in the session if the user wants it.
4. Write the patch file and show the report.
5. Restart the watcher.

The report, in chat:

- One line per draft: comment link, commit subject, files touched.
- One line per 👀 take, above its recommendation.
- One line listing failing checks, if any. They are reported only here and fixed only when the user asks in the session.
- The patch file path.

The patch file is `<dir>/research/pr-feedback-<N>.md`: the report, then `git format-patch --stdout` output for each unpushed commit. It is rewritten on every report.

The user answers in the session:

- `push`: push every draft.
- `push except <item>`: push the rest; the named draft stays.
- Free text on a draft: revise it. Unpushed commits may be rewritten.
- `drop <item>`: remove the draft and the user's 👍.

After a push: swap 👍 for 🚀 on each pushed comment, and fast-forward the local branch as today. Remove the worktree only when no drafts remain.

Rules kept from the current loop:

- Nothing is pushed without the user's `push` in the session. A 👍 is never push approval.
- Pushed commits are additive. No amend, rebase, or force push on the PR branch.
- Edits and commits happen only in the worktree, never in the user's checkout.
- Chat never shows a diff.

## Worktree

As in `references/worktree.md`, with two changes:

- The path has the PR number and no session suffix: `<repo root>/../.planet-worktrees/<repo name>-<slug>-<N>-pr<number>`. A phase with several open PRs gets one worktree per PR. The patch file stays one per phase, with a section per PR.
- It lives across wakes while drafts are unpushed. It is no longer recreated per batch. A new wake fetches and, when the PR branch moved, rebases the unpushed drafts onto it.

Merged or closed cleanup stays. Unpushed drafts at that point are discarded, and the session says so.

## Removed

- `cli/lib/pending-note.ts` and its call in `capture.ts`. No hook mentions feedback items. The only hook line about PR feedback is the silent watcher restart.
- Marks, owner, claim, take, and awaiting reply in `cli/lib/pr-items.ts`, and the session-end owner release in `capture.ts`.
- `planet pr feedback` `--new`, `--claim`, `mark`, `await`, and `take`.
- The skill's triage, buckets, batch format, shorthand table, and drafted replies.
- The tests for all of the above.

## Build order

The user wants a reset, not additive edits to the old loop.

1. Remove the old loop: the skill, `skills/go/references/pr-feedback.md` routes that depend on it, pending note, marks, the `pr feedback` subcommands, tests, and the README paragraph. The watcher keeps only merged, closed, and stopped.
2. Build the new loop on top.

These are separate commits that ship together in one plugin version. After step 1 the skill is cut down to merged, closed, and stopped, so the watcher's `invoke` line and the router's merged cleanup before retro still work.

The three files under `skills/planet-pr-feedback/` have uncommitted edits. Step 1 discards them; confirm with the user first.

## Goals

- Zero chat input to triage. The only chat input is the push decision.
- Silence in every session until the user reacts on GitHub.
- No local state file for feedback.

## Non-goals

- Replying to reviewers or resolving threads.
- Acting on CI failures unasked.
- Sorting or summarizing comments the user has not reacted to.

## Anti-goals

- Any reminder about unreacted comments, in any session.
- A push that the user did not approve in the session after seeing the patch file.

## Approaches considered

Where drafts are reviewed:

1. Patch file in the epic dir. Picked: it opens in the app, needs no cleanup, and keeps drafts private.
2. A `<head_ref>-feedback` branch with a compare link. Keeps review on GitHub, but adds a branch per round, may run CI, and shows drafts to anyone browsing branches.
3. Diffs inline in chat. Noisy for anything beyond a small fix.

How a draft is linked to its comment:

1. A `Feedback:` trailer kept on the pushed commit. Picked by the user: it reads naturally to a person and survives amend and rebase.
2. Git notes. Rejected: it puts Planet internals into the repo's refs.
3. A trailer stripped at push. Rejected: the pushed shas would differ from the reviewed ones.

What 👍 means:

1. Draft only, push on a later `push`. Picked by the user: they review every diff before it is pushed.
2. Draft and push. Rejected.

## Calls made by the author, not the user

- A wake in the owning session acts whatever phase its marker is on, because the user's own reaction caused it.
- The agent removes 👀 after its first recommendation, not after the discussion ends.
- `drop` removes the user's 👍.
- Failing checks are listed only in a report that a signal already caused.
- One worktree per PR, with no session suffix.
- The 🚀 ending for a 👍 whose change is already on the branch.
- A PR linked without a session is owned by the first session that runs `pr feedback [N]` for it.
- Steps 1 and 2 ship in one version.

## Left to the builder

- The CLI surface for reading signals and changing reactions (for example `planet pr signals <slug> <N> --json`, `planet pr react`).
- How the session knows the user's next prompt is the push reply, now that `awaiting_reply` is gone. The session marker's `pr-feedback` step is one way.
- Item names in the report for `push except` and `drop`.
- Version bumps for the skill and the plugin.
