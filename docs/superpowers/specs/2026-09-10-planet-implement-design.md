# Planet implement: design

Follow-on to `2026-09-07-planet-planning-chain-design.md`. Adds the step that
was left out of Planet on purpose: implementing a planned phase. Changes the
phase document so it reads in execution order, adds a hidden `planet-implement`
skill that follows it, and makes the router's Implement path dispatch that
skill instead of stopping. One CLI constant (the `implement` step name); no
store or hook changes.

## Problem

The router's Implement path starts the session, prints the phase file path,
and stops. The user expects Implement to implement. Handing off to a
superpowers execution skill would make superpowers a hard dependency, and the
phase document is not shaped for execution anyway: Changes is grouped by file,
Commit sequence by order, with no link between them; commits are subject lines
with no files or checks; Verification is whole-PR only; the PR's title and body
are implied ("listed in the PR body") but specified nowhere.

## Decisions

| Question | Decision |
|---|---|
| Dependency on superpowers | None. `planet-implement` borrows the shape of `executing-plans` (load, review critically, execute in order, stop on blockers), one sentence of test-driven development, and one of verification-before-completion. Superpowers is MIT; borrowed text is attributed in the skill's reference file. If superpowers is installed its skills still fire on their own triggers; nothing in Planet invokes them. |
| Granularity | One task per commit. A phase has at most about eight commits, each with a natural check. No five-minute steps. |
| Where the plan lives | The phase document, rewritten in execution order. No second plan file. |
| Who implements | The session model, inline, in the user's conversation. No subagent, no model choice. Context management stays with the user. |
| Branch | From the Linear issue's branch name when the phase closes a ticket and the MCP returns one; otherwise ask once. Never the default branch. |
| Outcome | Always a PR opened with `gh pr create`; the existing hook links it to the phase and marks it in-progress. |
| Blockers | A commit that cannot be done as written stops the skill with a report. Re-planning goes through `/planet:go`; the skill never improvises around the plan. |

## Phase document v2

Replaces `skills/planet-phase-plan/references/phase-template.md`:

```
# Phase <N>: <title>

## Context
Why this phase now, what came before it and what follows, in two to four
sentences. Link plan.md's Approach section and the research files used.

## Decisions
### <the tricky choice>
What was chosen and why, two to five sentences. Omit the section when nothing
was tricky.

## Commits
### 1. <commit subject, imperative, lowercase>
Files: <paths this commit touches>
Change: what this commit does; nested bullets for nuance. Moves and renames
first, refactors before behavior, tests with the behavior they cover.
Check: <one command or observation that passes after this commit>
Test first: <the spec that fails before this commit>. Only for a commit that
changes behavior; omit for moves, renames, and refactors.

### 2. ...

## Verification
Whole-PR checks a reviewer runs. Flag name first when there is one. Numbered
steps for a flow; one sentence for a spot check.

## PR
Title: <PR title, imperative, no ticket prefix unless the repo convention adds one>
Body: <what the body must say beyond the summary: deleted tests listed by
name, flag state, follow-ups; "nothing beyond the summary" when empty>

## Size
About <files> files, <commits> commits. Basis: <one line>.

## Out of scope for this phase
Bullets, naming the phase that owns each item when known.

## Closes
<Linear ID> | none
```

Changes as a section is gone; its content lives under the commit that does it.
The trailing "Before starting, run `planet session start`" line is gone; the
implement skill runs it. A manual phase keeps Steps and Done means in place of
Commits, Verification, and PR, as today.

Phase-plan step 5 changes to match: draft Commits from the sweep and the
entry, each with Files, Change, Check, and Test first where behavior changes;
the PR section names the title and what the body must carry. Budget for the
phase-plan body stays 1,500 words. Phase documents grow, roughly 1.5 times;
the gate shows them as today.

## `planet-implement`

Hidden step skill, dispatched only by the router. Body budget 700 words.
`allowed-tools`: `Bash(planet *)`, `Bash(git *)`, `Bash(gh pr create *)`,
`Bash(gh pr view *)`. Everything else prompts as usual.

Input: `epic: <slug>`, `dir: <path>`, `phase: <N>`. Precondition: the phase's
status is `planned` or `in-progress` (a resumed session). Output: a PR linked
to the phase, and the return line.

