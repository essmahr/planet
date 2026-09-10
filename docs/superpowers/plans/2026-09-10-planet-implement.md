# Planet Implement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The router's Implement path runs a Planet-owned `planet-implement` skill that works a phase document written in execution order (one section per commit) through to an open, linked PR.

**Architecture:** One CLI constant (`implement` joins the step names). The phase document template changes to Commits sections with Files, Change, Check, and Test first; phase-plan drafts to it and the sweep brief gathers names and signatures. A new hidden skill `planet-implement` follows the document, borrowing three rules from superpowers (attributed, MIT) without invoking it. The router dispatches the skill from the menu and from `implement N`, and learns `phase-plan N` for re-planning a planned phase.

**Tech Stack:** TypeScript on Node 24 (`node --test`), Markdown skills under `skills/`, harness `test/skills.test.ts`.

**Spec:** docs/superpowers/specs/2026-09-10-planet-implement-design.md

## Global Constraints

- Skill text never names the user. No em-dashes.
- Body word budgets, enforced by `test/skills.test.ts` and not raised: `go` 1,100; `planet-phase-plan` 1,500; `planet-implement` 700.
- Hidden step skills: `user-invocable: false`, no `disable-model-invocation`, description starts "Only invoked by", no `<>`, frontmatter parses under the strict `yaml` package (quote a description containing `: `).
- Every `planet <verb>` in a body is a real command; every `references/<file>.md` named in a body exists under that skill; no body says "prior art".
- Nothing in Planet invokes a superpowers skill. Borrowed text is attributed in `skills/planet-implement/references/borrowed.md`.
- The session marker after Implement starts reads `{phase: N, step: "implement"}`; the skill sets both with one `planet session start <slug> --phase N --step implement` call (the router runs no `session step` for implement; this refines the spec's router section, which had the router run it and then the skill's `session start` would have nulled the step).
- Return lines, exact: `phase <N> implemented, <PR url>`; `phase <N> blocked at commit <k>: <why>`; `phase <N> not planned`.
- Commit messages: lowercase imperative, no prefix, no trailing period.
- Run `npm test && npm run typecheck && claude plugin validate .` before each commit.

---

### Task 1: `implement` step name

**Files:**
- Modify: `cli/schema/types.ts:4,11`
- Test: `test/cli-structure.test.ts:69-71`

**Interfaces:**
- Produces: `Step` includes `"implement"`; `planet session start <epic> --phase N --step implement` and `planet session step implement` succeed.

- [ ] **Step 1: Write the failing test**

In `test/cli-structure.test.ts`, directly after line 71 (`assert.equal((await run(["session", "step", "retro"], ctx(home))).code, 0);`), add:

```ts
  assert.equal((await run(["session", "step", "implement"], ctx(home))).code, 0);
  assert.equal(readMarker(home, SESSION)?.step, "implement");
```

- [ ] **Step 2: Run it, expect failure**

Run: `node --test test/cli-structure.test.ts 2>&1 | grep -E 'not ok|step must be' | head`
Expected: the session test fails; stderr carries `step must be one of intake, scoping, phasing, phase-plan, retro, feedback-review`.

- [ ] **Step 3: Add the constant**

In `cli/schema/types.ts` replace line 4 and line 11 with:

```ts
export type Step = "intake" | "scoping" | "phasing" | "phase-plan" | "implement" | "retro" | "feedback-review";
```

```ts
export const STEPS: readonly Step[] = ["intake", "scoping", "phasing", "phase-plan", "implement", "retro", "feedback-review"];
```

- [ ] **Step 4: Run the suite**

Run: `npm test && npm run typecheck && claude plugin validate .`
Expected: all pass (133 tests once the new assertions count, or 132 with the added lines inside an existing test).

- [ ] **Step 5: Commit**

```bash
git add cli/schema/types.ts test/cli-structure.test.ts
git commit -m "add implement to the session step names"
```

---

### Task 2: Phase document v2 and phase-plan drafting

**Files:**
- Modify: `skills/planet-phase-plan/references/phase-template.md` (whole file replaced)
- Modify: `skills/planet-phase-plan/references/sweep-brief.md` (one question added)
- Modify: `skills/planet-phase-plan/SKILL.md:3,28,35,39` (description, step 5, Example, one Troubleshooting line)

