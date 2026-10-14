# Retro document

Frontmatter is validated by `planet retro write`: `phase` must match, every
lesson has `text`, `skill`, and `apply`. Everything else in the frontmatter is
filled by the CLI.

```
---
phase: <N>
lessons:
  - text: <one sentence, what a skill should do differently>
    skill: planet-phase-plan | planet-implement | planet-scoping | planet-phasing | planet-intake | not-planet
    apply: true | false
    repeat_of: <phase>   (only when it repeats an earlier applied lesson)
---
# Retro: phase <N>, <title>

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
One paragraph. A blocked event opens it: the commit, why, what the re-plan
changed. Then planned files not changed, changed files not planned, commits
added or dropped, each classed plan wrong, discovered, or scope changed.

## Lessons
One line per lesson, matching the frontmatter: text, the skill, apply yes or
no as answered, and "repeat of phase N, applied | not applied by the plan"
when it repeats. "none" when nothing would change a skill.
```

Under 600 words. A manual phase replaces Refinements, Review and CI, and Plan
versus shipped with `## Outcome`: did Done means hold, what took longer or
differed, in the user's words.
