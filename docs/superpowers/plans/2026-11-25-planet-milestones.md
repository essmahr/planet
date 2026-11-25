# Milestones and blocked-by phases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Planet's ordered phase chain with optional milestones and `blocked_by` links, so isolated phases are one command and only blocker changes on unshipped work need review.

**Architecture:** Milestones live in `epic.yaml`; `milestone` and `blocked_by` live in phase frontmatter. A new `cli/lib/graph.ts` computes plannable and ready phases and validates the graph. A proposal guard in `cli/lib/proposal.ts` gates blocker changes. Skills switch from "lowest id" and "re-cut from N" to the CLI's ready lists and `add:` / `re-cut:` / `migrate` inputs.

**Tech Stack:** Node 24 TypeScript (type stripping, no build), `node:test`, `yaml`.

**Spec:** `docs/superpowers/specs/2026-11-24-planet-milestones-design.md`

## Global Constraints

- Work on a branch, not `main` (`git checkout -b milestones` before Task 1).
- Commit messages: imperative, lowercase, no prefix, no trailing period. One commit per task unless a step says otherwise.
- Code style: early returns over `else` and over ternaries in return position. `/** */` docblocks only for complex logic, plain-English "what" first. No em-dashes in skill or doc text.
- Missing `milestone` reads as `null`, missing `blocked_by` as `[]`, missing `milestones` as `[]`. Old epics need no rewrite.
- Ids are never renumbered. Phase and milestone ids are `max + 1`.
- Statuses that count as shipped: `shipped`, `reviewed`. Statuses that count as at least planned: `planned`, `in-progress`, `shipped`, `reviewed`.
- Skill text never names the user (`test/skills.test.ts` enforces it). Keep each `SKILL.md` near its current word count (go 1,389, phasing 1,129).
- Run `npm test` and `npm run typecheck` green at the end of every task.

## Review Focus

1. A `--blocks` or `phase block` call that would make a cycle (A blocks B, B blocks A) must refuse and write nothing. Test in Task 4.
2. Dropping a draft that unshipped phases list in `blocked_by`: refused without `--proposal`; with it, the id is removed from those lists, leaving no dangling ids. Test in Task 4.
3. An unmigrated epic (`plan.md` has `## Phases`, phases have no `blocked_by`) must not report every phase as ready; it falls back to lowest id. Test in Task 2.
4. An approved phasing proposal followed by any later proposal (say a phase-plan) is stale; `--proposal` with it refuses. Test in Task 3.
5. A hand-edited `blocked_by` naming a missing phase or forming a cycle is reported by `planet check`, not silently ignored by `phase ready`. Test in Task 2.

---

### Task 1: Schema for milestones and blockers

**Files:**
- Modify: `cli/schema/types.ts`
- Modify: `cli/schema/validate.ts`
- Modify: `cli/lib/phase.ts` (`newPhases` writes the new fields)
- Test: `test/validate.test.ts`

**Interfaces:**
- Produces: `interface Milestone { id: number; slug: string; title: string }`; `Epic.milestones: Milestone[]`; `PhaseMeta.milestone: number | null`; `PhaseMeta.blocked_by: number[]`.

- [ ] **Step 1: Write the failing tests** in `test/validate.test.ts`:
  - `validateEpic reads milestones and defaults them to []`: an epic doc without `milestones` gives `[]`; with `[{id: 1, slug: "views", title: "Views"}]` returns it; a non-kebab slug or a non-integer id throws `ValidationError`; duplicate ids throw `/milestone ids must not repeat/`.
  - `validatePhaseMeta reads milestone and blocked_by with defaults`: missing gives `milestone: null, blocked_by: []`; `blocked_by: [3, "x"]` throws `/blocked_by must be a list of integers/`; `blocked_by` containing the phase's own id throws `/cannot block itself/`.
- [ ] **Step 2: Run** `node --test test/validate.test.ts`. Expected: the new tests fail.
- [ ] **Step 3: Implement.** Add the types; add `milestones` to `validateEpic` and `milestone`, `blocked_by` to `validatePhaseMeta` using a new `intList(o, key, file)` helper beside `strList`. `newPhases` writes `milestone: input.milestone ?? null` and `blocked_by: input.blockedBy ?? []` (add both as optional fields on `NewPhaseInput`; Task 4 validates them). `createEpic` writes `milestones: []`.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: all pass (fix fixtures in other tests that build `PhaseMeta`/`Epic` literals by adding the fields).
- [ ] **Step 5: Commit** `add milestone and blocked_by fields to the store schema`

