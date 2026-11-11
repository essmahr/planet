# PR feedback

Two routes into `planet:planet-pr-feedback`. Each runs step 6 (repo check)
for phase N first and passes `epic: <slug>`, `dir: <epic.paths.dir>`, and `phase: N`.

## The request `pr feedback [N]` (step 11)

1. Default N: the lowest phase with a non-empty `open_prs`. None: say so, stop.
2. Pick `event` from phase N in the payload's `phases`:
   - non-empty `open_prs`: `feedback`.
   - else non-empty `merged_prs`: `merged`.
   - else run `planet pr feedback <slug> <N> --json`. Empty `prs`: say no PR
     is linked to phase N, stop. Otherwise `closed`.
3. Invoke the skill with that `event`. End the turn on its last line.

## Merged cleanup before retro (step 7)

A merge seen by `planet sync` instead of a watcher ships the phase with its
worktree and local branch still in place. So before dispatching retro for a
phase with a non-empty `merged_prs`, invoke the skill with `event: merged` and
`retro: router`. It cleans up, skips its retro question, and returns
`phase N merged`. That return does not end the turn: dispatch retro per step 7.
The cleanup is safe to repeat, so do this on every such retro dispatch.
