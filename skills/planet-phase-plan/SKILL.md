---
name: planet-phase-plan
description: Only invoked by the Planet router, never on its own, for a phase whose status is draft, or one named for re-planning. Do not use outside a Planet session.
user-invocable: false
allowed-tools: Bash(planet *), Bash(git log *)
compatibility: Claude Code with the planet plugin loaded.
metadata:
  version: 0.8.0
---

# Planet: phase-plan

Input from the router: `epic: <slug>`, `dir: <path>`, `phase: <N>`. Output: the phase body proposed to `phase:<N>`, status `planned`. Phase-plan decides how, inside one phase. Scoping decided what and why; phasing decided the cut.

## Critical rules

- Read `plan.md`'s Approach, Sequencing notes, PR budget, and this phase's entry; `research/codebase.md` and any `research/phase-<N>.md`; the previous phase's body when there is one, and its retro when it shipped. Nothing else from the store.
- Measure before drafting. An oversized phase gets a proposed cut and a hand-up, never a plan document.
- Draft from the code, and settle every decision that leaves the PR's shape alone, per `references/drafting-rules.md`. Wire an error only when a user can produce it in the UI. A legacy error prop, a schema rule, or a spec that renders the form empty is not proof; a default value or an always-set field rules it out.
- Ask only when the code surfaces a choice `plan.md` does not settle and the answer changes the PR's shape. A question that shows the approach or the cut was wrong goes back up.
- The phase body is written only by `planet proposal approve`.

## Steps

1. **Read** as the rules say. `planet epic show <epic> --json` gives the phase's id, slug, kind, and path. A previous phase's retro with a lesson marked apply for `planet-phase-plan` is applied to this draft, and Context says which. A review the user ran with you item by item in the previous phase, such as grooming disable reasons one at a time, runs again before proposing.
2. **Sweep.** If `research/codebase.md` does not cover the files this phase touches, dispatch one general-purpose subagent on model sonnet with `references/sweep-brief.md` as written, filling only the slots. It writes `research/phase-<N>.md` and returns five lines including a rough file count. Read the five lines, not the file.
3. **Clarify.** Read `references/drafting-rules.md`, then ask, one at a time, only per the rule above. Typical: two existing patterns and the plan names neither; a shared type must change and the choice is shim now or touch every consumer; a test pins behavior the phase means to change. If an answer or a finding shows the cut was wrong, return `re-cut from phase <N>: <why>`; if it shows the approach was wrong, return `back to scoping: <why>`. A finding that changes other phases hands up the same way rather than deferring to a later phase: a cause the remaining phases share, or a phase well under budget whose neighbour's blocker has cleared and could fold in.
4. **Size check.** Estimate commits and changed files from the sweep and the entry. Count in the repo before drafting, never during it; the entry's size is an estimate, and this count is the one that decides. A set built by search is measured per `references/deletions-moves-sweeps.md`. Budget: the `PR budget:` line in `plan.md`, else about 20 files or about 8 commits. Under: continue. Over, unless this phase's entry in `plan.md` says why the budget does not apply: say what grew, propose a cut in one message, and on agreement return `re-cut from phase <N>: <the agreed cut>`. Write no plan document for an oversized phase. When the entry exempts it, note the reason under Size and continue.
5. **Draft** in context from `references/phase-template.md`, applying `references/drafting-rules.md`. A generated file goes in Files only when `git ls-files` shows it tracked. For a manual phase, read `references/manual-phase.md` and draft Steps and Done means as it says. Re-planning a phase whose branch exists: ask for the branch name, and its commit subjects (`git log --format=%s <default>..HEAD`) become sections 1 to k verbatim, marked done; new sections follow.
6. **Propose.** Invoke `planet:planet-proposal` with `epic: <slug>`, `to: phase:<N>`. On a re-plan, pass `changes:` naming the commit sections added, split, dropped, or renumbered, with a last bullet for what is untouched; a first plan passes none. On rejection, amend in place and propose again with `changes:` for the amendment; a rejection that says the phase should not exist or the cut is wrong returns `re-cut from phase <N>: <message>` instead, with nothing written. On `aborted: <message>`, run `planet proposal reject <slug> latest --feedback "<message>"`, then return `phase-plan aborted: <message>`.
7. **Set.** `planet phase set <epic> <N> --status planned`, adding `--linear <ID>` when Closes names a ticket the phase's frontmatter lacks.
8. **Return** `phase <N> planned`.

## Example

Phase 2, `move-files`, pr kind. `research/codebase.md` covers the directory, so no sweep. No question: the alias from phase 1 settles how imports survive the move. Size: about 460 files moved but zero content changes, 2 commits; the entry says the file budget does not apply to a pure move. Draft: Context links the Approach; Commits 1 is the `git mv`, Kind move, green, Files listing the directories, Check `pnpm typecheck`; Commits 2 changes the alias target in `tsconfig.json`, Kind refactor, green, a diff fence with the new `paths` entry, Check the icon story renders; no Test first, both are moves. Verification: typecheck and the story. Propose, approve, set planned, return `phase 2 planned`.

## Troubleshooting

- The phase the router named is `planned`: re-plan it only when the request named the phase (`phase-plan N`); otherwise say its status and stop.
- The phase is `in-progress` or `shipped`: say so and stop; nothing is written.
- No draft exists: return `nothing to plan` to the router.
- The subagent fails: draft from the entry and `research/codebase.md`, and say so in Context.
- `planet phase set` refuses: the phase changed under you; refresh with `planet epic show` and report.
- `planet-proposal` reports the hooks did not run: stop and return that message.
