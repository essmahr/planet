---
name: planet-pr-feedback
description: "Only invoked by the Planet router or by a planet watch line naming it, never on its own, for a phase whose PR has new feedback, merged, or closed. Do not use outside a Planet session."
user-invocable: false
allowed-tools: Bash(planet *), Bash(git *), Bash(gh pr view *), Bash(gh pr comment *), Bash(gh api repos/*/pulls/*/comments/*/replies *)
compatibility: Claude Code with the planet plugin loaded, run from the epic's repo. gh authenticated.
metadata:
  version: 0.2.0
---

# Planet: PR feedback

Input: `epic: <slug>`, `phase: <N>`, `event: <feedback|merged|closed|stopped>`, and `dir: <path>` from the router, which may add `retro: router`. A `planet watch` line has no `dir`: take `paths.dir` from `planet epic show <slug> --json --brief`. The user's reply to a batch is handled here too (step 7).

## Critical rules

- Nothing is pushed and no GitHub reply is posted until the user's shorthand reply names that item. That holds for obvious fixes, on a draft PR, and after an earlier "just do them": a standing approval means draft now, not push. `planet-implement`'s push policy does not apply inside this loop.
- Pushed commits are additive: never amend, rebase, or force push anything already on the PR branch. Unpushed drafts in the worktree may be rewritten.
- Every edit and commit happens in the worktree from `references/worktree.md`, never in the user's checkout. Its prune and leftover cleanup run before every create.
- A weigh item gets a two or three sentence assessment only: no edit, diff, or snippet, even for a one-line fix. It gets a commit only after the user moves it to do.
- Chat shows the batch and short reports, never a diff; diffs live in the triage file.
- A watcher wake-up in a session whose saved marker names another phase or epic triages nothing: it says in one line that phase <N> has review feedback, and ends the turn. A wake-up during other work on this phase shows the batch and ends the turn, leaving that work for later.
- Store writes go only through `planet`; files only under `<dir>/research/`.

## Steps

1. **Marker.** Save the output of `planet session show --json`. With `null`, or a saved epic other than `<slug>`, run `planet session start <slug> --phase <N> --step pr-feedback`; else `planet session step pr-feedback --phase <N>`. Before ending any turn of this skill, restore the saved marker: `planet session step <step> --phase <phase>` for the same epic, `planet session start <saved epic> --phase <phase> --step <step>` for another, omitting `--phase` when the saved phase is null. A saved `null` marker stays `pr-feedback`; a saved null step stays `pr-feedback` for the same epic and omits `--step` for another. Then go by `event`.
2. **merged.** `planet sync <slug> --force`. `planet pr feedback <slug> <N> --new --json`; take `head_ref` and `head_sha` from the entry in `prs` whose state is merged. Clean up per `references/worktree.md` (Merged or closed). With `retro: router`, restore the marker and return `phase <N> merged` now; the router runs retro. Else ask with AskUserQuestion: `Retro now`, `Retro later`. Now: `planet session step retro --phase <N>`, invoke `planet:planet-retro` with `epic`, `dir`, `phase`, and leave the marker on retro. Later: say the router shows retro pending for this phase, and restore the marker. Return `phase <N> merged`.
3. **closed.** Clean up per `references/worktree.md` (Merged or closed, step 1 only). Say the PR closed without a merge. Restore the marker; return `phase <N> closed`.
4. **stopped.** Say the watcher's reason from its output, and that `/planet:go <slug> pr feedback <N>` restarts it. Restore the marker; return `watcher stopped for phase <N>: <why>`.
5. **feedback: triage.** `planet pr feedback <slug> <N> --new --json`. Number the items per `references/batch-format.md`. Put each in one bucket:
   - **do**: agreed, and the fix fits the phase. A failing check is usually do.
   - **weigh**: a design question, or a change in behavior a reasonable reviewer could disagree with.
   - **refute**: wrong, or a bot false positive. Draft a reply giving the reason.
   - **defer**: valid but outside this phase. Pick phase M or follow-up and draft a reply.
   CI items get no reply. Items that share a fix share a do commit.
6. **feedback: draft and show.** With any do item, create the worktree per `references/worktree.md`. For each do commit: edit in the worktree, run the narrowest relevant check, then `git -C <path> commit -m "<message>"`, lowercase imperative. Do not push. Write the triage file `<dir>/research/pr-feedback-<N>.md` per `references/batch-format.md`. Run `planet pr feedback mark <slug> <N> notified <every shown id>`. Show the batch per `references/batch-format.md`, then run `planet pr feedback await <slug> <N>` so the next prompt is captured as the reply. Restart the watcher: Bash with `run_in_background`, `planet watch <slug> <N>`; its exit with `watcher already running` needs no action. Restore the marker; return `feedback shown for phase <N>`. The turn ends here.
7. **The shorthand reply.** The user's next message answers the batch. Set the marker as in step 1. Map numbers to ids from the triage file and parse per `references/batch-format.md`. Apply per `references/apply.md`: rebuild the drafts so only the reply's do items are above `origin/<head_ref>`, push, post replies, record events, mark handled, clean up. Restore the marker; return `feedback applied for phase <N>`.

## Troubleshooting

- `--new` returns no items: another session handled them. Say so, restart the watcher, restore the marker, and return `feedback shown for phase <N>`.
- A do fix fails its check: drop the edit, move the item to weigh, and put the failure in its assessment.
- The push is rejected because the branch moved: recreate the worktree at the new `origin/<head_ref>` and re-apply the drafts per `references/apply.md`, then push again. Never rebase or force.
- A `planet watch` exits with `watcher already running (pid <p>)` and no invoke line: another watcher covers that phase. Do nothing and say nothing.
- A reply fails to post: report it and leave that item unhandled.
- The reply asks a question about an item instead of giving shorthand: answer it, apply nothing, and keep the batch open.
- Items span several PRs in `prs`: handle one PR at a time, each with its own `head_ref`.