**Interfaces:**
- Produces: phase documents with `## Commits` sections `### <k>. <subject>` carrying `Files:`, `Change:`, `Check:`, `Test first:`; `## Verification`; no `## Changes`, `## Commit sequence`, or `## PR`. Task 3's skill reads exactly these.

- [ ] **Step 1: Replace `skills/planet-phase-plan/references/phase-template.md` with**

````markdown
# Phase document

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
Files: <paths this commit touches, created, moved, or deleted>
Change: what this commit does, in enough detail to review before it is
written. Name every new or renamed function, type, prop, hook, and file. Give
signatures, and short code blocks for anything a reviewer would want to see
first: a new function body under ten lines, a type, a test's key assertion,
the text of any comment or docblock. Nested bullets for nuance. Moves and
renames first, refactors before behavior, tests with the behavior they cover.
Check: <one command or observation that passes after this commit>
Test first: <the spec file and test name that fails before this commit, with
its key assertion>. Only for a commit that changes behavior; omit for moves,
renames, and refactors.

### 2. ...

## Verification
Whole-PR checks a reviewer runs. Flag name first when there is one. Numbered
steps for a flow; one sentence for a spot check. Anything the PR body must
carry for review (deleted tests by name, flag state) is listed here.

## Size
About <files> files, <commits> commits. Basis: <one line>.

## Out of scope for this phase
Bullets, naming the phase that owns each item when known.

## Closes
<Linear ID> | none
```

A manual phase replaces Commits and Verification with `## Steps` (numbered,
one action each) and `## Done means` (one sentence).
````

- [ ] **Step 2: Add one question to `skills/planet-phase-plan/references/sweep-brief.md`**

Replace:

```
4. Anything in the scope paragraph that the code contradicts.
```

with:

```
4. Anything in the scope paragraph that the code contradicts.
5. The names and signatures of the functions, types, props, and hooks the
   phase will change or call, so the plan can name them.
```

- [ ] **Step 3: Update `skills/planet-phase-plan/SKILL.md`**

Replace line 3 (the description) with:

```
description: Only invoked by the Planet router, never on its own. Plans one phase of a Planet epic as the document an implementation session follows, one section per commit with files, code, and checks, sizes it against the PR budget first, and writes it through the proposal gate. Do not use outside a Planet session.
```

Replace step 5 with:

```
5. **Draft** in context from `references/phase-template.md`. One Commits section per commit, in the user's git order: moves and renames first, refactors before behavior, tests with the behavior they cover. Each names its Files, describes the Change with the names, signatures, and short code blocks a reviewer would want to see before the diff exists, gives one Check, and for a behavior change names the Test first. Size states the two numbers and the basis. For a manual phase use Steps and Done means.
```

Replace the Example paragraph with:

```
Phase 2, `move-files`, pr kind. `research/codebase.md` covers the directory, so no sweep. No question: the alias from phase 1 settles how imports survive the move. Size: about 460 files moved but zero content changes, 2 commits; the entry says the file budget does not apply to a pure move. Draft: Context links the Approach; Commits 1 is the `git mv` with Files listing the directories and Check `pnpm typecheck`; Commits 2 changes the alias target in `tsconfig.json`, quoting the new `paths` entry, Check the icon story renders; no Test first, both are moves. Verification: typecheck and the story. Gate, approve, set planned, return `phase 2 planned`.
```

Replace the first Troubleshooting line with:

```
- The phase the router named is `planned`: re-plan it only when the request named the phase (`phase-plan N`); otherwise say its status and stop.
```

- [ ] **Step 4: Run the checks**

Run: `npm test && npm run typecheck && claude plugin validate .` and `awk 'f>=2{print} /^---$/{f++}' skills/planet-phase-plan/SKILL.md | wc -w`
Expected: pass; phase-plan body under 1,500.

- [ ] **Step 5: Commit**

```bash
git add skills/planet-phase-plan
git commit -m "write phase documents as commit sections with code and checks"
```

---

### Task 3: `planet-implement` skill

**Files:**
- Create: `skills/planet-implement/SKILL.md`
- Create: `skills/planet-implement/references/borrowed.md`
- Modify: `test/skills.test.ts:9-11`

