# Plan routing review, 2026-10-14

Three read-only sweeps of the store, run after the 2026-10-13 feedback review,
to answer whether Planet should plan differently per kind of change (a
migration found by grepping, a net-new feature, a refactor, an investigation)
with a skill or reference per type. Data: 9 epics, 101 phases, 337 proposals,
142 rejections, 125 applied lessons, 613 real prompts, 565 answers to router
questions, 69 retros.

## Verdict: no per-epic routing

- 5 of 9 epics mix two to six phase types. An epic-level route misfits 25 to
  44 of 101 phases.
- A title-based router misroutes 3 of 9 epics: gql is a "migration" with no
  searched set, design-system is a "lint feature" that is 17 sweep phases,
  customizable-labels is a feature built as a sweep.
- 33 of 142 rejections were type-specific; 21 avoidable with type guidance; 9
  of those already covered by conditional rules in the single skill. 12
  rejections (8%) lacked any guidance, and all of them read as conditionals
  ("touch each file once"), not as a module.
- 41 of 125 lessons were type-specific. The deletion and move family (13
  lessons) came from sweep and refactor epics alike; a per-type split would
  have hidden it from half its users.
- Feature, investigation, and docs have one to two lessons each. Too few to
  write a module from.
- No prompt or rejection calls a step pointless. The two 1-phase epics ran
  every step without objection.
- The one real misfit: manual phases. The commit-shaped template produced the
  only `skill`-tagged rejection (input-form #10) and a 9-proposal
  investigation (finish-security p2).

Skill text had skewed toward migrations because every migration-sweep and
refactor-move sentence added after 2026-09-10 came from a feedback review, and
the reviews drew on three migration epics. phase-plan's Draft step had grown
from about 50 words to 418.

## What the sweeps found instead

- Router questions with a fixed answer: "Implement phase N here" 55 of 63,
  "Stay and refine" 27 of 30, branch name a `scottmahr/` branch 40 of 40.
- About 90 prompts only granted push or apply permission on draft PRs.
- Intake's Open questions were answered through the approval gate: 8 of 11
  intake rejections; first-try approval 2 of 9.
- 31% of all rejections were a question with no directive; each cost a
  redraft and a second ~1,200-word read.
- Phasing sized every phase, phase-plan re-measured; at least 7 re-cuts came
  from the disagreement.
- Re-cuts re-showed the whole plan.md (median ~2,000 words) for a one-entry
  change; 28 re-cuts, 82% approved first try.
- 51 of 67 retros had exactly three lessons (the cap); "Blocks: none" in 68 of
  69; 18 PR-body lessons did not stop 28 later PR-body corrections.
- The capture hook recorded 50 subagent hand-backs and bash blocks as prompts.

## What changed (branches routing/cli, routing/feedback-review-tests, routing/skills)

CLI: capture strips any injected block and logs unknown tags; `proposal
approve --to phases` replaces only the Phases section; `epic show --brief` for
the router (msw: 24 KB to 5.6 KB); `retro inputs` lists prior applied lessons
and a lesson can say `repeat_of`.

Skills: the router implements a planned phase without asking and ends the turn
after a PR opens; intake asks its open questions in one AskUserQuestion before
plan mode; implement generates the branch name, pushes and edits drafts
without asking, and drafts the body with the user's `pr` skill
(`references/pr-lifecycle.md`); phasing proposes only the Phases section with
rough sizes; phase-plan's template asks for conventions checked and a why per
decision, its deletion/move/sweep rules live in a reference read when a commit
needs them, and manual phases have their own reference; scoping records
`Shape: feature | migration | refactor` and phasing cuts from that shape's
pattern; retro drops the Blocks section and the lesson quota and records
repeats as repeats; descriptions carry triggers only; references are budgeted
at 450 words; feedback-review micro-tests edits before committing them.

## Revisit at the next feedback review

- `Shape:` line: keep only if phasing or phase-plan read it in practice; drop
  it and delete scoping's skip clause otherwise.
- Router defaults: count how often the stacked-branch question fired and
  whether its answer varied.
- Push policy: any force-push or body edit the user would have stopped.
- Intake's single question: whether four slots were enough, and whether
  answers reached Constraints.
- Retro: lessons per retro now that the cap is gone, and how many carry
  `repeat_of`.
