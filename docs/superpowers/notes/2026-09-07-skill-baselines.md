# Skill baselines

What Claude did on each scenario with no Planet skill loaded, recorded before
each skill was written so the skill text targets real failures. Run with
read-only subagents on 2026-09-07.

## go

Scenario: two epics in the store; the user types `continue the GQL thing` in the epic's repo.

Without the skill, Claude:
- Ran three separate reads, status, resolve, and epic show, where one `planet open` does all of them and sets the marker.
- Never started a session, so nothing that followed would have been attributed to the epic.
- Reached for `gh pr status` and `git branch` to infer which phase to resume, work the store already answers.
- Asked "which phase do you mean by continue?" instead of choosing the step from the epic's state.
- Was unsure whether resolve is meant to pick a single candidate or always defer to the user.

## planet-proposal

Scenario: a drafted planning document must be approved through plan mode and stored with the CLI; hooks exist but were not explained.

Without the skill, Claude:
- Kept the draft in its response buffer instead of writing it to the plan file, so ExitPlanMode would have carried whatever it improvised.
- Planned to run `planet propose` by hand after approval, duplicating the snapshot the PreToolUse hook already takes, and guessed at the step name.
- Hunted for the proposal id through `planet status` or the feedback report rather than using an alias.
- Considered calling `planet capture` itself to record the rejection.
- Was unsure whether `--to plan` or `--to phase:N` applied, and whether a session wrapper was required.

## planet-intake

Scenario: an epic with a Linear ticket and no plan.md; produce the first planning document.

Without the skill, Claude:
- Explored the codebase itself in the main thread with grep and glob rather than delegating.
- Planned to ask two to four clarifying questions before drafting, including approach questions such as target GraphQL client and rollout strategy, which belong to scoping.
- Would have written a Technical Approach and a Phases section into the first document.
- Would have written plan.md directly with the Write tool, bypassing the CLI and the proposal gate.
- Would have treated a vague "looks good" in chat as approval rather than using plan mode.
- Did not save the Linear content or codebase findings anywhere; research would have lived only in context.

# Follow-on 3 baselines, recorded 2026-09-07 before writing each skill

## planet-scoping

Scenario: plan.md has intake's sections and no approach; produce goal, non-goals, success criteria, and a chosen approach.

Without the skill, Claude:
- Batched every open question into one message rather than asking one at a time.
- Chose the approach itself and stated the rationale, rather than offering two or three for the user to pick.
- Would have drafted the new sections alone rather than the whole plan.md, not knowing that approving to plan replaces the file.
- Would have got approval from a chat message, then run `planet propose` and `planet proposal approve` by hand, bypassing plan mode and guessing the step name.
- Was unsure whether the document folds into plan.md or stands alone.

## planet-phasing

Scenario: an approved plan.md with Approach and Sequencing notes, no phases; break the work into PR-sized phases and record them.

Without the skill, Claude:
- Refused to state a size for any phase, so nothing would have flagged an oversized one before implementation.
- Folded non-PR work such as design review and rollout into the phase it gates rather than making it a phase of its own, so those steps would never appear in status.
- Would not ship user-visible work behind a flag unless the plan said so.
- Would have got approval from a chat message listing the phases rather than through the gate, so the approved cut would not be captured or tagged.
- Would have run one `planet phase new` per phase but did not know about `--manual`, and was unsure whether one phase may span several PRs.

## planet-phase-plan

Scenario: an approved plan.md with Approach and Phases; phase 2 is a draft with an empty body; write its plan.

Without the skill, Claude:
- Explored the codebase in the main thread with grep and glob (it noted it would normally delegate).
- Estimated size informally and improvised a threshold, since no budget was stated, and would have flagged rather than acted.
- Read sibling phases and past epics for structure rather than a template.
- Used headings Goal, Scope, Steps, Risks, Verification: no Size, no Commit sequence, no Out of scope, no footer.
- Would have asked scope questions that belong to phasing, such as whether the phase includes import rewrites.
- Would have got approval from a chat message, then written the body through the CLI directly, bypassing the gate.
