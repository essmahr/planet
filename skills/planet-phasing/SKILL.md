---
name: planet-phasing
description: "Only invoked by the Planet router, never on its own. Third planning step for a Planet epic: cuts the approved approach into ordered phases that each map to one PR or a manual step, proposes the Phases section of plan.md for approval, then creates the draft phases with the planet CLI. Do not use outside a Planet session."
user-invocable: false
allowed-tools: Bash(planet *)
compatibility: Claude Code with the planet plugin loaded.
metadata:
  version: 0.2.0
---

# Planet: phasing

Input from the router: `epic: <slug>`, `dir: <path>`, and a `reason:` line when the router sends the work back, such as `re-cut from phase N: <why>`. Precondition: no phases exist and the last approved step is scoping or phasing, or a `reason:` line. Output: `plan.md` v3 with a Phases section, proposed for approval, then draft phases in the store.

## Critical rules

- Read `plan.md` only. The research is distilled into it.
- Cut by the principles below. `references/cut-patterns.md` holds examples to borrow from, not a menu.
- The approved Phases section is the source of truth. The `planet phase new` calls after approval mirror it exactly, in order.
- Never drop a phase that is not a draft.
- State a size for every phase, even a rough one, or say why sizing does not apply.

## Principles

- Each phase is independently shippable and reviewable, and the epic's goal is visible in it.
- Order by dependency, then by uncertainty: the phase most likely to change the plan goes first.
- Work that an investigate or measuring phase exists to define stays one unsized entry until it reports, and says so; the investigate phase's entry names the later phases its findings can change.
- Each phase fits the budget by a rough count, about 20 files or 8 commits unless `plan.md` has a `PR budget:` line, or its entry says why the budget does not apply.
- Anything user-visible ships dark until a deliberate rollout phase.
- A manual phase is engineering work with no PR: a migration run, a flag flip, a backfill, a spike whose findings land in `research/`. Announcements, reviews, and waiting on people are never phases; they go in Sequencing notes or inside a phase's plan.

## Steps

1. **Read** `plan.md`: Approach, Sequencing notes, PR budget, Constraints. With a `reason:` line, read it first; when it names a phase N, phases below N stay as they are and the section is redrawn from N onward. If `plan.md` already has an approved Phases section and the store has no phases, skip steps 2 to 4 and go to Create.
2. **Cut** by the principles. Consult `references/cut-patterns.md` when the work resembles one of its shapes.
3. **Draft** the Phases section in the format of `references/phases-section.md`, appended to `plan.md` as v3 with everything above it unchanged. On a re-cut, entries below N are copied verbatim.
4. **Propose.** Invoke `planet:planet-proposal` with `epic: <slug>`, `to: plan`. On a re-cut, pass `changes:` naming the entries added, split, dropped, or renumbered, with a last bullet for the entries left untouched; a first cut passes none. On rejection, amend in place and propose again with `changes:` for the amendment; a rejection that says the approach is wrong returns `back to scoping: <message>` instead. On `aborted: <message>`, run `planet proposal reject <slug> latest --feedback "<message>"`, then return `phasing aborted: <message>`.
5. **Create.** On a re-cut, first run `planet phase drop <epic> <id>` for every draft with id N or higher. Then run one `planet phase new <epic> <slug> --title "<title>"` per entry in section order, skipping entries below N on a re-cut since they already exist, adding `--manual` where the entry says manual and `--linear <ID>` where it names a ticket, all chained with `&&` in one Bash command. If the chain stops partway, drop the drafts it created, fix the failing entry, and rerun.
6. **Verify** with `planet epic show <epic> --json` that `phases` lists the entries in order with the right kinds.
7. **Return** `phasing done, N phases drafted, next step phase-plan`.

## Example

Approach: alias first, then move SVGs, then rewrite imports. Cut: 1 add the path alias (pr); 2 move the files, alias keeps imports working (pr); 3 rewrite design-system imports (pr); 4 rewrite app imports in two directory batches (pr, pr); 5 lint rule protecting the new location (pr); 6 update the adding-an-icon guide (pr). Sizes stated per entry; entry 4 notes the sweep exceeds the file budget by design and is split by directory. Propose, approve, then one chained command with six `planet phase new` calls.

## Troubleshooting

- Phases already exist and no `reason:` line was passed: say so and return; the user can pass `re-cut from phase 1` to redo everything.
- `planet phase drop` refuses a phase: it is no longer a draft. Stop and report; re-cutting a planned or in-progress phase is a scoping decision.
- `planet phase new` reports a duplicate slug: an existing phase has it. On a re-cut, an entry below N is already in the store: skip it, do not recreate it. Otherwise rename in the section and propose the section again only if the change is visible to the user; otherwise fix the slug and rerun.
- `planet-proposal` reports the hooks did not run: stop and return that message.