**Interfaces:**
- Consumes: phase documents in Task 2's shape; `planet session start <slug> --phase N --step implement`; `planet link <epic> <id> <url>`; router input lines `epic:`, `dir:`, `phase:`.
- Produces: return lines `phase <N> implemented, <PR url>`, `phase <N> blocked at commit <k>: <why>`, `phase <N> not planned`.

- [ ] **Step 1: Harness first**

In `test/skills.test.ts` lines 9 to 11, add `"planet-implement"` to `REQUIRED_SKILLS` and `HIDDEN`, and `"planet-implement": 700` to `WORD_BUDGET`. Run `npm test 2>&1 | grep -E 'not ok|missing'`; expected: `missing skills/planet-implement/SKILL.md`.

- [ ] **Step 2: Create `skills/planet-implement/references/borrowed.md`**

```markdown
# Borrowed rules

Three rules in SKILL.md come from superpowers (https://github.com/obra/superpowers,
MIT License, Copyright (c) 2025 Jesse Vincent), reworded for Planet. Nothing in
Planet invokes a superpowers skill; if it is installed, its skills fire on their
own triggers alongside these.

- From executing-plans: load the plan, review it critically before starting,
  execute items in order, stop on a blocker instead of guessing.
- From test-driven-development: for a behavior change, write the failing test,
  run it and see it fail, then implement.
- From verification-before-completion: run the verification commands and read
  their output before claiming anything is done.
```

- [ ] **Step 3: Create `skills/planet-implement/SKILL.md`**

```markdown
---
name: planet-implement
description: Only invoked by the Planet router, never on its own. Implements one planned phase of a Planet epic in the current session, working the phase document's Commits in order with their checks, running Verification, and opening the PR that the hook links to the phase. Do not use outside a Planet session.
user-invocable: false
allowed-tools: Bash(planet *), Bash(git *), Bash(gh pr create *), Bash(gh pr view *)
compatibility: Claude Code with the planet plugin loaded. gh authenticated. Linear MCP connected when the phase closes a ticket.
metadata:
  version: 0.1.0
---

# Planet: implement

Input from the router: `epic: <slug>`, `dir: <path>`, `phase: <N>`. Precondition: the phase is `planned`, or `in-progress` when resuming. Output: a PR on its own branch, linked to the phase by the hook, and the return line. Three rules below are borrowed; `references/borrowed.md` says from where.

## Critical rules

- The phase document is the plan. Work Commits in order; never reorder, merge, or add one. A small deviation that keeps a commit's intent (a name, a signature, a line the code demanded) is fine; note it for the PR body. A commit whose intent cannot be met stops the work (Blockers).
- A commit with `Test first` starts with that test: write or adjust it, run it, see it fail, then implement. Moves, renames, and refactors have none.
- After each commit run its Check and read the output. Before the PR run every Verification step and read the output. Nothing is done until the output says so.
- Store writes only through `planet`. Never edit `plan.md` or the phase file; re-planning goes through the router.
- Never commit to the default branch.

## Steps

1. **Start.** Run `planet session start <slug> --phase <N> --step implement`. Read the phase file and `plan.md`'s Constraints. Nothing else from the store.
2. **Review.** Compare each commit's Files and Change with the code as it is. A mismatch, or two commits that conflict, stops here per Blockers before anything changes.
3. **Branch.** When Closes names a Linear ID, take `branchName` from the Linear MCP `get_issue` result; otherwise, or when the result has none, ask once for a branch name. From the up-to-date default branch: `git checkout -b <name>`. Resuming: when the branch exists, check it out and skip to the first commit whose subject is not in `git log`.
4. **Implement.** For each commit: Test first when present, then the Change, then the Check, then `git add` the Files and `git commit -m "<subject>"`. One commit per section. Keep a list of deviations.
5. **Verify.** Run every Verification step. A failure whose fix belongs to a commit already made gets a fix-up commit naming that commit; anything else stops per Blockers.
6. **PR.** `git push -u origin <branch>`, then `gh pr create --title "<phase title>" --body-file <a file in the scratch directory>`. Write the body now, from what happened: a summary from Context and Decisions, the commit list, each deviation with its reason, and what Verification asked the body to carry. Follow the repo's PR template and the user's PR conventions when they exist. The hook links the PR to the phase.
7. **Return** `phase <N> implemented, <PR url>`.

## Blockers

Stop and say which commit, what the code shows instead, and what would unblock it. Leave the branch and its commits in place. Return `phase <N> blocked at commit <k>: <why>`.

## Example

Phase 3, `move-subdirs`, Closes none. Review finds every Files list matches the tree. No Linear ID, so ask for a branch name; the user gives `icons/move-subdirs`. Commit 1 is a move: no Test first; `git mv` the directories, Check `pnpm typecheck` passes, commit. Commit 2 rewrites imports: Test first names `Icon.test.tsx > resolves logos from the new path`; run it, it fails on the old path; rewrite; Check passes; commit. Verification's grep for the old path returns nothing. Push, `gh pr create`, return `phase 3 implemented, https://github.com/o/r/pull/123`.