### Task 2: Graph library and `planet check`

**Files:**
- Create: `cli/lib/graph.ts`
- Modify: `cli/commands/check.ts`
- Test: `test/graph.test.ts`, `test/cli-structure.test.ts` (check case)

**Interfaces:**
- Consumes: `PhaseMeta.blocked_by`, `PhaseMeta.status` (Task 1).
- Produces:
  - `isShipped(status: PhaseStatus): boolean`
  - `graphErrors(phases: PhaseMeta[]): string[]`: one message per missing blocker id (`phase 4 is blocked by missing phase 9`) and per cycle (`phases 2, 3 form a cycle`).
  - `wouldCycle(phases: PhaseMeta[], id: number, blockers: number[]): boolean`
  - `dependentsCount(phases: PhaseMeta[], id: number): number`: transitive phases blocked by `id` that aren't shipped.
  - `unshippedBlockers(phases: PhaseMeta[], id: number): number[]`
  - `isLegacy(home: string, epic: string): boolean`: true when `plan.md` exists and has a `## Phases` heading.
  - `readyLists(phases: PhaseMeta[], legacy: boolean): { plannable: number[]; ready: number[] }`.

- [ ] **Step 1: Write the failing tests** in `test/graph.test.ts`, using `PhaseMeta` literals built by a local `meta(id, status, blocked_by = [])` helper:
  - `readyLists orders by remaining dependents, then id`: phases 1 draft, 2 draft blocked by 1, 3 draft, 4 draft blocked by 2 → `plannable` is `[1, 3]` (1 has two dependents). With 1 `planned`, `plannable` is `[2, 3]` (2 has one dependent, 3 none).
  - `ready needs every blocker shipped`: 1 `planned`, 2 `planned` blocked by 1 → `ready` `[1]`; 1 `shipped` → `ready` `[2]`; 1 `reviewed` → `[2]`.
  - `legacy falls back to lowest id`: drafts 2 and 5 with no blockers, planned 3 and 4, `legacy: true` → `{ plannable: [2], ready: [3] }`.
  - `graphErrors reports missing blockers and cycles`: 1 blocked by 9 → `["phase 1 is blocked by missing phase 9"]`; 2 blocked by 3, 3 blocked by 2 → one message matching `/2, 3 form a cycle/`.
  - `wouldCycle`: with 2 blocked by 1, `wouldCycle(phases, 1, [2])` is `true`, `wouldCycle(phases, 3, [1])` is `false`.
  - `unshippedBlockers`: 3 blocked by 1 (shipped) and 2 (planned) → `[2]`.
  - `isLegacy`: false with no `plan.md`, true with `## Phases`, false with `## Milestones` only.
