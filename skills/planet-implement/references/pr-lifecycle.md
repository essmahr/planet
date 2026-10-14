# PR lifecycle

Read at step 6, before the first push.

## Body

Draft the body with the user's `pr` skill when `~/.claude/skills/pr` exists.
Hand it the phase document's Context and Decisions, the commit list, each
deviation with its reason, and what Verification asked the body to carry, as
raw material; its recipe sets the structure and the length. Without that skill,
follow the repo's PR template with the same material.

## Push policy

While the PR is a draft and nobody but the author has reviewed it: push,
force-push after fixups, and apply the body edits the user asks for, then
report what changed. Ask nothing first. Once anyone else has reviewed
(`gh pr view <n> --json reviews,comments`), ask before a force-push; body edits
still apply. A body edit changes only the asked-for text in the live body
(`gh pr view <n> --json body`), never a whole body written over someone else's
edits.

## Default branch moved, or a stacked base landed

While the PR is a draft with no reviews, rebase onto the default branch. After
an approval or review comments, merge the default branch in instead, since a
rebase needs a force-push. A stacked branch (the router passed `base:`)
rebases onto the default branch once its base merges, then is retargeted with
`gh pr edit <n> --base <default>`. Rerun Verification after either.

## Record once

`planet phase event <slug> <N> implemented --sha <sha>` runs once per PR, at
step 7. A rebase before the author's own changes re-records it at the new tip,
so the retro's refinement window starts there. Never re-record after the
author's changes; the window would then measure nothing.

## Checks

A failing check named by the PR status is real until that check's own log says
otherwise; a check missing from a check-runs query may still be running. Query
a PR's state before its mergeability fields; GitHub reports mergeable UNKNOWN
on a merged PR.
