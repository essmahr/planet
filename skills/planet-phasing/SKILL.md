---
name: planet-phasing
description: Only invoked by the Planet router, never on its own, for an epic whose plan.md has an approach and no phases, or to add phases, re-cut named phases, or migrate an epic's ordered phase list. Do not use outside a Planet session.
user-invocable: false
allowed-tools: Bash(planet *)
compatibility: Claude Code with the planet plugin loaded.
metadata:
  version: 0.10.0
---

# Planet: phasing

Input from the router: `epic: <slug>`, `dir: <path>`, and a `reason:` line picking the path: none for a first cut, `add: <description>`, `re-cut: <why>` naming the phases involved, or `migrate`. Output: draft phases with milestones, blockers, and scope bodies in the store, and `plan.md`'s `## Milestones` section when there are milestones.

## Critical rules

- Read `plan.md` and `planet epic show` only. The research is distilled into them.
- Cut by the principles below. `references/cut-patterns.md` holds examples to borrow from, not a menu.
- Review rule, enforced by the CLI. A change needs an approved phasing proposal when it adds or removes a blocker on an existing phase that hasn't shipped (including a new phase passed `--blocks`), drops a phase that blocks an unshipped phase, or adds, drops, or splits a milestone after the first cut. Everything else needs none: a new phase blocked only by existing phases with nothing blocked by it, moving a phase between milestones, editing a draft's body.
- The approved proposal is the source of truth. The CLI calls right after approval mirror it exactly, with `--proposal latest`.
- A phase's scope lives in its draft body. `plan.md` holds milestones only.
- Ids are labels. Never drop and recreate a phase to change its blockers or milestone.
- Never drop a phase that is not a draft.
- State a rough size for every phase, or say why sizing does not apply. Phase-plan counts exactly; phasing never does.

## Principles

- Each phase is independently shippable and reviewable, and the epic's goal is visible in it.
- A phase lands in one repo. Work that needs PRs in two repos is two phases, the one the other needs blocking it.
- Mark blockers only where one phase needs another's result. Say why-first in the entry only for a spike or the riskiest phase.
- Milestones: two or more disconnected groups, or more than about 8 phases, get one milestone per group, splitting a large group by topic. Otherwise none.
- Work that an investigate or measuring phase exists to define stays one unsized entry blocked by it, and says so; the investigate entry names the phases its findings can change.
- Each phase fits the budget by a rough count, about 20 files or 8 commits unless `plan.md` has a `PR budget:` line, or its entry says why the budget does not apply. A phase whose set is a small fraction of the budget merges into a neighbour it blocks or is blocked by.
- In a `feature`, anything user-visible ships dark until a deliberate rollout phase.
- A manual phase is engineering work with no PR: a migration run, a flag flip, a backfill, a spike whose findings land in `research/`. Announcements, reviews, and waiting on people are never phases; they go in Sequencing notes or inside a phase's plan.

## Steps

1. **Read** `plan.md`: Approach, Sequencing notes, PR budget, Constraints, and any `## Milestones` or legacy `## Phases`; and `planet epic show <epic> --json --brief` for repos, milestones, and phases. If the latest proposal is an approved phasing one and some entry slug in it is missing from `planet epic show`, take its body from `<dir>/proposals/` and go to step 5.
2. **Draft** by path. Entries follow `references/phase-entry.md`, numbered from the highest phase id plus one; milestones follow `references/milestones-section.md`, before the entries. Implementation detail goes in `research/phase-<N>.md`, written alongside. Nothing else in `plan.md` is touched or shown.
   - **First cut:** start from the pattern in `references/cut-patterns.md` for `plan.md`'s `Shape:` line, or Spike then build when the approach is uncertain. Draft `## Milestones` (left out when none), then a `## Phases` entry per phase.
   - **Add:** an entry per new phase. A new milestone also goes in, existing ones collapsed to `: unchanged`.
   - **Re-cut:** redraw only the named phases and their edges; untouched phases keep their ids, bodies, and blockers. New or changed phases get full entries; drops, moves, and blocker changes close `## Phases`, one bullet each. `## Milestones` appears only when milestones change, kept ones collapsed.
   - **Migrate:** `## Milestones` by the milestone rule, or the heading alone when none. Then `## Phases`, one bullet per phase, shipped included: `- <id> <slug>: milestone <n|none>, blocked by <ids>`, from `Depends on`. Approval removes the legacy section, so first save each draft's entry, `Depends on` renamed `Blocked by`, plus a `Milestone:` line when there are milestones.
