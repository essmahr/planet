# Phase document

```
# Phase <N>: <title>

## Context
Why this phase now, what came before it and what follows, in two to four
sentences. Link plan.md's Approach section and the research files used.

## Changes
1. <concern>: what changes, with nested bullets for nuance.
2. ...

## Decisions
### <the tricky choice>
What was chosen and why, two to five sentences. Omit the section when nothing
was tricky.

## Commit sequence
1. <one line per commit, in order: moves and renames first, refactors before
   behavior, tests with the behavior they cover>

## Verification
How a reviewer checks it. Flag name first when there is one. Numbered steps for
a flow; one sentence for a spot check.

## Size
About <files> files, <commits> commits. Basis: <one line>.

## Out of scope for this phase
Bullets, naming the phase that owns each item when known.

## Closes
<Linear ID> | none

Before starting, run `planet session start <epic> --phase <N>`.
```

For a manual phase, Changes becomes Steps and Verification becomes Done means.
Commit sequence and Size are omitted.
