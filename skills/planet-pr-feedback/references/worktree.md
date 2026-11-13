# Worktree

Drafts live in a detached worktree on the PR branch, so the user's checkout is
never touched, whatever branch it is on.

Path: `<repo root>/../.planet-worktrees/<repo name>-<slug>-<N>-pr<number>`.
This is the `worktree` field of `planet pr signals`; use that value. A phase
with several open PRs has one worktree per PR. Never inside the repo's working
tree. No local branch is created. Run git there with `git -C <path>`.

The worktree lives across wakes while drafts are unpushed.

## Set up, at the start of every wake

- Path missing: `git worktree prune`, `git fetch origin <head_ref>`, then
  `git worktree add --detach <path> origin/<head_ref>`.
- Path present: `git -C <path> fetch origin <head_ref>`, then
  `git -C <path> rebase origin/<head_ref>`. On a conflict,
  `git -C <path> rebase --skip` drops that draft. Repeat until the rebase ends.
- A check needs setup the worktree lacks (dependencies, codegen): run the
  repo's setup there first.

## Drafts

- Drop a draft: `git -C <path> rebase --onto <sha>^ <sha>`. Every 👍 named by
  its `Feedback` trailers is open again unless the user removed it. On a
  conflict, `git -C <path> rebase --abort` and tell the user.
- Revise a draft: make the change, `git -C <path> add -A`,
  `git -C <path> commit --fixup <sha>`, then
  `git -C <path> rebase --autosquash origin/<head_ref>`.
- List drafts: `git -C <path> log --format='%h %s' origin/<head_ref>..HEAD`.

## After the push

1. Check `git worktree list --porcelain` for `branch refs/heads/<head_ref>`.
   - Listed: the branch is checked out somewhere. Say the local branch is
     behind origin and leave it.
   - Not listed, and `git rev-parse --verify --quiet refs/heads/<head_ref>`
     finds it: `git fetch origin <head_ref>:<head_ref>` to fast-forward it.
     When that fails because the local branch diverged, say so and leave it.
   - No local branch: nothing to do.
2. Remove the worktree with `git worktree remove <path>` only when
   `git -C <path> log origin/<head_ref>..HEAD` is empty. Kept drafts stay.

## Merged or closed

1. Every path in `git worktree list --porcelain` under `.planet-worktrees/`
   named `<repo name>-<slug>-<N>`, with any suffix (old session-suffixed paths
   included): first count its unpushed drafts with
   `git -C <path> log --oneline origin/<head_ref>..HEAD`, then
   `git worktree remove --force <path>`. Then `git worktree prune`. Those
   drafts are discarded.
2. Merged only, for the local `<head_ref>`: delete it with
   `git branch -D <head_ref>` only when it is not checked out (step 1 of After
   the push) and `git merge-base --is-ancestor <head_ref> <head_sha>` succeeds,
   with `head_sha` from the merged entry in `prs`. A squash merge passes this
   check where `git branch -d` refuses. Any failure, an unknown sha included,
   keeps the branch; say so.
3. Leave the remote branch to GitHub.
