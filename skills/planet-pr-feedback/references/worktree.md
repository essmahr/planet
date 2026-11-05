# Worktree

Drafts live in a detached worktree on the PR branch, so the user's checkout is
never touched, whatever branch it is on.

Path: `<repo root>/../.planet-worktrees/<repo name>-<slug>-<N>-<sid>`, where
`<sid>` is `${CLAUDE_CODE_SESSION_ID:0:8}`. Each session drafts in its own
path, so a session that took the phase over never touches the old owner's
drafts. The repo root
is the parent of `git rev-parse --path-format=absolute --git-common-dir`, so a
session running in a linked worktree still gets the main checkout's root, not
its own. Never inside the repo's working tree. No local branch is created. Run git there with `git -C <path>`.

## Create, at the start of every batch

1. `git worktree prune`.
2. When this session's path still exists, a crash left it: `git worktree remove --force <path>`.
   Its edits and unpushed commits were drafts; the batch redrafts them.
   Never remove another session's path here.
3. `git fetch origin <head_ref>`.
4. `git worktree add --detach <path> origin/<head_ref>`.

Never reuse a worktree left from an earlier batch, and never create a second
one beside a leftover.

## After the push

1. Check `git worktree list --porcelain` for `branch refs/heads/<head_ref>`.
   - Listed: the branch is checked out somewhere. Say the local branch is
     behind origin and leave it.
   - Not listed, and `git rev-parse --verify --quiet refs/heads/<head_ref>`
     finds it: `git fetch origin <head_ref>:<head_ref>` to fast-forward it.
     When that fails because the local branch diverged, say so and leave it.
   - No local branch: nothing to do.
2. `git worktree remove <path>`.

## Merged or closed

1. Every path in `git worktree list --porcelain` under `.planet-worktrees/`
   named `<repo name>-<slug>-<N>`, with or without a `-<sid>` suffix:
   `git worktree remove --force <path>`. Then `git worktree prune`.
2. Merged only, for the local `<head_ref>`: delete it with
   `git branch -D <head_ref>` only when it is not checked out (step 1 of After
   the push) and `git merge-base --is-ancestor <head_ref> <head_sha>` succeeds,
   with `head_sha` from the merged entry in `prs`. A squash merge passes this
   check where `git branch -d` refuses. Any failure, an unknown sha included,
   keeps the branch; say so.
3. Leave the remote branch to GitHub.
