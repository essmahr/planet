# plan.md v2 headings

Approving to `plan` replaces the whole file, so the draft carries v1's Problem
and Context unchanged, then adds the sections below. Remove v1's "Open
questions for scoping": their answers live in Goal, Approach, and Constraints.
If the current `plan.md` has a `## Phases` section, carry it verbatim at the end
of v2; phasing redraws it.

```
# <Epic title>

## Problem
(from v1, unchanged)

## Context
(from v1; add `- Design: <link>` when a design exists)

## Goal
What done looks like, in the user's words where possible. Two to four sentences. (name ticket IDs when tickets were decided)

## Non-goals
Bullets. What is out, including things the user said no to. (name ticket IDs when tickets were decided)

## Success criteria
Bullets. Observable checks: a metric, a grep, a behavior, a review passed.

## Approach
The chosen approach in one or two paragraphs.

### Considered
- <alternative>: two lines on why not.

## Sequencing notes
Bullets for phasing: what must come first, what can run in parallel, where a
design review or rollout sits, whether the work ships dark.

## PR budget
One line, only when the default does not fit: `PR budget: <files> files or
<commits> commits; <why>`.

## Constraints
(from v1, plus any "(decided during review)" lines)
```

About 1,000 words, at most 1,200, not counting a carried `## Phases` section. No new phases, no file-level plan.
