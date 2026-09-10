# Retro document

Frontmatter is validated by `planet retro write`: `phase` must match, every
lesson has `text`, `skill`, and `steer`. Everything else in the frontmatter is
filled by the CLI.

```
---
phase: <N>
lessons:
  - text: <one sentence, what a skill should do differently>
    skill: planet-phase-plan | planet-implement | planet-scoping | planet-phasing | planet-intake | not-planet
    steer: true | false
---
# Retro: phase <N>, <title>

## Blocks
One paragraph per blocked event: the commit, why, what the re-plan changed.
"none" when there were none.

## Refinements
From `<implemented_sha>` to `<head_sha>`, <files> files, <insertions>+ <deletions>-.

| Category | Count | Example |
|---|---|---|
| naming | | |
| comments | | |
| tests | | |
| structure | | |
| scope | | |
| other | | |

Prompts in the window, each quoted once under the category it drove:
- <category>: "<prompt>"

"no implemented event; refinements not measurable" when the sha is missing.

## Review and CI
Review comments grouped by theme, one line each with the file. Failed checks
with the commit that fixed them. "none" when empty.

## Plan versus shipped
One paragraph: planned files not changed, changed files not planned, commits
added or dropped, each classed plan wrong, discovered, or scope changed.

## Lessons
One line per lesson, matching the frontmatter: text, the skill, steer yes or
no as answered.
```

Under 600 words. A manual phase replaces Refinements, Review and CI, and Plan
versus shipped with `## Outcome`: did Done means hold, what took longer or
differed, in the user's words.
