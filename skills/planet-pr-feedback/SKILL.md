---
name: planet-pr-feedback
description: "Only invoked by the Planet router or by a planet watch line naming it, never on its own, for a phase whose PR has new feedback, merged, or closed. Do not use outside a Planet session."
user-invocable: false
allowed-tools: Bash(planet *), Bash(git *), Bash(gh pr view *), Bash(gh pr comment *), Bash(gh api repos/*/pulls/*/comments/*/replies *)
compatibility: Claude Code with the planet plugin loaded, run from the epic's repo. gh authenticated.
metadata:
  version: 0.4.0
---

# Planet: PR feedback

Input: `epic: <slug>`, `phase: <N>`, `event: <merged|closed|stopped>`, and `dir: <path>` from the router, which may add `retro: router`. A `planet watch` line has no `dir`: take `paths.dir` from `planet epic show <slug> --json --brief`.

## Critical rules

- Every edit and commit happens in the worktree from `references/worktree.md`, never in the user's checkout. Its prune and leftover cleanup run before every create.
- Store writes go only through `planet`; files only under `<dir>/research/`.

## Steps

1. **Marker.** Save the output of `planet session show --json`. With `null`, or a saved epic other than `<slug>`, run `planet session start <slug> --phase <N> --step pr-feedback`; else `planet session step pr-feedback --phase <N>`. Before ending any turn of this skill, restore the saved marker: `planet session step <step> --phase <phase>` for the same epic, `planet session start <saved epic> --phase <phase> --step <step>` for another, omitting `--phase` when the saved phase is null. A saved `null` marker stays `pr-feedback`; a saved null step stays `pr-feedback` for the same epic and omits `--step` for another. Then go by `event`.
2. **merged.** `planet sync <slug> --force`. `planet pr feedback <slug> <N> --json`; take `head_ref` and `head_sha` from the entry in `prs` whose state is merged. Clean up per `references/worktree.md` (Merged or closed). With `retro: router`, restore the marker and return `phase <N> merged` now; the router runs retro. Else ask with AskUserQuestion: `Retro now`, `Retro later`. Now: `planet session step retro --phase <N>`, invoke `planet:planet-retro` with `epic`, `dir`, `phase`, and leave the marker on retro. Later: say the router shows retro pending for this phase, and restore the marker. Return `phase <N> merged`.
3. **closed.** Clean up per `references/worktree.md` (Merged or closed, step 1 only). Say the PR closed without a merge. Restore the marker; return `phase <N> closed`.
4. **stopped.** Say the watcher's reason from its output, and that `/planet:go <slug> pr feedback <N>` restarts it. Restore the marker; return `watcher stopped for phase <N>: <why>`.

## Troubleshooting

- A `planet watch` exits with no invoke line (`already running`): another session covers that phase. Do nothing and say nothing.
- The phase has several PRs: handle one PR at a time, each with its own `head_ref`.
