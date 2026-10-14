# Deletions, moves, and search-built sets

Read in step 4 when the phase's set comes from a search, and in step 5 when a
commit's Kind is move or rename or a Files entry is deleted.

## A set built by search

- Covers every form the repo uses: variable arguments as well as literals,
  every syntax variant, identifiers case-insensitively, and a file's contents
  rather than its name.
- Touches each file once across the epic's phases. A file in two phases' sets
  moves to the earlier phase, or the entry says why not.
- Cuts commits by owner or area (CODEOWNERS group, directory), so a reviewer
  reads one slice.
- Prefers one central fix (a shared helper, a default handler, a factory) over
  the same edit at every site. When a central fix exists, the per-site pass
  covers only what the central fix cannot reach.

## Before keeping a legacy form

Count who reaches a legacy parameter, branch, or re-export: none means delete
it, a few means repoint them. In a `migration` whose Phases section has a later
removal phase, the old form stays until that phase; Decisions says so.

## A deletion

- Removes what only the deleted code used: modules whose only importers go,
  mocks and fixtures only the removed spec cases used, spec cases that now
  duplicate a sibling, and a helper reduced to a trivial wrapper.
- A "no importers" claim needs a grep for the exported identifier,
  case-insensitive, before the deletion goes in a commit.
- Verification greps for text that mentions the construct, comments and docs
  included, not only the construct itself.

## A move or rename

- Greps CODEOWNERS and other path-referencing config (lint overrides, tsconfig
  paths, codegen inputs) for the old path and lists those files in the commit,
  saying whether each rule is deleted or repointed.
- A moved function's comments are reread for staleness, not ported verbatim.
- A pure move's file count is exempt from the budget when the entry says so;
  content changes in the same phase are counted on their own.
