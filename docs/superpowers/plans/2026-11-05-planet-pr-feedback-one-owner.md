# Planet PR feedback: one owner session per phase

**Status:** implemented 2026-11-05 with the decisions below. Stacked on `feedback-review/2026-11-05`; that branch does not merge to main until this lands.

**Goal:** One batch of review feedback is triaged, drafted, and applied by exactly one Claude session.

**Supersedes:** the spec's non-goal "Enforcing one session per PR ... overlap is the user's to manage" (`docs/superpowers/specs/2026-11-04-planet-pr-feedback-loop-design.md`). The 2026-11-05 incident shows overlap is not manageable by the user: both sessions acted on one prompt each.

## What happened

On 2026-11-05, mcp-apps-architecture phase 7's feedback was triaged twice. Session A ("Linear project structure for MCP apps") had started the watcher in `planet-implement` and moved on to phase 8. Session B ("[MCP apps] view scaffolding") was where the user worked. Both drafted commits into the same worktree.

## Failure modes

1. **The watcher wakes whoever started it.** `planet watch` runs as a background Bash task in the session that ran `planet-implement`. The pid file (`run/<slug>-<N>.pid`) holds only a pid, so nothing records which session should act. When A moves to phase 8, A still gets the wake-up. Commit `d072471` (on `feedback-review/2026-11-05`) makes A say one line instead of triaging. That stops A from acting, but no session is then on the hook for the batch.
2. **The pending note reaches every session on the epic.** `pendingNote` (`cli/lib/pending-note.ts`) runs for any session whose marker names the epic. Its line points at `/planet:go <epic> pr feedback <N>`, so B and A can both run step 5. `planet pr feedback --new` filters only `handled`; `notified` items come back to every caller. Nothing stops two sessions from triaging the same items.
3. **The worktree path is shared.** `<repo root>/../.planet-worktrees/<repo>-<slug>-<N>` has no session in it. The create step's `git worktree remove --force` treats any existing path as a crash leftover, so B's batch deletes A's unpushed drafts, or both commit into one HEAD.
4. **The reply flag is taken by any session.** `takeAwaitedPhase` (`cli/commands/capture.ts`) clears `awaiting_reply` on the next prompt in *any* session on the epic. If B shows the batch and the user next types in A, A's prompt is logged as the review reply and B's reply is logged as planning.
5. **Marks writes race.** `addMarks`, `recordCheck`, and `setAwaitingReply` read, modify, and rewrite the marks file with no lock. Two sessions (or a session and its hook) can drop each other's ids. Low odds today, but a claim built on this file needs an atomic write.
6. **Drafts' design choices are only in the triage file.** Chat shows `commit A: rename foo to fooBar (+1 caller)`. A commit that adds a file or moves an export looks the same, so the user must open the triage file to see it before replying `do`.

## Proposed design

One concept: each phase with open PRs has at most one **feedback owner**, a Claude session id stored in the marks file. Only the owner triages, drafts, receives the reply, and runs the watcher.

### Ownership

- Marks gain `owner: { session: string, since: string } | null`.
- `planet watch` claims the phase when it has no live owner. `planet-implement` starts the watcher, so the session that opened the PR owns it by default.
- `planet pr feedback <slug> <N> --new --claim` returns items only to the owner, or to anyone when there is no owner (and then sets the owner). Another session gets exit 3 and `phase <N> feedback is owned by session <id>`.
- `planet pr feedback take <slug> <N>` moves ownership to the calling session. `planet-pr-feedback` step 5 runs it when `--claim` exits 3, after one AskUserQuestion that warns it takes over session <id> and stops its watcher (`Take it here`, `Leave it`). Starting a new session is easy, so a take must never be silent.
- Ownership ends on `SessionEnd` (capture hook clears every phase the ending session owns). An owner left on a merged or closed phase is harmless: nothing polls it. An owner whose marker file is gone (crash, `/clear`) counts as no owner.
- Every marks write goes through `updateMarks`, under a lock file in the ignored `run/` folder (`open(..., "wx")`, retried for 2 s, broken after 10 s). This fixes failure mode 5.

### Watcher bound to the owner

- `planet watch` reads `CLAUDE_CODE_SESSION_ID` and writes `<pid> <session>` to the pid file.
- Started by a non-owner while an owner exists: exits at once with `phase <N>: owned by session <id>`, no invoke line.
- A watcher whose pid file names another owner's watcher replaces it: the new owner writes its own pid line. The old watcher checks the pid file each poll and exits with `phase <N>: watcher handed to session <id>`, no invoke line. Today a take would hit `watcher already running` until the old one died.
- Each poll the watcher checks `owner`. Ownership moved away: same silent exit.
- The owner's marker on another phase or epic (failure mode 1): the wake-up still fires in the owner, and keeps `d072471`'s rule, rewritten for ownership: say in one line that phase <N> has review feedback and that `pr feedback <N>` handles it here, then end the turn. Since this session still owns it, the user can answer in place or take it elsewhere.