- [ ] **Step 2: Write the failing check test** in `test/cli-structure.test.ts`: `check reports blocker errors`: create phases, hand-write `blocked_by: [9]` into phase 1's frontmatter, `planet check` exits 1 and stderr matches `/blocked by missing phase 9/`.
- [ ] **Step 3: Run** `node --test test/graph.test.ts test/cli-structure.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement `cli/lib/graph.ts`.** Cycle search is a DFS over `blocked_by` ignoring missing ids. Plannable: `draft` with every blocker at least planned. Ready: `planned` with every blocker shipped. Sort both by `dependentsCount` descending, then id. Legacy: plannable is the lowest-id draft alone, ready the lowest-id planned alone.
- [ ] **Step 5: Implement** the check: in `cli/commands/check.ts`, for each epic, append `graphErrors(listPhases(...).map(p => p.meta))` prefixed with the epic slug to the reported errors.
- [ ] **Step 6: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 7: Commit** `add the phase graph library and check blockers`

### Task 3: Proposal guard and `--to none` / `--to milestones`

**Files:**
- Modify: `cli/lib/proposal.ts`
- Modify: `cli/commands/proposal.ts` (`destinationLabel`, help text in `cli/planet.ts`)
- Test: `test/proposal.test.ts`, `test/cli-structure.test.ts`

**Interfaces:**
- Produces:
  - `assertPhasingApproval(home: string, epic: string, id: number): void`: throws `/proposal <id> is not the latest proposal/`, `/proposal <id> is not a phasing proposal/`, or `/proposal <id> is not approved/`.
  - `Destination` gains `{ kind: "none" }` and `{ kind: "milestones" }`; `{ kind: "phases" }` is removed.
  - `writeMilestonesSection(home: string, epic: string, section: string): string`.

- [ ] **Step 1: Write the failing tests** in `test/proposal.test.ts`:
  - `assertPhasingApproval accepts only the latest approved phasing proposal`: approved phasing proposal 1 passes; a pending one throws `/not approved/`; a `scoping` one throws `/not a phasing proposal/`; after creating proposal 2 (`phase-plan`), proposal 1 throws `/not the latest proposal/`.
  - `approve --to none records approval and writes nothing`: `plan.md` bytes unchanged, outcome `approved`.
  - `approve --to milestones takes the Milestones section out of a larger body`: body `## Milestones\n\n### 1. Views (views)\nGoal.\n\n## Phases\n\n### 1. A (a)\n...` writes only the Milestones part to the end of `plan.md`.
  - `approve --to milestones replaces a legacy Phases section`: `plan.md` ending in `## Phases ...` ends in `## Milestones ...` with no `## Phases` left.
  - `approve --to milestones with no entries removes Phases and writes no heading`: section `## Milestones\n` → `plan.md` has neither heading.
  - `collapsed milestone entries expand from plan.md`: `plan.md` has `### 1. Views (views)\nGoal one.`; proposal `## Milestones\n\n### 1. Views (views): unchanged\n\n### 2. Docs (docs)\nGoal two.` writes both full entries; a collapsed entry whose slug differs throws `/write the entry in full/`.
  - `--to phases is refused` with `/--to must be plan, milestones, none, phase:<n>, or review/`.
- [ ] **Step 2: Run** `node --test test/proposal.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Replace `PHASES_HEADING_RE`, `expandCollapsedEntries`, `writePhasesSection` with Milestones versions. The collapsed form is `### <n>. <Title> (<slug>): unchanged`. `writeMilestonesSection` cuts `plan.md` from the earlier of `## Phases` / `## Milestones` to the end, then appends the section unless it has no `### ` entries. In `approveTo`, `milestones` slices the body from `## Milestones` up to the next `## ` heading (or end) before expanding; `none` only marks approved and returns `wrote: paths.plan(...)` so the word count in `proposalApprove` still works.
- [ ] **Step 4: Update** `cli/planet.ts` help to `--to plan|milestones|none|phase:<n>|review`, and fix `test/cli-structure.test.ts` cases that used `--to phases`.
- [ ] **Step 5: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Commit** `approve proposals to milestones or none, and guard blocker changes`

### Task 4: Phase commands for blockers, moves, drops, and ready

**Files:**
- Modify: `cli/lib/phase.ts`
- Modify: `cli/commands/phase.ts`
- Test: `test/phase.test.ts`, `test/cli-structure.test.ts`

**Interfaces:**
- Consumes: `wouldCycle`, `isShipped`, `readyLists`, `isLegacy`, `unshippedBlockers`, `dependentsCount` (Task 2); `assertPhasingApproval` (Task 3).
- Produces:
  - `NewPhaseInput` gains `milestone?: number | null; blockedBy?: number[]; blocks?: number[]`.
  - `newPhases(home, epic, inputs, proposal?: number)`: validates milestone ids against `epic.milestones`, blocker ids against existing phases, refuses `blocks` without `proposal`, refuses `blocks` on a shipped phase (`/phase 3 has shipped/`), refuses cycles (`/would form a cycle/`); appends the new id to each `blocks` target's `blocked_by`.
  - `setBlockers(home, epic, id, by: number[], remove: boolean, proposal: number): Phase`: refuses on a shipped phase, refuses cycles.
  - `movePhase(home, epic, id, milestone: number | null): Phase`.
  - `dropPhase(home, epic, id, proposal?: number): Phase`: when unshipped phases list `id`, refuses without `proposal` (`/blocks phase 5; pass --proposal/`); with it, removes `id` from their `blocked_by`.
  - CLI: `phase new ... [--milestone <id>] [--blocked-by <ids>] [--blocks <ids>] [--proposal <id>]` (ids comma-separated, `--proposal` accepts `latest`); `phase block <epic> <id> --by <ids> [--remove] --proposal <id>`; `phase move <epic> <id> --milestone <id|none>`; `phase drop <epic> <id> [--proposal <id>]`; `phase ready <epic> [--repo <owner/name>] [--json]` printing `{ plannable: PhaseMeta[], ready: PhaseMeta[] }`.