## Troubleshooting

- The phase is `draft`: it has no plan; return `phase <N> not planned`.
- `planet session start` reports no epic or no session id: return its message.
- The PR is open but `planet epic show <slug> --json` shows no PR on the phase: run `planet link <slug> <N> <url>` and say the hook missed it.
- `gh pr create` fails: the branch is pushed; report the error and the branch name so the user can open the PR, then `planet link` as above.
- A Check is an observation, not a command: perform it and say what you saw.
- The default branch moved under you: `git rebase` onto it before pushing, rerun Verification.
```

- [ ] **Step 4: Run the checks**

Run: `npm test && npm run typecheck && claude plugin validate .` and `awk 'f>=2{print} /^---$/{f++}' skills/planet-implement/SKILL.md | wc -w`
Expected: pass; body under 700 (about 560).

- [ ] **Step 5: Commit**

```bash
git add skills/planet-implement test/skills.test.ts
git commit -m "add the planet-implement step skill"
```

---

### Task 4: Router dispatches implement and accepts `phase-plan N`

**Files:**
- Modify: `skills/go/SKILL.md` steps 3, 5, 7, 8, and the Example

**Interfaces:**
- Consumes: Task 3's return lines and input lines; Task 2's phase-plan re-plan rule.

The router body is at exactly 1,100 words. Every step below states its word delta; the Example replacement pays for the rest. Count with `awk 'f>=2{print} /^---$/{f++}' skills/go/SKILL.md | wc -w` after each edit.

- [ ] **Step 1: Step 3, add `phase-plan N`**

Replace:

```
a step name (`scoping`, `phasing`, `phase-plan`),
```

with:

```
a step name (`scoping`, `phasing`, `phase-plan`, or `phase-plan N` to re-plan phase N),
```

- [ ] **Step 2: Step 5, the named phase wins too**

Replace the final sentence of step 5, `A step named in the request wins.`, with:

```
A step named in the request wins; `phase-plan N` also fixes the phase.
```

- [ ] **Step 3: Step 7, phase-plan gets the named phase**

Replace:

```
phase-plan also gets `phase: <N>`, the id step 5 chose;
```

with:

```
phase-plan also gets `phase: <N>`, the id step 5 chose or the request named;
```

- [ ] **Step 4: Step 8, Implement dispatches the skill**

Replace the Implement clause:

```
Implement: run `planet session start <slug> --phase N`, print the phase file path from the view, say `read the phase file and start; gh pr create links the PR to phase N`, and stop; planning ends here.
```

with:

```
Implement: invoke `planet:planet-implement` with `epic: <slug>`, `dir: <epic.paths.dir>`, `phase: N`. On `phase N implemented, <url>`: say so, run `planet session end`. On `phase N blocked at commit k: <why>` or `phase N not planned`: say `/planet:go <slug> phase-plan N` re-plans it, stop.
```

Also in step 3, the `implement N` instruction still says "(step 8's Implement path, run directly)"; keep it, it now means the dispatch above.

- [ ] **Step 5: Replace the Example paragraph**

Replace the whole paragraph under `## Example` with:

```
Request `continue the GQL thing`. `planet open` matches `gql-migration`; say so. `last_approved_step` is `scoping` with no phases: phasing. It returns its done line; refresh; phase 1 is a draft, so repo check, then phase-plan; it returns `phase 1 planned`; ask the step 8 question.
```

