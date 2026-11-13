---
name: planet-pr-feedback
description: "Only invoked by the Planet router or by a planet watch line naming it, never on its own, for a phase whose PR has the user's reactions to act on, merged, or closed. Do not use outside a Planet session."
user-invocable: false
allowed-tools: Bash(planet *), Bash(git *)
compatibility: Claude Code with the planet plugin loaded, run from the epic's repo. gh authenticated.
metadata:
  version: 0.5.0
---

# Planet: PR feedback

Input: `epic: <slug>`, `phase: <N>`, `event: <feedback|merged|closed|stopped>`, and `dir: <path>` from the router, which may add `retro: router`. A `planet watch` line has no `dir`: take `paths.dir` from `planet epic show <slug> --json --brief`.

## Critical rules

- Nothing is pushed until the user says `push` in this session. A 👍 is never push approval.
- Pushed commits are additive: no amend, rebase, or force push on the PR branch. Unpushed drafts may be rewritten.
- Every edit and commit happens in the worktree from `references/worktree.md`.
- Chat never shows a diff. Diffs are in the patch file.
- Never post a reply, resolve a thread, or mention a comment the user has not reacted to. The only GitHub writes are `planet pr react` and the approved push.
- Never tell the user to run a command to restart or trigger feedback.
- A failing check is fixed only when the user asks in this session.
- Store writes go only through `planet`; files only under `<dir>/research/`.

## Steps

1. **Marker.** Save the output of `planet session show --json`, unless an earlier turn of this skill left it on `pr-feedback` for phase N; then keep the marker saved by that turn. With a saved `null`, or a saved epic other than `<slug>`, run `planet session start <slug> --phase <N> --step pr-feedback --json`; else `planet session step pr-feedback --phase <N> --json`. Its `session` field is this session's id. While any draft is unpushed, end every turn with the marker on `pr-feedback` for phase N. Once no draft remains, restore the saved marker per `references/marker.md` before ending the turn. Then go by `event`: `feedback` runs steps 2 to 9.
2. **Signals.** `git fetch origin`, then `planet pr signals <slug> <N> --json`. Handle only PRs whose `session` is this session. A `do` signal is a 👍; a `weigh` signal is a 👀.
3. **Pushed.** For each `do` signal in state `pushed`: `planet pr react <id> --add rocket --remove thumbs_up`.
4. **Orphans.** Each url in `orphans` is a draft whose 👍 was removed. Find its commit by the url and drop it, both per `references/worktree.md` (Drafts).
5. **Worktree.** Set up the PR's `worktree` per `references/worktree.md`. A draft that does not rebase onto the moved branch is dropped. Then run `planet pr signals <slug> <N> --json` again, so 👍 signals of dropped drafts read as `open`.
6. **Drafts.** For each `do` signal in state `open`: make the change, using `instruction` as direction when set. Run the narrowest relevant check. Stage with `git -C <worktree> add -A`, then commit with `git -C <worktree> commit -m "<one-line subject>" --trailer "Feedback: <signal url>"`. Signals that need the same change share one commit, one `--trailer` each.
   - Already on the branch: `planet pr react <id> --add rocket --remove thumbs_up`.
   - Not actionable, or the check cannot pass: discard the attempt, `planet pr react <id> --remove thumbs_up`, and keep the reason for the report.
7. **Takes.** For each `weigh` signal: a two or three sentence take and a recommendation, then `planet pr react <id> --remove eyes`. No edit and no commit.
8. **Report.** Write the patch file and show the report per `references/report.md`. Failing checks come from each PR's `failed_checks`.
9. **Watch.** Start `planet watch <slug> <N>` as a background Bash task (`run_in_background: true`), adding `--skip <key>` for each key this wake could not clear: `orphan:<url>` for a draft that would not drop, `<id>:do` or `<id>:weigh` for each signal on a PR skipped for a null worktree. Return `phase <N> feedback reported` and end the turn.
10. **Reply.** Handle the user's reply to the report per `references/report.md` (Replies).
11. **After a push.** Per pushed commit, take its sha from the log in `references/worktree.md` (Drafts), over the range just pushed: `planet phase event <slug> <N> feedback-commit '<space-separated signal ids>' --sha <sha>`, then `planet pr react <id> --add rocket --remove thumbs_up` for each of its signals. Then `references/worktree.md` (After the push).
12. **merged.** `planet sync <slug> --force`. `planet pr feedback <slug> <N> --json`; take `head_ref` and `head_sha` from the merged entry in `prs`. Clean up per `references/worktree.md` (Merged or closed), and say how many unpushed drafts it discarded. With `retro: router`, restore the marker and return `phase <N> merged`. Else ask with AskUserQuestion: `Retro now`, `Retro later`. Now: `planet session step retro --phase <N>`, invoke `planet:planet-retro` with `epic`, `dir`, `phase`, and leave the marker on retro. Later: say retro is pending, and restore the marker. Return `phase <N> merged`.
13. **closed.** Clean up per `references/worktree.md` (Merged or closed, step 1 only). Say the PR closed unmerged and how many unpushed drafts it discarded. Restore the marker; return `phase <N> closed`.
14. **stopped.** Say the watcher's reason. For `signal error (<message>)`, when `git fetch origin` or the worktree setup fixes it, do that and start the watcher as in step 9. Restore the marker; return `watcher stopped for phase <N>: <why>`.

## Troubleshooting

- A `planet watch` exits with no invoke line (`already running`, `no PR owned by this session`): do nothing and say nothing.
- No signal needs action: say so in one line, then run step 9.
- A PR's `worktree` is null: no checkout of the phase's repo is known. Say so and skip that PR.
- Several PRs: each has its own worktree, `head_ref`, and patch file section.