- [ ] **Step 1: Write the failing lib tests** in `test/phase.test.ts`:
  - `newPhases with blockedBy needs no proposal`; `newPhases with blocks needs an approved phasing proposal and updates the target`.
  - `newPhases refuses an unknown milestone or blocker` (`/no milestone 7/`, `/no phase 9/`).
  - `setBlockers refuses a cycle and writes nothing` (Review Focus 1): 2 blocked by 1; `setBlockers(home, "e", 1, [2], false, p)` throws `/would form a cycle/` and phase 1's file is byte-identical.
  - `setBlockers refuses a shipped phase`.
  - `dropPhase of a blocker` (Review Focus 2): without proposal throws `/blocks phase 2; pass --proposal/`; with it, phase 2's `blocked_by` is `[]`.
  - `movePhase sets and clears milestone with no proposal`.
- [ ] **Step 2: Write the failing CLI tests** in `test/cli-structure.test.ts`: `phase new --blocks without --proposal exits 1`; `phase block --proposal latest after a later proposal exits 1 with /not the latest proposal/` (Review Focus 4 through the CLI); `phase ready --json lists plannable and ready, filtered by --repo`.
- [ ] **Step 3: Run** `node --test test/phase.test.ts test/cli-structure.test.ts`. Expected: FAIL.
- [ ] **Step 4: Implement** the lib functions and commands. Each command commits once (`<epic>: block phase 3 by 1`, `<epic>: move phase 3 to milestone 2`). Resolve `--proposal latest` with `resolveProposalId`.
- [ ] **Step 5: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Commit** `add phase blockers, moves, and ready lists to the cli`

### Task 5: Milestone commands

**Files:**
- Create: `cli/lib/milestone.ts`, `cli/commands/milestone.ts`
- Modify: `cli/planet.ts` (register `milestone`, help text)
- Test: `test/milestone.test.ts`

**Interfaces:**
- Consumes: `assertPhasingApproval` (Task 3), `Epic.milestones` (Task 1).
- Produces:
  - `newMilestone(home, epic, input: { slug: string; title: string }, proposal?: number): Milestone`: id is max + 1 over current milestones; requires `proposal` once the epic has any phase; duplicate slug throws `/milestone 'views' already exists/`.
  - `dropMilestone(home, epic, id, proposal?: number): Milestone`: refuses while any phase has `milestone: id` (`/milestone 1 still has phases/`); same proposal rule.
  - `milestoneStatus(id: number, phases: PhaseMeta[]): "open" | "done"`: `done` when at least one phase has it and all such phases are shipped.
  - CLI: `planet milestone new <epic> <slug> --title <t> [--proposal <id>]`, `planet milestone drop <epic> <id> [--proposal <id>]`.

- [ ] **Step 1: Write the failing tests** in `test/milestone.test.ts`: ids allocate 1, 2, 3 (max + 1, like phase ids); proposal needed once phases exist; drop refused while phases point at it; `milestoneStatus` is `open` with no phases, `open` with one draft, `done` with all `shipped`/`reviewed`; CLI `milestone new` exits 0 and commits.
- [ ] **Step 2: Run** `node --test test/milestone.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `cli/lib/milestone.ts`, writing through `readEpic`/`writeEpic`.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `add milestone commands`

### Task 6: Epic views and status

**Files:**
- Modify: `cli/lib/view.ts`
- Modify: `cli/commands/status.ts`, `cli/lib/phase.ts` (`currentPhase`)
- Modify: `cli/lib/lifecycle.ts` (docblock only: "a re-cut" becomes "adding phases")
- Test: `test/epic.test.ts`, `test/cli-status.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 5.
- Produces:
  - `EpicView` and `EpicBrief` gain `milestones: Array<Milestone & { status: "open" | "done" }>`, `legacy: boolean`, `plannable: number[]`, `ready: number[]`.
  - Each brief phase gains `milestone`, `blocked_by`, `unshipped_blockers: number[]`.
  - `currentPhase(phases: PhaseMeta[], legacy: boolean): PhaseMeta | null`: first `in-progress`, else first ready, else first plannable.