3. **Check the review rule.** An add or re-cut that needs no proposal skips step 4: apply it, say the change in one line, and go to step 6.
4. **Propose.** Invoke `planet:planet-proposal` with `epic: <slug>` and `to: milestones` when the draft has a `## Milestones` section, else `to: none`. A first cut passes no `changes:`; others pass `changes:` naming the new phases and changed edges, with a last bullet for what is untouched. On rejection, amend in place and propose again with `changes:` for the amendment; a rejection that says the approach is wrong returns `back to scoping: <message>` instead. On `aborted: <message>`, run `planet proposal reject <slug> latest --feedback "<message>"`, then return `phasing aborted: <message>`.
5. **Apply.** First write each new or changed entry to its own scratch file, and run `planet epic repo add <epic> <owner/name>` for any Repo line not in `epic.repos`. Then chain with `&&` in one Bash command, in this order, ids comma-separated with no spaces (`--blocked-by 3,4`):
   - `planet milestone new <epic> <slug> --title "<title>" --proposal latest` per new milestone.
   - `planet phase new <epic> <slug> --title "<title>"` per new entry in order, with `--milestone <n>`, `--blocked-by <ids>`, `--blocks <ids> --proposal latest`, `--manual`, `--linear <ID>`, and `--repo <owner/name>` where the entry says so.
   - `planet phase block <epic> <id> --by <ids> --proposal latest` per unshipped existing phase gaining blockers; add `--remove` for lost ones.
   - `planet phase move <epic> <id> --milestone <n|none>` per moved phase.
   - `planet phase drop <epic> <id> --proposal latest` per dropped draft, then `planet milestone drop <epic> <id> --proposal latest` per emptied milestone.
   - `planet phase write <epic> <id> --body-file <path>` per new or changed draft, every draft on a migrate.
   If the chain stops partway, fix the failing call and rerun from there; never recreate a phase that exists.
6. **Verify** with `planet epic show <epic> --json --brief` that milestones and each phase's kind, repo, milestone, and `blocked_by` match the draft.
7. **Return** `phases added: <ids>` for an add; otherwise `phasing done, N phases drafted, next step phase-plan`, N counting drafts.

## Example

First cut: 1 add the path alias; 2 move the SVGs, blocked by 1; 3 rewrite design-system imports, blocked by 2; 4 and 5 rewrite app imports in two directory batches, each blocked by 2; 6 lint rule for the new location, blocked by 3, 4, 5; 7 update the icon guide, blocked by 2. One group of 7: no milestones, `to: none`.

Add: `add: swap the bell icon, after phase 114`. Blocked by 114, blocking nothing: `planet phase new` and `planet phase write`, one line in chat, no plan mode.

## Troubleshooting

- Phases exist and no `reason:` line was passed: say so and return.
- `planet phase drop` refuses a phase: it is no longer a draft. Stop and report; re-cutting a planned or in-progress phase is a scoping decision.
- A command needs `--proposal`, or refuses it as not the latest or not approved: propose the change at step 4.
- `planet phase block` refuses a shipped phase: shipped phases keep their blockers. Skip it.
- `planet phase new` says a repo is not one of the epic's: run the skipped `planet epic repo add`, then rerun the chain from that entry.
- `planet phase new` reports a duplicate slug: an existing phase has it. Rename in the draft and propose again only if the change is visible to the user; otherwise fix the slug and rerun.
- `planet-proposal` reports the hooks did not run: stop and return that message.