### Pending note

`pendingNote` skips phases owned by another live session. The owner, and every session when there is no owner, still get the line. Failure mode 2 is closed by this plus `--claim`.

### Reply flag

`awaiting_reply` becomes `string | null`: the session id that showed the batch. `takeAwaitedPhase` consumes it only when `input.session_id` matches. Old `true` values read as `null` (no reply awaited), which drops at most one in-flight reply.

### Per-session worktree

Path: `<repo root>/../.planet-worktrees/<repo>-<slug>-<N>-<first 8 chars of session id>`.

- Create removes only its own leftover path.
- Other sessions' paths are never removed during a batch; they wait for the merged or closed cleanup. Checking whether their session is live would mean reading the store by hand.
- Merged or closed cleanup removes every path for that phase.

With ownership enforced, one path would almost suffice. The suffix covers the window right after a take, when the old owner may be mid-draft in the same turn. It costs one glob and a longer path.

### Design choices named in chat

`batch-format.md`: under each do commit, add one `choices:` line when the commit adds or deletes a file, moves or renames an export, adds a dependency, or changes an exported signature. Example: `choices: new src/hooks/useFoo.ts; moves fooBar export from a.ts to b.ts`. Still never a diff.

`apply.md`: a commit drafted at step 7 (weigh to do, merge into, free-text edit) that makes any such choice is shown with its `choices:` line, and the push waits for AskUserQuestion (`Push`, `Hold`). Commits with no choices push as today.

## Trade-offs and alternatives

- **Claim per batch instead of owner per phase.** A claim from step 5 to step 7 is narrower, but drafts, `notified` items, the reply flag, and the watcher all span batches. A per-batch claim would need its own release rules for each. One owner per phase is simpler to reason about.
- **Owner follows the marker** (the session whose marker is on phase N owns it). No new state, but markers move inside the feedback skill itself (`step pr-feedback --phase N`, then restore), and a session planning phase 8 while phase 7 is in review is the normal flow. Ownership would flicker. Rejected.
- **Silence the watcher while the owner is on another phase** (keep polling, never wake). Avoids the interrupt, but then only the pending note says anything, and only on the next prompt. Kept the one-line wake instead.
- **Stale owners after a crash.** Marker files outlive a crashed session, so a dead owner can block `--claim`. `take` is the escape hatch; the AskUserQuestion makes it one click. A time-based expiry was rejected: a long-idle owner is still the right session.
- **Other harnesses.** `CLAUDE_CODE_SESSION_ID` must reach Bash for the watcher and CLI. `planet session` already depends on it, so this adds no new requirement.

## Changes

### CLI

1. `cli/lib/pr-items.ts`: `Marks.owner`, `Marks.awaiting_reply: string | null` with `true` read as `null`, `updateMarks` used by every marks writer, `claimOwner`, `takeOwner`, `releaseOwner(session)`, and `liveOwner` (owner whose marker file exists).
2. `cli/commands/pr.ts`: `--claim` on `pr feedback --new` (exit 3 when owned elsewhere); new `pr feedback take <slug> <N>`; `pr feedback await` stores the session id. Usage line and `cli/planet.ts` USAGE updated.
3. `cli/commands/watch.ts`: pid file `<pid> <session>`; refuse when owned by another live session; replace a watcher of a different session; per-poll check of pid file and owner, silent exit lines `owned by session <id>` and `watcher handed to session <id>`.
4. `cli/lib/pending-note.ts`: skip phases with a live owner other than the prompting session (`pendingNote` gains the session id).
5. `cli/commands/capture.ts`: `takeAwaitedPhase` matches `input.session_id`; `SessionEnd` releases ownership held by the session.
6. Tests: `test/pr-items.test.ts`, `test/watch.test.ts`, `test/capture.test.ts`, `test/session.test.ts`, `test/pr-feedback.test.ts` (claim conflict, take, stale owner, watcher handoff, reply flag per session, lock retry).

### Skills

1. `skills/planet-pr-feedback/SKILL.md`: owner rule; step 5 uses `--new --claim`, and exit 3 asks `Take it here` / `Leave it` with the takeover warning; step 7 reruns the claim and applies nothing when another session took the phase; the silent watcher exits join "do nothing, say nothing". Version 0.3.0; word budget 950 to 1020.
2. `references/worktree.md`: per-session path; create removes only its own leftover; merged or closed removes every path for the phase.
3. `references/batch-format.md`: the `choices:` line.
4. `references/apply.md`: unshown step-7 drafts with choices wait for `Push` / `Hold`.
5. No change to `planet-implement` or the `go` router: the watcher claims, and the take question lives in the skill.

## Decisions

1. A take always asks first and names the session it takes over. Starting a new session is easy, so taking over one by accident must not be.
2. The `Push` / `Hold` stop for step-7 drafts with design choices ships in this change.
3. `d072471` stays on `feedback-review/2026-11-05`, unmerged. This change builds on it and rewrites its rule in terms of ownership; both reach main together.
