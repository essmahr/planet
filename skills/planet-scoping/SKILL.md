---
name: planet-scoping
description: Only invoked by the Planet router, never on its own. Second planning step for a Planet epic whose plan.md has a problem statement but no approach. Runs a guided conversation to settle goal, non-goals, success criteria, and the approach, then rewrites plan.md through the proposal gate. Do not use outside a Planet session.
user-invocable: false
allowed-tools: Bash(planet *)
compatibility: Claude Code with the planet plugin loaded.
metadata:
  version: 0.1.0
---

# Planet: scoping

Input from the router: `epic: <slug>`, `dir: <path>`, and `reason: <text>` when a later step sent the work back. Precondition: `plan.md` exists and the last approved step is intake, or a `reason:` line was passed. Output: `plan.md` v2 through the gate. Scoping decides what and why. Phasing decides the cut. Phase-plan decides how.

## Critical rules

- Read `plan.md` and the files Context links, directly or through `research/sources.md`. Nothing else from the store.
- One question per message, multiple choice when the options are known. Stop when goal, non-goals, and success criteria are settled.
- The user picks the approach in chat. The gate carries the finished document, never a menu of approaches.
- `plan.md` is written only by `planet proposal approve`. Approving to `plan` replaces the file, so the draft carries v1's sections.
- Do not invoke superpowers brainstorming. This step is Planet's brainstorm.

## Steps

1. **Read.** `plan.md`, then each `research/` file its Context links, following `research/sources.md` to the files it lists, and `research/tickets.md` when it exists. If `reason:` was passed, read it first; it says what a later step could not resolve.
2. **Shape.** Ask what kind of work this is: a feature, a migration or refactor, an escalation, decomposing a PRD into tickets, or something else. `references/shapes.md` has example questions per shape. Borrow; do not run down a list. Skip this step when a `reason:` line was passed and the shape is already in `plan.md`.
3. **Converse.** One question at a time: what done looks like, what is out, including related tickets that `plan.md` Open questions left undecided, what would make the user reject the result. For a feature also: whether a design exists and where, the flag and who sees it first, what rollout looks like, what metric says it worked. A clear ticket may need only two questions. Never re-ask what `plan.md` answers.
4. **Approaches.** In one message, propose two or three approaches, each in three to five lines with trade-offs, the recommendation first with why. Wait for the pick. If the pick hinges on a codebase fact the research lacks, dispatch one general-purpose subagent on model sonnet with `references/sweep-brief.md` as written, read its five lines, and continue.
5. **Draft.** Compose `plan.md` v2 in context from `references/plan-v2-template.md`: v1's Problem and Context kept, a design link added to Context when there is one, then Goal, Non-goals, Success criteria, Approach with alternatives under Considered, Sequencing notes, a PR budget line only when the default does not fit, Constraints. Goal and Non-goals name ticket IDs when tickets were decided. An existing `## Phases` section is carried verbatim at the end. About 1,000 words, at most 1,200, not counting that section.
6. **Gate.** Invoke `planet:planet-proposal` with `epic: <slug>`, `to: plan`. On rejection, amend the draft in place; a decision in the message becomes a Constraint marked "(decided during review)". Gate again. On `aborted: <message>`, run `planet proposal reject <slug> latest --feedback "<message>"`, then return `scoping aborted: <message>`.
7. **Return** `scoping done, next step phasing`.

A source the user adds mid-conversation is fetched and filed as intake's sources reference describes, appended to `research/sources.md`, and given a Context line at the next gate.

## Example

`plan.md` describes moving SVG assets into the design system. Shape: migration. Questions: must every import keep working during the move (yes, no hard cutover); is anyone else touching those files this month (one team, coordinate). Approaches: move then rewrite imports in batches; rewrite imports through a path alias first, then move; a codemod in one PR. Recommendation: alias first. The user picks it. Draft v2 with Sequencing notes that the alias lands before any file moves. Gate, approve, return.

## Troubleshooting

- No `plan.md`: return `back to intake: no plan.md` to the router.
- The plan already has an Approach and no `reason:` was passed: say so; the user can name `scoping` in the request to redo it, in which case proceed and the new v2 replaces the old.
- The subagent fails: choose from the research on hand and say so under Approach.
- The gate reports the hooks did not run: stop and return that message.
