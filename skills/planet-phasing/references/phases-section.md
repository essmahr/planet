# Phases section format

The `## Phases` section of plan.md, always its last section; approving
`--to phases` replaces it in place. One entry per phase, in order. After
approval, the `planet phase new` calls mirror these entries exactly.

```
## Phases

### 1. <Title> (<slug>)
<1 to 3 sentences of scope: the result, not how it's done>
- Not: <exclusions a reader could expect in scope>
- Why first: <why it goes here, when dependency does not explain it>
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

## What the scope says

The entry exists so the user can check the epic's shape and catch a wrong
direction while skimming. Its scope sentences hold only:

- **The change**: what is different once the phase ships.
- **Exclusions**: the `Not:` line, only for work a reader could reasonably
  expect in this phase. Omit the line otherwise.
- **Ordering**: the `Why first:` line, only when the position is not explained
  by `Depends on`, such as a spike or the riskiest phase going first. Omit the
  line otherwise.

Everything else goes in `research/phase-<N>.md`, which phase-plan reads:

- File paths, function and component names, line numbers, story names, counts.
- Mechanics: how strings, types, or tests are converted, how verification runs.
- Logistics: review owners, missing tickets, where an older plan was kept.

Example:

```
### 2. Custom labels in the call bar and call notifications (calling-call-bar-labels)
The call bar's Contact and Lead panel, the call-switch confirm, and the desktop
call notifications use the org's labels.
- Not: Local Presence copy, anything in the dialer
- Depends on: phase 1
- Size: about 15 files, 4 commits
- Closes: CRM-1310
```

## Collapsed entries on a re-cut

A re-cut from phase N proposes the entries below N as one line each, so the
user reads only the entries that can change:

```
### 1. <Title> (<slug>): shipped
### 2. <Title> (<slug>), manual: in-progress

### 3. <Title> (<slug>)
<1 to 3 sentences of scope>
```

The status is the phase's status in the store, except that a `reviewed` phase
says `shipped`. `planet proposal approve --to
phases` swaps each collapsed line for the entry with the same number in
plan.md, and refuses when that entry is missing or has another slug. plan.md
never holds a collapsed line.
