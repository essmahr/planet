---
name: planet-retro
description: Only invoked by the Planet router, never on its own, for a phase whose status is shipped. Do not use outside a Planet session.
user-invocable: false
allowed-tools: Bash(planet *), Bash(git diff *), Bash(git log *), Bash(git fetch *)
compatibility: Claude Code with the planet plugin loaded, run from the epic's repo. gh authenticated.
metadata:
  version: 0.2.0
---

# Planet: retro

Input from the router: `epic: <slug>`, `dir: <path>`, `phase: <N>`. Precondition: the phase is `shipped`. Output: `retros/NN-<slug>.md` written through the CLI, status `reviewed`, and the return line. The next phase-plan reads the retro; this step edits no plan.

## Critical rules

- Read `planet retro inputs`, the phase document, `plan.md`'s Approach, and this phase's phase-plan proposals when a block was recorded. Read a diff here only for a file the plan and the PR disagree on; the implemented-to-head range goes to the refinement sweep. Nothing else from the store or the repo.
- Rank by signal: blocked events, then the refinement window (diff plus prompts), then review and CI feedback, then plan versus shipped, which gets one paragraph.
- The refinement diff is categorized by the sweep (naming, comments, tests, structure, scope, other, a count and one example each); the retro carries its table. Never list hunks.
- At most three candidate lessons, each naming the skill it would change. Ask once which of them should change how Planet works next time. Record the answer as given; do not argue it.
- The retro is written only by `planet retro write`; status only by `planet phase set`.

## Steps

1. **Inputs.** `planet retro inputs <slug> <N> --json`. Read the phase document (Commits, or the older Changes and Commit sequence) and `plan.md`'s Approach. A phase that is not `shipped`: return `phase <N> not shipped`.
2. **Blocks.** For each `blocked` event: the commit, the why, and what the re-plan changed, read from the proposals for that phase (the files under `<dir>/proposals/` whose frontmatter has `step: phase-plan` and `phase: <N>`; an older proposal with `phase: null` cannot be attributed, so say the re-plan history is unavailable).
3. **Refinements.** With an implemented sha and a head sha (the `head_sha` of the last entry in the inputs' `prs`; with several PRs the range runs to that one): dispatch one general-purpose subagent on model sonnet with `references/refinement-brief.md` as written, filling only the slots: the range, the PR number, and the inputs' prompts. It writes `<dir>/research/retro-<N>-refinements.md` and returns the stat line and the category table with each prompt under the category it drove. Read that reply, not the diff. Without an implemented event, write that refinements were not measurable and go on.
4. **Review and CI.** From the inputs' `prs`: group review comments by theme with their file; list failed checks and the commit that fixed each, from `git log`.
5. **Plan versus shipped.** Compare the phase document's Files (or Changes) and commit subjects against `files.files` and `git log --format=%s` on the PR range. One paragraph, each difference classed plan wrong, discovered, or scope changed. A cut that was wrong is a hand-up: return `re-cut from phase <N>: <why>` and write nothing.
6. **Lessons.** Up to three. Each: one sentence, the skill it points at, the evidence line. Ask one multi-select question: which of these should change how Planet works next time? The rest are `apply: false`. Say the retro's five-line summary in the same message.
7. **Write.** Compose from `references/retro-template.md` into a file in the scratch directory; `planet retro write <slug> <N> --file <path>` plus `--head <head_sha>` (omit for a manual phase or when there is no PR); `planet phase set <slug> <N> --status reviewed`.
8. **Return** `retro done for phase <N>`.

Manual phase: skip steps 3 to 5; ask one question, did Done means hold and what took longer or differed; write it under `## Outcome`.

## Example

Phase 2, `move-subdirs`, one merged PR. Inputs: one `blocked` event at commit 3 (a barrel file the plan did not know about), implemented sha `a1b2c3d`, head `e4f5g6h`, seven prompts after implemented, one review comment, no failed checks. Diff stat: 4 files, 18+ 11-. Categories: naming 2 (`iconPath` to `iconSrc`), tests 1 (a `describe` block split), comments 1 (a docblock cut). Prompts paired: "rename iconPath, it is a URL" under naming. Review: one comment asking for the barrel export order. Plan versus shipped: the barrel file was discovered. Lessons: "phase-plan's sweep should list barrel files the moved modules pass through" (planet-phase-plan), "implement should not add a docblock the plan did not ask for" (planet-implement), "the describe split was taste" (not-planet). The user picks the first two. Write, set reviewed, return `retro done for phase 2`.

## Troubleshooting

- `planet retro inputs` fails on `gh`, or the bundle says `gh_unavailable`: write the retro from events, prompts, and the local branch; say review and CI were not read.
- No PR linked to a `pr` phase: say so; Plan versus shipped uses the local branch if it exists, else says unmeasured.
- The sweep reports a missing sha after its own fetch: `git fetch origin pull/<n>/head` for the PR number, then dispatch it once more.
- The sweep fails or returns no table: run `git diff --stat <implemented_sha>..<head_sha>` yourself, categorize from the stat and the prompts, and say in Refinements that the categorization is rough.
- `planet retro write` rejects the frontmatter: fix the lesson entries; each needs text, skill, apply.
- `planet phase set` refuses: the phase is not `shipped`; report its status and stop.
