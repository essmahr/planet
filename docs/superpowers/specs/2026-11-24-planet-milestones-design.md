# Milestones and blocked-by phases

Replaces the ordered phase list from `2026-09-07-planet-planning-chain-design.md`. Phase-plan, implement, the PR loop, and retros stay as they are.

## Why

Phases form one numbered chain, and every addition goes through the phasing proposal. That pays off when work has real order: blockers, spikes, and findings that force a re-cut. For small independent work it is a chore.

mcp-apps-architecture shows the cost:

- 59 phases with ids up to 122. About 60 were dropped and recreated by re-cuts.
- 56 phasing proposals, out of 197 proposals in the epic. The next highest epic has 14.
- New work like the DS icon swaps (114 to 119) costs a plan-mode pass over the whole Phases section, and every entry stays in `plan.md` after it ships.

The work itself is already a tree. 18 of 59 entries say `Depends on: none`; five depend only on 114. The chain comes from the mechanics: ids are the sequence, a re-cut drops and recreates every draft from N onward, the router takes the lowest id, and `plan.md` keeps a line for every shipped phase.

## Intent

Blockers are what matter. A change that rewires blockers on work that hasn't shipped gets close review. A phase with no blockers that blocks nothing has no order, and adding one costs one command. Related phases sit in named milestones, so `plan.md` holds a short outline that grows only when milestones change.

## Goals

- Adding a phase that changes no other phase's blockers is one command and no plan mode.
- A change that adds or removes a blocker on an unshipped phase always goes through plan mode, showing only what changed.
- `plan.md` stops growing per phase.
- The next phase comes from phases whose blockers have all shipped.
- Small epics keep working without milestones.

## Non-goals

- Linear sync. The store stays the source of truth. Field names follow Linear's shape (milestones, blocked-by) so a mirror is cheap later.
- Changes to phase-plan's content, implement, the PR loop, retro content, or feedback-review.
- Migrating shipped epics.

## Anti-goals

- A blocker change on unshipped work landing without review.
- Losing the record of shipped phases or their retros.
- Requiring milestones on epics that don't need them.

## Evidence: the shape of past epics

From the `Depends on` lines of all 16 epics, parsed by script, so a few edges may be approximate.

| Shape | Epics | Example |
|---|---|---|
| Tiny, 1 to 5 phases | 6 | note-dropzone-a11y |
| Flat, mostly isolated phases | 1 | customizable-standard-object-labels: 15 phases, 11 isolated, longest chain 2 |
| One chain | 4 | lead-page-activity-gql-migration: 10 phases, chain of 8 |
| Several disconnected groups | 5 | design-system-lint-enforcement: groups of 10, 6 and 11 (element rules, inputs, spacing) |

Disconnected groups map to milestones you'd name anyway. Single-chain epics get the same next phase from `blocked_by` as from "lowest id". Outside MCP, every epic's highest id equals its phase count, so re-cut churn is an MCP problem.

## Approaches

**A. The store holds the tree; `plan.md` holds milestones only. Picked.** Milestones in `epic.yaml`, `milestone` and `blocked_by` in phase frontmatter, scope in draft phase bodies. The CLI computes ready phases and enforces the review rule. Costs the most code, but it's the only option that stops `plan.md` from growing and turns the review rule into a CLI check rather than a skill judgment.

**B. `plan.md` stays the source of truth** with parsed "Blocked by" lines. One readable document, but the CLI would parse prose (the original design keeps frontmatter script-owned), and `plan.md` still grows per phase.

**C. Each milestone is a small epic.** Reuses epic machinery, but cross-milestone blockers become cross-epic links, and inside each milestone phases are still a re-cut chain.

## Model

### Milestones

Optional. An epic with no milestones behaves as one implicit milestone; nothing shows for it.

`epic.yaml` gets:

```yaml
milestones:
  - id: 1
    slug: mcp-components
    title: MCP components and view rollout
```

- Status is derived: `done` when it has at least one phase and every phase is `shipped` or `reviewed`; otherwise `open`.
- Milestone order is derived from phase blockers. Milestone B waits on A only through its phases' `blocked_by`.
- Ids are allocated max + 1, like phase ids. A milestone can only be dropped once no phase points at it, so a reused id never collides.

