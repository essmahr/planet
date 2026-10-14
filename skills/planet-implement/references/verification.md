# Verification setup

Prepare each Verification step yourself; never wait for the user. Before a step runs, put the app in the state it needs: after any branch switch, dependencies installed, generated code current, dev servers restarted, and stale browser pages closed; then whatever configuration, services, or data the step depends on.

When the phase changes something a user sees, screenshots come in before/after pairs of the same state: "before" from a worktree on the default branch, "after" from the phase branch. Attach both when opening the PR with `gh pr create --attach '<file>#<alt>'`.

A step you cannot perform blocks the phase; never record `implemented` with a step skipped.
