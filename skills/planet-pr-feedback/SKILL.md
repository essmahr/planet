---
name: planet-pr-feedback
description: "Only invoked by the Planet router or by a planet watch line naming it, never on its own, for a phase whose PR has new feedback, merged, or closed. Do not use outside a Planet session."
user-invocable: false
allowed-tools: Bash(planet *), Bash(git *), Bash(gh pr view *), Bash(gh pr comment *), Bash(gh api *)
compatibility: Claude Code with the planet plugin loaded, run from the epic's repo. gh authenticated.
metadata:
  version: 0.1.0
---

# Planet: PR feedback

Input: `epic: <slug>`, `phase: <N>`, `event: <feedback|merged|closed|stopped>`, and `dir: <path>` from the router. A `planet watch` line has no `dir`: take `paths.dir` from `planet epic show <slug> --json --brief`. The user's reply to a batch is handled here too (step 7).

## Critical rules

- Nothing is pushed and no GitHub reply is posted until the user's shorthand reply names that item. That holds for obvious fixes, on a draft PR, and after an earlier "just do them": a standing approval means draft now, not push. `planet-implement`'s push policy does not apply inside this loop.
- Pushed commits are additive: never amend, rebase, or force push anything already on the PR branch. Unpushed drafts in the worktree may be rewritten.
- Every edit and commit happens in the worktree from `references/worktree.md`, never in the user's checkout. Its prune and leftover cleanup run before every create.
- A weigh item gets a two or three sentence assessment only: no edit, diff, or snippet, even for a one-line fix. It gets a commit only after the user moves it to do.
- Chat shows the batch and short reports, never a diff; diffs live in the triage file.
- A wake-up during other work (planning, implementing, a question to the user) shows the batch and ends the turn. Do not continue or answer the other work in the same turn.
- Store writes go only through `planet`; files only under `<dir>/research/`.

## Steps

1. **Marker.** Save the output of `planet session show --json`. With `null`, run `planet session start <slug> --phase <N> --step pr-feedback`; else `planet session step pr-feedback --phase <N>`. Before ending any turn of this skill, restore the saved step and phase with `planet session step <step> --phase <phase>`; a saved `null`, or a saved step that was null, stays `pr-feedback`. Then go by `event`.
2. **merged.** `planet sync <slug> --force`. `planet pr feedback <slug> <N> --new --json` for `head_ref` and `head_sha`. Clean up per `references/worktree.md` (Merged or closed). Ask with AskUserQuestion: `Retro now`, `Retro later`. Now: `planet session step retro --phase <N>`, then invoke `planet:planet-retro` with `epic`, `dir`, `phase`. Later: say the router shows retro pending for this phase. Restore the marker; return `phase <N> merged`.
3. **closed.** Clean up per `references/worktree.md` (Merged or closed, step 1 only). Say the PR closed without a merge. Restore the marker; return `phase <N> closed`.
4. **stopped.** Say the watcher's reason from its output, and that `/planet:go <slug> pr feedback <N>` restarts it. Restore the marker; return `watcher stopped for phase <N>: <why>`.
5. **feedback: triage.** `planet pr feedback <slug> <N> --new --json`. Number the items per `references/batch-format.md`. Put each in one bucket:
   - **do**: agreed, and the fix fits the phase. A failing check is usually do.
   - **weigh**: a design question, or a change in behavior a reasonable reviewer could disagree with.
   - **refute**: wrong, or a bot false positive. Draft a reply giving the reason.
   - **defer**: valid but outside this phase. Pick phase M or follow-up and draft a reply.
   CI items get no reply. Items that share a fix share a do commit.
6. **feedback: draft and show.** With any do item, create the worktree per `references/worktree.md`. For each do commit: edit in the worktree, run the narrowest relevant check, then `git -C <path> commit -m "<message>"`, lowercase imperative. Do not push. Write the triage file `<dir>/research/pr-feedback-<N>.md` per `references/batch-format.md`. Run `planet pr feedback mark <slug> <N> notified <every shown id>`. Show the batch per `references/batch-format.md`. Restart the watcher: Bash with `run_in_background`, `planet watch <slug> <N>`. Restore the marker; return `feedback shown for phase <N>`. The turn ends here.
7. **The shorthand reply.** The user's next message answers the batch. Set the marker as in step 1. Map numbers to ids from the triage file. Apply per `references/batch-format.md`, in this order:
   1. Draft commits for items moved to do, and apply free-text edits, in the worktree. Recreate the worktree first if it is gone.
   2. `git -C <path> push origin HEAD:<head_ref>`, when there is a commit.
   3. Post replies for refute and defer items only, with the edited text when given. A `comment` item: `gh api repos/<owner>/<repo>/pulls/<pr>/comments/<id>/replies -f body='<reply>'`, the id being the number after `discussion_r` in its url. A `review` or `conversation` item: `gh pr comment <pr> --body '<reply>'`. A `check` item, a do item, or a skipped item: none.
   4. Per pushed commit: `planet phase event <slug> <N> feedback-commit '<space-separated ids>' --sha <sha>`.
   5. One `planet phase event <slug> <N> triage '<json>'`, an entry `{id, proposed, final, edited, merged_into, defer_to}` per item the reply named; `final` is do, weigh, refute, defer, or skip.
   6. `planet pr feedback mark <slug> <N> handled <ids>` for every item the reply named. Unnamed items stay notified.
   7. Fast-forward the local branch and remove the worktree per `references/worktree.md` (After the push).
   8. Report one line per pushed commit and per posted reply. Restore the marker; return `feedback applied for phase <N>`.

## Troubleshooting

- `--new` returns no items: another session handled them. Say so, restart the watcher, restore the marker, and return `feedback shown for phase <N>`.
- A do fix fails its check: drop the edit, move the item to weigh, and put the failure in its assessment.
- The push is rejected because the branch moved: `git -C <path> fetch origin <head_ref>`, rebase the unpushed drafts onto `origin/<head_ref>`, push again. Never force.
- A reply fails to post: report it and leave that item unhandled.
- The reply asks a question about an item instead of giving shorthand: answer it, apply nothing, and keep the batch open.
- Items span several PRs in `prs`: handle one PR at a time, each with its own `head_ref`.
