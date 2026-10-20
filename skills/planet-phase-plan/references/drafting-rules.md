# Drafting rules

Shared by `planet-phase-plan` and `plan`; read before clarifying. Paths are
relative to `skills/planet-phase-plan/`.

## Before the draft

- Draft from the code, not from memory. Before the draft states it, read it: a
  term the code already uses, a hook's real parameters before a code block
  calls it, a dependency PR's full diff before scoping on it, the repo's agent
  rules before keeping a pattern, the other sources of an entity a factory will
  return, a flaky failure reproduced before it is called a cause, and a
  library's or the browser's behavior proven in its installed source or a
  running page before the plan relies on it.
- Settle every decision that leaves the PR's shape alone: fallbacks, export
  names, type annotations, so implement makes none. A dependency-heavy
  approach is measured against its alternatives and asked about before drafting.

## The draft

- Every `references/phase-template.md` slot filled, Conventions checked and
  Decisions included.
- One Commits section per commit, in the user's git order: moves and renames
  first, refactors before behavior. A behavior change starts with a spec commit
  against the current code, then the change with its spec update. A signature
  change, or a pass over dozens of call sites, goes `red until N` rather than
  through an interim commit that accepts both shapes.
- Each section fills the template's fields in order, one per line, blank
  lines between.
- A comment the Change prescribes states a standing condition in the code,
  never the change or epic that made it, and a removal note names an
  observable condition or a ticket. Prescribe a comment only where the code
  does not already say it: none copied from a sibling when the constraint fails
  loudly, an existing comment at the same element folded in rather than kept
  beside it, and a shared reason checked at each site.
- A planned spec asserts what this code does, a call made or a user-visible
  effect, never a library's documented behavior or an updater the spec runs by
  hand, and uses the repo's shared test utilities for the area over the nearest
  sibling's mock style.
- Every file a Change mentions, mocks and fixtures included, appears in that
  commit's Files list and in the Size count.
- When a commit's Kind is move or rename, a Files entry is deleted, or a legacy
  parameter, branch, or re-export would be kept, apply
  `references/deletions-moves-sweeps.md`.
- Size states the two numbers and the basis.
- Verification asks the PR body only for review facts in prose: no tables, no
  line-anchored context, no planning mechanics such as a red intermediate
  commit; context a reviewer might want is a note for the author to place.