- [ ] **Step 1: Write the failing tests:** `epicBrief includes milestones, ready lists, and unshipped blockers` in `test/epic.test.ts`; `status CURRENT is the first ready phase, not the lowest planned` in `test/cli-status.test.ts` (planned 1 blocked by draft 2, planned 3 free → CURRENT `3 ...`).
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `show milestones and ready phases in epic views and status`

### Task 7: Phasing skill

**Files:**
- Modify: `skills/planet-phasing/SKILL.md` (bump `metadata.version` minor)
- Rename then modify: `git mv skills/planet-phasing/references/phases-section.md skills/planet-phasing/references/phase-entry.md` in its own commit first
- Create: `skills/planet-phasing/references/milestones-section.md`
- Modify: `skills/planet-phasing/references/cut-patterns.md` (only where it says "Depends on" or implies order by number)
- Test: `npm test` (`test/skills.test.ts`)

**Interfaces:**
- Consumes: CLI from Tasks 3 to 5. Router inputs from Task 8: `add: <description>`, `re-cut: <why>`, `migrate`, none (first cut).
- Produces: return lines `phasing done, N phases drafted, next step phase-plan` (first cut, re-cut, migrate) and `phases added: <ids>` (add).

Content the skill must hold (the implementer writes the prose, within the current word count):
- **Critical rules:** the review rule from the spec's "Review rule" section, verbatim in substance; a phase's scope lives in its draft body; ids are labels; "never drop a phase that is not a draft" stays.
- **Principles:** keep the current ones, but "Order by dependency, then by uncertainty" becomes "Mark blockers only where one phase needs another's result; say why-first in the entry only for a spike or the riskiest phase". Milestone rule: two or more disconnected groups or more than about 8 phases → one milestone per group, splitting a large group by topic; otherwise none.
- **First cut:** draft `## Milestones` (format in `milestones-section.md`, omitted when there are none) plus `## Phases` entries (format in `phase-entry.md`) in one proposal, `to: milestones`. After approval: `planet milestone new` per milestone, then one chained `planet phase new ... --milestone --blocked-by` per entry in order, then `planet phase write` per entry with its entry text as the body.
- **Add:** draft entries; if any needs `--blocks`, propose with only the new entries and changed edges plus a last "untouched" bullet, `to: none`; otherwise create directly and say what was added in one line.
- **Re-cut:** redraw only the named phases and their edges; collapsed milestone entries use `: unchanged`; `to: milestones` when milestones change, else `to: none`; apply with `phase block|drop|new|move --proposal latest`.
- **Migrate:** read the legacy `## Phases`; propose milestones (or none) and every phase's milestone and `Blocked by` from its `Depends on` line, `to: milestones`; after approval, `milestone new`, `phase block --proposal latest`, `phase move`, and `phase write` for each draft's entry.
- `phase-entry.md`: today's format with `Depends on` renamed `Blocked by: none | phase N, M`, a `Milestone:` line when the epic has milestones, and the "Collapsed entries on a re-cut" part removed.
- `milestones-section.md`: the format from the spec's `plan.md` section, the `: unchanged` collapsed form, and one example from design-system-lint-enforcement's groups (element rules, inputs, spacing).

- [ ] **Step 1: Commit the rename alone:** `rename phases-section reference to phase-entry`.
- [ ] **Step 2: Rewrite** `SKILL.md`, `phase-entry.md`, `cut-patterns.md`; create `milestones-section.md`.
- [ ] **Step 3: Run** `npm test` and `wc -w skills/planet-phasing/SKILL.md`. Expected: PASS, about 1,100 to 1,300 words.
- [ ] **Step 4: Commit** `phase with milestones and blockers instead of an ordered list`

### Task 8: Router, phase-plan, retro, scoping, proposal skills

