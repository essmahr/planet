# Phases section format

The `## Phases` section of plan.md, always its last section; approving
`--to phases` replaces it in place. One entry per phase, in order. After
approval, the `planet phase new` calls mirror these entries exactly.

```
## Phases

### 1. <Title> (<slug>)
<one paragraph of scope: what changes and what is left alone>
- Depends on: none | phase N
- Size: small | medium | large, or about <files> files; phase-plan counts exactly | not applicable because <why>
- Closes: <Linear ID> | none
- Repo: <owner/name>

### 2. <Title> (<slug>), manual
<what done means for this phase>
- Depends on: phase 1
- Size: not applicable
- Closes: none
```

Slugs are kebab-case and unique within the epic. "manual" after the slug marks
a phase with no PR. The Repo line appears only when the epic spans more than one
repo; without it, the phase lands in the epic's primary repo.

## Collapsed entries on a re-cut

A re-cut from phase N proposes the entries below N as one line each, so the
user reads only the entries that can change:

```
### 1. <Title> (<slug>): shipped
### 2. <Title> (<slug>), manual: in-progress

### 3. <Title> (<slug>)
<one paragraph of scope>
```

The status is the phase's status in the store, except that a `reviewed` phase
says `shipped`. `planet proposal approve --to
phases` swaps each collapsed line for the entry with the same number in
plan.md, and refuses when that entry is missing or has another slug. plan.md
never holds a collapsed line.
