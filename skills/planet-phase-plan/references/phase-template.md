# Phase document

```
# Phase <N>: <title>

## Context
Why this phase now, what came before it and what follows, in two to four
sentences. Link plan.md's Approach section and the research files used.

## Decisions
### <the tricky choice>
What was chosen and why, two to five sentences. Omit the section when nothing
was tricky.

## Commits
### 1. <commit subject, imperative, lowercase>
Files: <paths this commit touches, created, moved, or deleted>
Change: what this commit does, in enough detail to review before it is
written. Name every new or renamed function, type, prop, hook, and file. Give
signatures, and short code blocks for anything a reviewer would want to see
first: a new function body under ten lines, a type, a test's key assertion,
the text of any comment or docblock. Nested bullets for nuance. Moves and
renames first, refactors before behavior, tests with the behavior they cover.
Check: <one command or observation that passes after this commit>
Test first: <the spec file and test name that fails before this commit, with
its key assertion>. Only for a commit that changes behavior; omit for moves,
renames, and refactors.

### 2. ...

## Verification
Whole-PR checks a reviewer runs. Flag name first when there is one. Numbered
steps for a flow; one sentence for a spot check. Anything the PR body must
carry for review (deleted tests by name, flag state) is listed here.

## Size
About <files> files, <commits> commits. Basis: <one line>.

## Out of scope for this phase
Bullets, naming the phase that owns each item when known.

## Closes
<Linear ID> | none
```

A manual phase replaces Commits and Verification with `## Steps` (numbered,
one action each) and `## Done means` (one sentence).
