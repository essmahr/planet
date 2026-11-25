# Phase entry format

The `## Phases` entries of a phasing proposal, one per new or changed phase.
After approval each entry becomes its draft's body through `planet phase write`;
plan.md never holds them.

```
## Phases

### 1. <Title> (<slug>)
<1 to 3 sentences of scope: the result, not how it's done>
- Not: <exclusions a reader could expect in scope>
- Why first: <only for a spike or the riskiest phase>
- Milestone: <n>. <milestone title>
- Blocked by: none | phase N, M
- Blocks: phase N, M
- Size: small | medium | large, or about <files> files; phase-plan counts exactly | not applicable because <why>
- Closes: <Linear ID> | none
- Repo: <owner/name>

### 2. <Title> (<slug>), manual
<what done means for this phase>
- Blocked by: phase 1
- Size: not applicable
- Closes: none
```

The number is the phase id the store will give it: the highest existing id plus
one, counting up in entry order. Ids are labels, not an order, but entries
list blockers first: `planet phase new` refuses a blocker that does not exist
yet. Slugs are kebab-case and unique within the epic. "manual" after the slug
marks a phase with no PR. The Milestone line appears only when the epic has milestones. The
Repo line appears on every entry when the epic spans more than one repo or the
cut needs a repo it does not list yet; otherwise the phase lands in the primary
repo.

`Blocked by` names only phases whose result this one needs: shared code, a
finding, a flag. Touching the same area is not a blocker.
`Blocks` appears only on an add or re-cut, naming existing phases that must
wait for this new one. After `planet phase block` or `planet phase move`, a
body's Milestone, Blocked by, and Blocks lines can be stale; the frontmatter in
`planet epic show` wins.

## What the scope says

So the user can skim the epic's shape, scope sentences say only what is
different once the phase ships, plus the `Not:` and `Why first:` lines.

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
- Blocked by: phase 1
- Size: about 15 files, 4 commits
- Closes: CRM-1310
```
