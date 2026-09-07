# plan.md v1 headings

```
# <Epic title>

## Problem
What is wrong or missing, for whom, and how it shows up. Two to five sentences.

## Context
One line per research file: its path and what it settles. No figures or lists
from the file; the file holds the detail and is the one place it is corrected.
- Tickets: <ID> (research/linear-<ID>.md)
- Prior art: <PR urls> (research/prs.md), or none
- Codebase: research/codebase.md, one sentence on what it found

## Constraints
Bullets. Technical, product, and sequencing constraints the research surfaced.
Decisions the user made while rejecting a draft go here too, each ending with
"(decided during review)". Findings that do not constrain the work stay in
their research file; non-goals go to Non-goals.

## Open questions for scoping
Bullets. Decisions the approach depends on. Do not answer them here.

## Non-goals
Bullets, only when the ticket or the user made them evident. Otherwise omit the section.
```

Target 300 to 500 words, at most 500. Over budget: cut Context first, then
Constraints. Only these sections; do not add others. No approach, no phases,
no file-level plan.