Critical rules:

- The phase document is the plan. Follow Commits in order; do not reorder,
  merge, or add commits. A commit that cannot be done as written stops the
  skill (see Blockers).
- Behavior changes start with the failing test named under Test first: write
  or adjust it, run it, see it fail, then implement. Moves, renames, and
  refactors skip this.
- After every commit run its Check and read the output before moving on.
  Before opening the PR run every Verification step and read the output. No
  claim of done without the output.
- Store writes only through `planet`. Never edit `plan.md` or the phase file;
  re-planning goes through `/planet:go`.
- Never commit to the repo's default branch.

Steps:

1. **Start.** Run `planet session start <slug> --phase <N>`. Read the phase
   file and `plan.md`'s Constraints. Nothing else from the store.
2. **Review.** Read Commits critically. If a commit's Files or Change do not
   match the code as it is now, or two commits conflict, stop and report per
   Blockers before touching anything.
3. **Branch.** With a Linear ID in Closes, take the issue's branch name from
   the Linear MCP `get_issue` result; without one, or when the MCP has no
   name, ask once for a branch name. `git checkout -b <name>` from the
   default branch, up to date.
4. **Implement.** For each commit in order: Test first when present, then the
   Change, then the Check, then `git commit` with the commit subject as the
   message. One commit per section.
5. **Verify.** Run every Verification step. A failure is fixed only when the
   fix belongs to one of the commits already made; amend or add a fix-up
   commit and say which commit it belongs to. Otherwise stop per Blockers.
6. **PR.** `git push -u origin <branch>`, then `gh pr create` with the PR
   section's title and a body that carries the summary plus what the PR
   section requires. The hook links the PR to the phase.
7. **Return** `phase <N> implemented, <PR url>`.

Blockers: stop, and say which commit, what the code shows instead, and what
you would need. Return `phase <N> blocked at commit <k>: <why>`. The router
says the phase needs re-planning with `/planet:go <slug> phase-plan <N>`, then
stops. The branch and its commits stay; the re-planned phase's Commits start
from what is already on the branch.

Resuming: when the phase is already `in-progress` and the branch exists, skip
to the first commit whose subject is not in `git log` on the branch.

Reference `references/borrowed.md`: the three borrowed rules with a pointer to
superpowers and its MIT license. Not read at run time.

## Router changes (`skills/go/SKILL.md`)

Step 8 Implement, and the `implement N` path from step 3, become: run
`planet session step implement`, then dispatch `planet:planet-implement` with
`epic`, `dir`, `phase: <N>`. The cue sentence and "planning is over" line are
removed. When the skill returns `phase N implemented, <url>`, say so and run
`planet session end`. When it returns `blocked`, say the phase needs
re-planning and stop.

Step 3 also accepts `phase-plan N`: the router passes `phase: N` to
phase-plan, which re-plans a `planned` phase when the user names it (its
Troubleshooting already allows this). This is how a blocked phase, or a phase
written in the old shape, gets a new plan.

`implement` becomes a valid step name for `planet session step`. This is one
constant in `cli/schema/types.ts` (`STEPS`) and its test; it is the only CLI
change, and it exists so the marker records what the session is doing.

The router is at its 1,100-word budget. The removed cue and "planning is over"
sentences pay for the dispatch line; the `phase-plan N` parsing is paid for by
trimming the Example. The budget is not raised.

## Not included

- A subagent or model choice for implementation.
- Splitting a phase into finer tasks than commits.
- Retro, which reads the PR afterwards.
- Re-planning phases already written in the old shape. The lead-page epic's
  phase 1 is re-planned by hand as the live test.

## Testing

Harness: `planet-implement` in `REQUIRED_SKILLS` and `HIDDEN`, budget 700;
`references/borrowed.md` exists; no skill body says "prior art"; `STEPS`
gains `implement` with a test on `planet session step implement`. Live: on the
lead-page epic, run `/planet:go <slug> phase-plan 1`, approve the new plan in
the v2 shape, choose Implement, and watch: branch name from Linear, one
commit per section with its Check run, Verification run, PR opened and linked,
marker `phase: 1, step: implement`, return line.