### Phases

Phase frontmatter gets:

```yaml
milestone: 1        # or null
blocked_by: [114]   # phase ids in this epic
```

- Validation: blockers exist in the epic, no self-reference, no cycles. A missing field reads as `null` / `[]`, so old epics need no rewrite.
- Ids are labels, allocated as today (max + 1), never renumbered. A re-cut no longer drops and recreates drafts it doesn't change.
- **Plannable**: a draft whose blockers are all at least `planned`. Planning ahead of a blocker shipping stays possible, as today.
- **Ready**: a planned phase whose blockers are all `shipped` or `reviewed`. A planned phase with an unshipped blocker can still be implemented stacked on that blocker's branch, after asking.
- The scope paragraph that lived in the Phases section moves into the draft phase's body (title, scope, `Not:`, size, closes, repo). Phase-plan replaces it with the full plan, as today.

### `plan.md`

`## Phases` becomes `## Milestones`, the last section, present only when the epic has milestones:

```
## Milestones

### 1. MCP components and view rollout (mcp-components)
<goal: 1 to 3 sentences on what is true once it's done, and why it's a unit>
```

No phase entries, and no status: a done milestone's entry stays as written, and `planet epic show` gives its status (my call: keeps the CLI from editing `plan.md` outside proposal approval). `planet epic show` renders the phase list by milestone with status and blockers, shipped phases included. That list, the phase files, and the retros are the record of completed work.

## Review rule

The CLI decides whether a change needs an approved proposal. A change needs one when it:

- adds or removes a `blocked_by` entry on an existing phase that hasn't shipped, including a new phase passed as `--blocks <id>`;
- drops a phase that blocks an unshipped phase;
- adds, drops, or splits a milestone after the first cut.

Everything else needs no proposal:

- a new phase blocked only by existing phases, with nothing blocked by it;
- moving a phase between milestones;
- editing a draft's scope body (phase-plan reviews it anyway).

Commands that need a proposal take `--proposal <id>`. The CLI accepts it only when it is the epic's latest proposal, its step is `phasing`, and it is approved. A later proposal of any kind makes it stale, so an old approval can't authorize a new change. The CLI checks approval, not content (my call: no schema field needed).

## CLI

- `planet phase new <epic> <slug> --title <t> [--milestone <id>] [--blocked-by <ids>] [--blocks <ids>] [--proposal <id>] [--manual] [--linear ...] [--repo ...]`. Refuses `--blocks` without `--proposal`.
- `planet phase block <epic> <id> --by <ids> [--remove] --proposal <id>`.
- `planet phase move <epic> <id> --milestone <id|none>`.
- `planet phase drop <epic> <id> [--proposal <id>]`: drafts only, as today; needs `--proposal` when the phase blocks unshipped work, and removes it from their `blocked_by`.
- `planet phase ready <epic> [--repo <owner/name>] [--json]`: plannable drafts and ready planned phases, each list ordered by most remaining work unblocked (transitive dependents), then lowest id.
- `planet milestone new <epic> <slug> --title <t> [--proposal <id>]`; `planet milestone drop` likewise, refusing while it has phases. `--proposal` is required once the epic has phases.
- `planet epic show`: adds `milestones` (with derived status) and each phase's `milestone`, `blocked_by`, `ready`.
- `planet status`: CURRENT shows the first ready phase.
- `planet proposal approve --to milestones` replaces `--to phases`. It writes the proposal's `## Milestones` section to `plan.md` and ignores the rest of the body; phase entries stay in proposal history, and the skill writes them into draft bodies. A proposal that adds or changes milestones carries the whole section, unchanged entries collapsed to their heading and expanded on approval, as Phases entries are today. `cli/lib/proposal.ts`'s heading check and collapsed-entry expansion move to Milestones.
- `planet proposal approve --to none`: records the approval and writes nothing. Used by add and re-cut proposals that change no milestone. `planet-proposal` accepts `to: none`.
- `lifecycle.ts`: adding a phase to a shipped epic puts it back to active, as a re-cut does today.

## Skills