**Files:**
- Modify: `skills/go/SKILL.md`, `skills/go/references/next-phase.md`, `skills/go/references/add-repo.md`
- Modify: `skills/planet-phase-plan/SKILL.md`, `skills/planet-phase-plan/references/sweep-brief.md`, `skills/planet-phase-plan/references/manual-phase.md`, `skills/planet-phase-plan/references/deletions-moves-sweeps.md` (its "Phases section has a later" line)
- Modify: `skills/planet-retro/SKILL.md`
- Modify: `skills/planet-scoping/references/plan-v2-template.md`
- Modify: `skills/planet-proposal/SKILL.md` (accepts `to: milestones` and `to: none`)
- Bump `metadata.version` in each changed `SKILL.md`.
- Test: `npm test`

**Interfaces:**
- Consumes: `planet epic show --json --brief` fields from Task 6 (`legacy`, `plannable`, `ready`, `unshipped_blockers`); phasing inputs and return lines from Task 7.

Changes, each taken from the spec's "Skills" section:
- go step 5: first row after the planning rows: `legacy` true and any phase not shipped → phasing with `reason: migrate`. Phase-plan picks `plannable[0]`; implement picks `ready[0]`; retro stays lowest id. "Scoping with phases" → `reason: re-cut: after re-scoping`.
- go step 3: new request form `add phase <description>` and prose asking to add work to an epic → phasing with `reason: add: <description>`.
- go step 8: implement at once when `unshipped_blockers` is empty; else ask `Implement phase N stacked on phase <M>` (M: highest id in `unshipped_blockers`), `Stop`. Drop the "lower-numbered in another repo" branch; an unshipped blocker in another repo asks `Implement phase N now`, `Stop`.
- go step 7 and 9: hand-up `re-cut: <why>` replaces `re-cut from phase N: <why>`. A `phases added: <ids>` return line goes to step 5.
- `next-phase.md`: pick from `planet phase ready <epic> --repo <this repo> --json`; keep the AskUserQuestion confirm.
- `add-repo.md`: `Re-cut phases to use it` → `Add phases in it`, dispatching `add: phases in <owner/name>`.
- phase-plan: read the entry from the phase's own draft body; read blockers' bodies and retros instead of the previous phase's; oversized returns `re-cut: phase N: <why>`. `sweep-brief.md` scope comes from the draft body. `manual-phase.md` returns `re-cut: <findings>`.
- retro: lessons and edits target the phases this one blocks (`planet epic show` lists them by `blocked_by`).
- scoping template: carry `## Milestones` verbatim instead of `## Phases`.

- [ ] **Step 1: Edit** the files above.
- [ ] **Step 2: Run** `npm test` and `grep -rn -E 're-cut from phase|lowest .?draft|## Phases|Depends on' skills`. Expected: tests PASS; grep only hits the migrate path in `planet-phasing/SKILL.md`.
- [ ] **Step 3: Commit** `route by ready phases and blockers instead of phase order`

### Task 9: README, design notes, plugin version

**Files:**
- Modify: `README.md` ("Shaping & scoping" paragraph: milestones, blockers, adding a phase; drop "dependency order")
- Modify: `.claude-plugin/plugin.json` (minor bump, 0.24.0 → 0.25.0)
- Modify: `docs/superpowers/specs/2026-09-07-planet-planning-chain-design.md` (one line under the title: "Phasing superseded by 2026-11-24-planet-milestones-design.md")

- [ ] **Step 1: Edit** the three files.
- [ ] **Step 2: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 3: Commit** `document milestones and bump the plugin version`

### Task 10: Live check on a copy of mcp-apps-architecture

Not a code change. Proves the success criteria against real data without touching `~/.planet`.

- [ ] **Step 1:** `cp -R ~/.planet <scratch>/planet-home` and run the CLI with `PLANET_HOME=<scratch>/planet-home`.
- [ ] **Step 2:** `planet epic show mcp-apps-architecture --json --brief`: `legacy` is `true`; `plannable` holds one id (the lowest draft).
- [ ] **Step 3:** Hand-run the migrate path's CLI calls for two milestones and three `phase block` calls with a `propose` + `proposal approve --to milestones` first. Expected: `plan.md` ends in `## Milestones`, `legacy` false, `planet check` clean.
- [ ] **Step 4:** `planet phase new mcp-apps-architecture icon-test --title "Icon test" --blocked-by 114`. Expected: exit 0, no proposal needed. Then `--blocks 116` without `--proposal`: exit 1.
- [ ] **Step 5:** Report results in the PR description. Delete the scratch copy.
