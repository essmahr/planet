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
