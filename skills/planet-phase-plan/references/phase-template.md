# Phase document

````
# Phase <N>: <title>

## Context
Why this phase now, what came before and what follows, in two to four
sentences. Link plan.md's Approach section and the research files used.

Lessons applied:
- <retro slug>: <the lesson, one line, and where in this document it shows>

Conventions checked:
- <library or framework>: <what its docs or installed source say that a commit
  relies on>, or none needed

## Decisions
### <the choice>
One `###` per choice a reviewer would ask why about: a library or pattern over
another, a fallback, an export name, a type annotation. What was chosen and
why, one to three sentences. Omit only when no commit makes such a choice.

## Commits
### 1. <commit subject, imperative, lowercase>

Kind: <move | rename | refactor | behavior | test | docs>, <green | red until N>

Files:
- `<path>` (new)
- `<path>` (moved from `<path>`)
- `<path>` (deleted)
- `<path>`

Test first: `<spec file> > <test name>`, with its key assertion in a fence.
Only for Kind behavior, green; a red commit's test arrives with the commit
that makes it green.

Change: <one sentence: what this commit does>.
- <one fact per bullet, as a sentence: a new or renamed function, type, prop,
  hook, or file, with its signature; a call site that changes; imports dropped>
- <a fence shows what a reviewer would ask to see before the PR exists: a
  new signature, a body under ten lines, a type, the text of a comment or
  docblock, or the lines that change at one call site as a diff whose removed
  lines are the file's current lines; a commit with several files opens each
  fence with the path as a comment>
  ```diff
  -  <existing line>
  +  <new line>
  ```

Note: <one line, when a choice here would make a reviewer pause, or when the
code differs from what the phase entry or a Decision assumed; a choice that
spans commits goes under Decisions>

Check: <one command or observation>; <what it shows when it passes>. Two or
more commands go in a fence.

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
````

A manual phase replaces Commits and Verification with `## Steps` (numbered,
one action each) and `## Done means` (one sentence).