- [ ] **Step 6: Count and trim**

Run the count. If over 1,100, shorten in this order until under: Troubleshooting `- \`[]\` in the status block: no active epics, a real answer. Don't run \`planet status\` again.` to `- \`[]\` in the status block: no active epics; do not rerun \`planet status\`.`; then Troubleshooting `- \`planet epic new\` ...` line to `- \`planet epic new\` says \`already exists\`: run \`planet open <slug> --json\`.` if not already that short.

- [ ] **Step 7: Run the checks**

Run: `npm test && npm run typecheck && claude plugin validate .`
Expected: pass; router body ≤ 1,100.

- [ ] **Step 8: Commit**

```bash
git add skills/go/SKILL.md
git commit -m "dispatch planet-implement from the router and accept phase-plan n"
```

---

### Task 5: README and version

**Files:**
- Modify: `README.md` Use section paragraph
- Modify: `.claude-plugin/plugin.json` version `0.3.1` to `0.4.0`, description

- [ ] **Step 1: README**

In the Use section paragraph, replace:

```
After a phase is planned it offers to
start implementation in the session, plan the next phase, or stop.
```

with:

```
After a phase is planned it offers to
implement it in the session, plan the next phase, or stop. Implement works the
phase document commit by commit, with a check after each, then opens the PR
that Planet links to the phase.
```

- [ ] **Step 2: plugin.json**

Set `version` to `0.4.0`. Set `description` to `Epic planning across PRs: intake, scoping, phasing, phase plans through plan mode, implementation to a linked PR, PR sync`.

- [ ] **Step 3: Checks and commit**

Run: `npm test && npm run typecheck && claude plugin validate .`

```bash
git add README.md .claude-plugin/plugin.json
git commit -m "document implement and bump the plugin version"
```

---

### Task 6: Live verification

Manual, in a fresh `claude --plugin-dir /Users/scottmahr/code/personal/planet` session from close-ui. Epic `lead-page-backbone-adapter-removal`, phase 1 already `planned` in the old shape. Record in `docs/superpowers/notes/2026-09-10-implement-live.md`.

- [ ] **Step 1: Re-plan.** `/planet:go lead-page-backbone-adapter-removal phase-plan 1`. Expected: router passes `phase: 1`; phase-plan re-plans a planned phase because the request named it; the sweep's fifth answer lists names and signatures; the draft has Commits sections with Files, Change with code, Check, Test first where behavior changes, and no PR section. Reject once on a name or signature you would change; approve. `planet phase set` from planned to planned succeeds.
- [ ] **Step 2: Implement.** Choose `Implement phase 1 here`. Expected: marker `{phase: 1, step: "implement"}`; Review reports Files match; branch name asked (Closes is none) or taken from Linear; one commit per section with its Check run and output shown; Test first runs red then green where present; Verification run; `git push`, `gh pr create`; the store shows the PR on phase 1 with status `in-progress`; return line printed; router runs `planet session end`.
- [ ] **Step 3: Deviations.** Note every deviation the skill listed in the PR body and whether each was really small.
- [ ] **Step 4: Blocked path, if reached.** If a commit blocks, expected: branch kept, `phase 1 blocked at commit k: <why>`, router says how to re-plan.
- [ ] **Step 5: Record.** Deviations, fixes as their own commits, then `record implement live verification`.

---

## Self-review notes

- Spec coverage: Decisions table → Tasks 3 and 4; phase document v2 and phase-plan step 5 and sweep question → Task 2; `planet-implement` rules, steps, Blockers, resuming, borrowed.md → Task 3; router step 8, `phase-plan N`, budget → Task 4; `implement` step constant → Task 1; testing → each task plus Task 6. Not included items untouched.
- One refinement of the spec, stated in Global Constraints: the skill's `session start --step implement` sets both marker fields, so the router runs no `session step implement`.
- Names: return lines identical in Task 3's skill and Task 4's router clause; `phase: <N>` input identical; template section names (`Commits`, `Files:`, `Change:`, `Check:`, `Test first:`, `Verification`) identical in Task 2's template, phase-plan step 5, and Task 3's skill.
