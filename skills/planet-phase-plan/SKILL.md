---
name: planet-phase-plan
description: Only invoked by the Planet router, never on its own. Plans one draft phase of a Planet epic as the PR-level document an implementation session follows, checks its size against the PR budget first, and writes it through the proposal gate. Do not use outside a Planet session.
user-invocable: false
allowed-tools: Bash(planet *)
compatibility: Claude Code with the planet plugin loaded.
metadata:
  version: 0.1.0
---

# Planet: phase-plan

Input from the router: `epic: <slug>`, `dir: <path>`, `phase: <N>`. Output: the phase body through the gate to `phase:<N>`, status `planned`. Phase-plan decides how, inside one phase. Scoping decided what and why; phasing decided the cut.

## Critical rules

- Read `plan.md`'s Approach, Sequencing notes, PR budget, and this phase's entry; `research/codebase.md` and any `research/phase-<N>.md`; the previous phase's body when there is one, and its retro when it shipped. Nothing else from the store.
- Measure before drafting. An oversized phase gets a proposed cut and a hand-up, never a plan document.
- Ask only when the code surfaces a choice `plan.md` does not settle and the answer changes the PR's shape. A question that shows the approach or the cut was wrong goes back up.
- The phase body is written only by `planet proposal approve`.

## Steps

1. **Read** as the rules say. `planet epic show <epic> --json` gives the phase's id, slug, kind, and path.
2. **Sweep.** If `research/codebase.md` does not cover the files this phase touches, dispatch one general-purpose subagent with `references/sweep-brief.md`. It writes `research/phase-<N>.md` and returns five lines including a rough file count. Read the five lines, not the file.
3. **Clarify.** Ask, one at a time, only per the rule above. Typical: two existing patterns and the plan names neither; a shared type must change and the choice is shim now or touch every consumer; a test pins behavior the phase means to change. If an answer or a finding shows the cut was wrong, return `re-cut from phase <N>: <why>`; if it shows the approach was wrong, return `back to scoping: <why>`.
4. **Size check.** Estimate commits and changed files from the sweep and the entry. Budget: the `PR budget:` line in `plan.md`, else about 20 files or about 8 commits. Under: continue. Over, unless this phase's entry in `plan.md` says why the budget does not apply: say what grew, propose a cut in one message, and on agreement return `re-cut from phase <N>: <the agreed cut>`. Write no plan document for an oversized phase. When the entry exempts it, note the reason under Size and continue.
5. **Draft** in context from `references/phase-template.md`. Commit sequence follows the user's git conventions: moves and renames first, refactors before behavior, tests with the behavior they cover, one line each. Size states the two numbers and the basis. For a manual phase use Steps and Done means.
6. **Gate.** Invoke `planet:planet-proposal` with `epic: <slug>`, `to: phase:<N>`. On rejection, amend in place and gate again.
7. **Set.** `planet phase set <epic> <N> --status planned`, adding `--linear <ID>` when Closes names a ticket the phase's frontmatter lacks.
8. **Return** `phase <N> planned`.

## Example

Phase 2, `move-files`, pr kind. `research/codebase.md` covers the directory, so no sweep. No question: the alias from phase 1 settles how imports survive the move. Size: about 460 files moved but zero content changes, 2 commits; the entry says the file budget does not apply to a pure move. Draft: Context links the Approach; Changes lists the `git mv` and the alias target update; Commit sequence: move, then alias; Verification: typecheck and the icon story render. Gate, approve, set planned, return `phase 2 planned`.

## Troubleshooting

- The phase the router named is not a draft: say its status and stop; a planned phase is re-planned only when the user names it and confirms.
- No draft exists: return `nothing to plan` to the router.
- The subagent fails: draft from the entry and `research/codebase.md`, and say so in Context.
- `planet phase set` refuses: the phase changed under you; refresh with `planet epic show` and report.
- The gate reports the hooks did not run: stop and return that message.