### planet-phasing

Three paths, picked by the router's input:

- **First cut.** Cut by the existing principles. Propose milestones when the cut has two or more disconnected groups or more than about 8 phases, one per group, splitting a large group by topic; otherwise none. The proposal shows milestones with goals and every phase entry with `Blocked by`. On approval, `plan.md` gets `## Milestones`; the skill creates milestones, then phases, then writes each draft's scope body with `planet phase write`.
- **Add.** Input `add: <description>`. Draft one or more entries (milestone, blockers, scope, size). If the CLI says no proposal is needed, create the phases and say what was added in one line, no plan mode. If it says one is needed, go through `planet-proposal` showing only the new phases and the changed edges, with a last bullet for what's untouched.
- **Re-cut.** Input `re-cut: <why>` naming the phases involved. Redraw only the affected phases and edges; untouched drafts stay. Proposal shows only the changes. Replaces "re-cut from phase N".

`references/phases-section.md` becomes the format for the proposal's phase entries and the draft body; `Depends on` becomes `Blocked by`. Word budget as today.

### go (router)

- Step 5 keeps its row order: retro, then phase-plan, then implement. Retro on shipped phases stays lowest id first (order doesn't matter there). Phase-plan takes the first plannable draft, and implement the first ready planned phase, from `planet phase ready`. "Scoping with phases": dispatch phasing with `re-cut: after re-scoping`.
- Step 8: implement at once when every blocker of the phase is `shipped` or `reviewed`. Otherwise ask `Implement phase N stacked on phase <M>` (M: its unshipped blocker; with several, the one with the highest id), `Stop`. Replaces "every lower-numbered `pr` phase in the repo".
- New request form: `add phase <description>` (and prose like "add a phase for X") dispatches phasing with `add:`.
- `references/next-phase.md`: pick from `planet phase ready --repo <this repo>`.
- `references/add-repo.md`: "re-cut phases to use it" becomes an `add:` dispatch.
- Step 9 hand-up: `re-cut: <why>`.

### planet-phase-plan

- Reads its entry from the draft body, not `plan.md`'s Phases section; `references/sweep-brief.md` likewise.
- "The previous phase's body and retro" becomes its blockers' bodies and retros.
- An oversized phase returns `re-cut: <why>` naming the phase. `references/manual-phase.md`'s spike findings return the same.

### planet-retro

Lessons and proposed edits target the phases this one blocks, not "later phases".

### planet-scoping

`references/plan-v2-template.md` carries `## Milestones` verbatim instead of `## Phases`.

## Migration

A one-time pass per active epic. The router dispatches phasing with `migrate` when `plan.md` has a `## Phases` section and any phase hasn't shipped, before any other step (my call). Until an epic migrates, `planet phase ready` falls back to today's lowest-id order, so nothing runs out of order.

1. Read the existing `## Phases` section.
2. Propose milestones (by disconnected group, split by topic when large) and `blocked_by` for every unshipped phase, from the `Depends on` lines. Small epics get no milestones.
3. On approval (`--to milestones`, which replaces `## Phases` with `## Milestones`, or removes it when there are no milestones): create milestones, set every phase's `milestone`, and `blocked_by` on unshipped phases only, with `--proposal <id>` (the migration proposal is the latest approved phasing proposal, so the normal check passes), and move each draft's entry into its body. The CLI refuses blocker changes on shipped phases, so those keep an empty list (readiness ignores them). The old section stays in the proposal history.

Shipped epics stay as they are; missing fields read as empty.

## Success criteria

- In mcp-apps-architecture, adding a phase like an icon swap blocked by 114 is one command and one line in chat.
- After migration, MCP's `plan.md` lists a handful of milestones and no phase entries.
- A change that moves a blocker on unshipped work (Y blocked by W becomes blocked by X) appears in plan mode with only that edge.
- `/planet:go next phase` offers a ready phase, never one with an unshipped blocker.
- Tiny epics show no milestones anywhere.

## Left to the builder

- Exact flag names and output formats, following existing commands.
- Cycle detection and the dependents count.
- Test layout, following `test/`.
- Skill word budgets, as set in the existing specs.
