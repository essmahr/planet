# Milestones section format

The `## Milestones` section of plan.md, always its last section; approving
`--to milestones` writes it in place, replacing a legacy `## Phases` section. In
a proposal it comes before the `## Phases` entries, and approval ignores
everything after it. One entry per milestone, numbered by milestone id. No
phase entries and no status: `planet epic show` gives a milestone's status.

```
## Milestones

### 1. <Title> (<slug>)
<goal: 1 to 3 sentences on what is true once it's done, and why it's a unit>
```

Slugs are kebab-case and unique within the epic. A new milestone's number is the
highest existing milestone id plus one.

## Collapsed entries

A proposal that adds, drops, or splits a milestone carries the whole section.
Each kept milestone is one line, so the user reads only what changed:

```
### 1. <Title> (<slug>): unchanged
```

Approval swaps each collapsed line for the entry with the same number in
plan.md, and refuses when that entry is missing or has another slug. plan.md
never holds a collapsed line.

## No milestones

When the cut has none, leave the section out of a first cut. A migration that
ends with none proposes the heading alone, so approval removes `## Phases` and
writes nothing.

## Example

Three disconnected groups of lint work, one milestone each:

```
## Milestones

### 1. Element rules (element-rules)
Raw HTML elements that have a design-system component are flagged, and every
existing use is migrated. One unit because the rules share a lint plugin.

### 2. Input components (inputs)
Form inputs come only from the design system, so focus and error states match
across the app. Independent of the element rules.

### 3. Spacing tokens (spacing)
Margins and paddings use spacing tokens, enforced by lint. Large enough to
split by area in its phases, small enough to finish as one goal.
```
