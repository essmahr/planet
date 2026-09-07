# Planet Planning Chain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `planet-scoping`, `planet-phasing`, and `planet-phase-plan`, connect them through the router, and make the four CLI changes they need, so an epic goes from intake's problem statement to a planned phase and into implementation.

**Architecture:** Three new hidden skills under `skills/`, each a Markdown file with reference files, following the conventions of the shipped `planet-intake`. The router gains step selection from `last_approved_step`, a post-phase menu, and hand-up handling. The CLI gains a phase `kind`, manual completion, `phase drop`, and `last_approved_step` in the epic view. No new store files.

**Tech Stack:** Claude Code skills, the TypeScript CLI on Node 24, `node:test`, `yaml`.

**Spec:** `docs/superpowers/specs/2026-09-07-planet-planning-chain-design.md`, with `2026-09-07-planet-skills-design.md` and `2026-09-03-planet-design.md` as parents.

## Global Constraints

- Only erasable TypeScript in `cli/` and `test/`: no `enum`, no parameter properties, no `namespace`. Relative imports name `.ts`. Types via `import type`. Runtime dependency `yaml` only.
- Commands commit after writes with `<epic>: <what happened>`; `cli/lib/*` never commits.
- Skill frontmatter: `name` equals the folder; `description` under 1,536 characters, no `<` or `>`, opening "Only invoked by the Planet router" for the three new skills; `user-invocable: false` on them; `compatibility` and `metadata.version` present; `allowed-tools` includes `Bash(planet *)`.
- Body word budgets, frontmatter excluded: `go` 1,000; `planet-scoping`, `planet-phasing`, `planet-phase-plan` 1,500 each.
- Skill text never names the user. Every skill has Critical rules, Steps, Troubleshooting sections.
- Step boundaries: scoping decides what and why; phasing decides the cut; phase-plan decides how. A lower step returns `back to scoping: <why>` or `re-cut from phase N: <why>` rather than patching a higher step's mistake.
- PR budget default: about 20 files or about 8 commits, overridable by a `PR budget:` line in `plan.md`.
- Phase creation from phasing: one `planet phase new` call per phase, `--manual` where the Phases section says so, chained with `&&` in one Bash command.
- Commit messages: lowercase imperative, no prefix, no trailing period.
- `npm test`, `npm run typecheck`, and `claude plugin validate .` before every commit.

## File Structure

```
cli/schema/types.ts                 PhaseKind, PHASE_KINDS, PhaseMeta.kind
cli/schema/validate.ts              kind default pr
cli/lib/phase.ts                    kind on newPhases; setPhaseStatus shipped rule; dropPhase
cli/commands/phase.ts               --manual, set --status shipped, drop subcommand
cli/lib/view.ts                     last_approved_step
cli/commands/status.ts              current shows (manual)
cli/planet.ts                       USAGE lines
test/validate.test.ts, test/phase.test.ts, test/cli-structure.test.ts, test/cli-epic.test.ts, test/cli-status.test.ts
test/skills.test.ts                 budgets, hidden set, required skills
skills/go/SKILL.md                  step selection, menu, requests, hand-ups
skills/planet-scoping/SKILL.md
skills/planet-scoping/references/shapes.md
skills/planet-scoping/references/plan-v2-template.md
skills/planet-scoping/references/sweep-brief.md
skills/planet-phasing/SKILL.md
skills/planet-phasing/references/cut-patterns.md
skills/planet-phasing/references/phases-section.md
skills/planet-phase-plan/SKILL.md
skills/planet-phase-plan/references/phase-template.md
skills/planet-phase-plan/references/sweep-brief.md
README.md, .claude-plugin/plugin.json
docs/superpowers/notes/2026-09-07-skill-baselines.md     three new sections
docs/superpowers/notes/2026-09-07-planning-chain-live.md
```

---

### Task 1: Phase kind, manual completion, and `phase drop`

**Files:**
- Modify: `cli/schema/types.ts`, `cli/schema/validate.ts`, `cli/lib/phase.ts`, `cli/commands/phase.ts`, `cli/planet.ts`
- Test: `test/validate.test.ts`, `test/phase.test.ts`, `test/cli-structure.test.ts`, plus every existing test that builds a `PhaseMeta` literal gains `kind: "pr"`

**Interfaces:**
- Produces:
  - `type PhaseKind = "pr" | "manual"`, `PHASE_KINDS`, `PhaseMeta.kind: PhaseKind`
  - `NewPhaseInput.kind?: PhaseKind`; `newPhases` writes `kind`, default `pr`
  - `setPhaseStatus(home, epic, id, status: "planned" | "reviewed" | "shipped", now?: string): Phase`; `shipped` allowed only when `kind` is `manual` and `prs` is empty, and sets `shipped_at` to `now`
  - `dropPhase(home, epic, id): Phase` deletes the file of a `draft` phase, throws `cannot drop phase N: status is <status>` otherwise
  - `planet phase new <epic> <slug> --title <t> [--manual] [--linear ID...]`; `--manual` with `--phase` pairs is an error
  - `planet phase set <epic> <id> --status shipped`
  - `planet phase drop <epic> <id>`, commit `<epic>: drop phase <id>`

- [ ] **Step 1: Write the failing tests**

Append to `test/validate.test.ts`:

```ts
test("validatePhaseMeta defaults kind to pr and rejects unknown kinds", () => {
  const base = { id: 1, slug: "a", title: "A", status: "draft", linear: [], prs: [], shipped_at: null };
  assert.equal(validatePhaseMeta(base, "f").kind, "pr");
  assert.equal(validatePhaseMeta({ ...base, kind: "manual" }, "f").kind, "manual");
  assert.throws(() => validatePhaseMeta({ ...base, kind: "review" }, "f"), /kind must be one of pr, manual/);
});
```

Append to `test/phase.test.ts`:

```ts
import { dropPhase } from "../cli/lib/phase.ts";

test("manual phases ship by hand; pr phases and phases with prs do not", () => {
  const home = epicHome();
  newPhases(home, "e", [{ slug: "review", title: "Design review", kind: "manual" }, { slug: "code", title: "Code" }]);
  assert.equal(readPhase(home, "e", 1).meta.kind, "manual");
  assert.equal(readPhase(home, "e", 2).meta.kind, "pr");
  const shipped = setPhaseStatus(home, "e", 1, "shipped", "2026-09-08T10:00:00Z");
  assert.equal(shipped.meta.status, "shipped");
  assert.equal(shipped.meta.shipped_at, "2026-09-08T10:00:00Z");
  assert.throws(() => setPhaseStatus(home, "e", 2, "shipped", NOW), /only a manual phase with no linked prs can be shipped by hand/);
});

test("dropPhase removes a draft and refuses anything else", () => {
  const home = epicHome();
  newPhases(home, "e", [{ slug: "a", title: "A" }, { slug: "b", title: "B" }]);
  setPhaseStatus(home, "e", 1, "planned");
  const dropped = dropPhase(home, "e", 2);
  assert.equal(dropped.meta.slug, "b");
  assert.deepEqual(listPhases(home, "e").map((p) => p.meta.id), [1]);
  assert.throws(() => dropPhase(home, "e", 1), /cannot drop phase 1: status is planned/);
  const [c] = newPhases(home, "e", [{ slug: "c", title: "C" }]);
  assert.equal(c.meta.id, 2, "ids continue from the highest remaining");
});
```

Append to `test/cli-structure.test.ts`:

```ts
test("phase new --manual, set --status shipped, and drop", async () => {
  const home = await setup();
  assert.equal((await run(["phase", "new", "e", "review", "--title", "Design review", "--manual"], ctx(home))).code, 0);
  assert.equal(readPhase(home, "e", 1).meta.kind, "manual");
  const bad = await run(["phase", "new", "e", "--phase", "a:A", "--manual"], ctx(home));
  assert.match(bad.stderr, /--manual applies to the single form only/);
  await run(["phase", "new", "e", "code", "--title", "Code"], ctx(home));
  const refused = await run(["phase", "set", "e", "2", "--status", "shipped"], ctx(home));
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /only a manual phase/);
  const ok = await run(["phase", "set", "e", "1", "--status", "shipped", "--json"], ctx(home));
  assert.equal(ok.code, 0);
  assert.equal(readPhase(home, "e", 1).meta.shipped_at, NOW);
  const drop = await run(["phase", "drop", "e", "2"], ctx(home));
  assert.equal(drop.code, 0);
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "e: drop phase 2");
  const noDrop = await run(["phase", "drop", "e", "1"], ctx(home));
  assert.match(noDrop.stderr, /cannot drop phase 1: status is shipped/);
});
```

Every existing `PhaseMeta` literal in tests (`test/phase.test.ts` `mk` and the lifecycle test, `test/epic.test.ts` `phasesOf`) gains `kind: "pr"` so typecheck passes.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/validate.test.ts test/phase.test.ts test/cli-structure.test.ts`
Expected: FAIL on `kind`, `dropPhase`, and the new command forms.

- [ ] **Step 3: Types and validation**

In `cli/schema/types.ts` add, after `Outcome`:

```ts
export type PhaseKind = "pr" | "manual";
export const PHASE_KINDS: readonly PhaseKind[] = ["pr", "manual"];
```

and `kind: PhaseKind;` to `PhaseMeta` after `status`. In `validate.ts` import `PHASE_KINDS` and add to the returned object:

```ts
    kind: o.kind === undefined ? "pr" : oneOf(o, "kind", file, PHASE_KINDS),
```

- [ ] **Step 4: Phase library**

In `cli/lib/phase.ts`: `NewPhaseInput` gains `kind?: PhaseKind` (import the type). In `newPhases`, the meta literal gains `kind: input.kind ?? "pr"`. Replace `MANUAL_TRANSITIONS` and `setPhaseStatus` with:

```ts
const MANUAL_TRANSITIONS: Record<"planned" | "reviewed" | "shipped", readonly PhaseStatus[]> = {
  planned: ["draft", "planned"],
  reviewed: ["shipped"],
  shipped: ["draft", "planned", "in-progress"],
};

export function setPhaseStatus(home: string, epic: string, id: number, status: "planned" | "reviewed" | "shipped", now?: string): Phase {
  const phase = readPhase(home, epic, id);
  if (!MANUAL_TRANSITIONS[status].includes(phase.meta.status)) {
    throw new Error(`cannot set phase ${id} to ${status} from ${phase.meta.status}`);
  }
  if (status === "shipped") {
    if (phase.meta.kind !== "manual" || phase.meta.prs.length > 0) throw new Error("only a manual phase with no linked prs can be shipped by hand");
    phase.meta.shipped_at = now ?? new Date().toISOString();
  }
  phase.meta.status = status;
  writePhase(phase);
  return phase;
}

export function dropPhase(home: string, epic: string, id: number): Phase {
  const phase = readPhase(home, epic, id);
  if (phase.meta.status !== "draft") throw new Error(`cannot drop phase ${id}: status is ${phase.meta.status}`);
  unlinkSync(phase.path);
  return phase;
}
```

Add `unlinkSync` to the `node:fs` import.

- [ ] **Step 5: Commands**

In `cli/commands/phase.ts`, `phaseNew` options gain `manual: { type: "boolean" }`; after parsing:

```ts
  const manual = flag(values, "manual");
  if (manual && optList(values, "phase").length > 0) throw new Error("--manual applies to the single form only");
  if (slug !== undefined) inputs.push({ slug, title: needString(values, "title"), linear: optList(values, "linear"), kind: manual ? "manual" : "pr" });
```

(replacing the existing single-form push; import `flag`). In `phaseSet`, the status check becomes:

```ts
    if (status !== "planned" && status !== "reviewed" && status !== "shipped") throw new Error("--status must be planned, reviewed, or shipped");
    setPhaseStatus(ctx.home, epic, id, status, ctx.now());
```

Add:

```ts
async function phaseDrop(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals } = parse(args, {});
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const dropped = dropPhase(ctx.home, epic, id);
  const epicDoc = readEpic(ctx.home, epic);
  epicDoc.updated = ctx.now();
  writeEpic(ctx.home, epicDoc);
  commit(ctx.home, `${epic}: drop phase ${id}`);
  return { json: dropped.meta, text: `dropped phase ${id} ${dropped.meta.slug}` };
}
```

register `case "drop": return phaseDrop(rest, ctx);`, update the usage error to `new|write|set|drop`, and in `cli/planet.ts` USAGE change the phase line to `phase new|write|set|drop` and add `--manual` to the phase new hint if one is shown.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "add phase kind, manual completion, and phase drop"
```

---

### Task 2: `last_approved_step` and kind in status

**Files:**
- Modify: `cli/lib/view.ts`, `cli/commands/status.ts`
- Test: `test/cli-epic.test.ts`, `test/cli-status.test.ts`

**Interfaces:**
- Produces: `EpicView.last_approved_step: Step | null`, the `step` of the highest-id proposal with `outcome: approved`, or null when none or when that step is `unknown`. `StatusRow.current` reads `2 review (manual)` for a manual phase.

- [ ] **Step 1: Write the failing tests**

Append to `test/cli-epic.test.ts`:

```ts
import { createProposal, markApproved, markRejected } from "../cli/lib/proposal.ts";
import { SESSION, NOW } from "./helpers.ts";

test("epic show reports the last approved step", async () => {
  const home = tmpHome();
  await run(["epic", "new", "e", "--title", "E", "--repo", "o/r"], ctx(home));
  const view = async () => (await run(["epic", "show", "e", "--json"], ctx(home))).json as EpicView;
  assert.equal((await view()).last_approved_step, null);
  const base = { phase: null, session: SESSION, toolUse: null, planFile: null, body: "x" };
  createProposal(home, "e", { ...base, step: "intake" }, NOW);
  assert.equal((await view()).last_approved_step, null, "pending does not count");
  markApproved(home, "e", 1, "x");
  assert.equal((await view()).last_approved_step, "intake");
  createProposal(home, "e", { ...base, step: "scoping" }, NOW);
  markRejected(home, "e", 2, "no");
  assert.equal((await view()).last_approved_step, "intake", "a later rejection does not advance it");
  createProposal(home, "e", { ...base, step: "scoping" }, NOW);
  markApproved(home, "e", 3, "x");
  assert.equal((await view()).last_approved_step, "scoping");
});
```

Merge imports with the existing ones in that file. Append to `test/cli-status.test.ts`:

```ts
test("status marks a manual current phase", async () => {
  const home = tmpHome();
  createEpic(home, { slug: "m", title: "M", repo: "o/r" }, NOW);
  newPhases(home, "m", [{ slug: "review", title: "Design review", kind: "manual" }]);
  const r = await run(["status", "--no-sync", "--json"], ctx(home));
  const rows = r.json as StatusRow[];
  assert.equal(rows.find((x) => x.slug === "m")?.current, "1 review (manual)");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/cli-epic.test.ts test/cli-status.test.ts`
Expected: FAIL, `last_approved_step` undefined; current lacks the suffix.

- [ ] **Step 3: Implement**

In `cli/lib/view.ts`: add `last_approved_step: Step | null;` to `EpicView` (import `Step` type), and in `epicView`:

```ts
  const approved = proposals.filter((p) => p.meta.outcome === "approved");
  const lastStep = approved.length ? approved[approved.length - 1].meta.step : null;
  const last_approved_step: Step | null = lastStep === null || lastStep === "unknown" ? null : lastStep;
```

and include `last_approved_step` in the returned object. In `cli/commands/status.ts` `buildRows`:

```ts
      current: current ? `${current.id} ${current.slug}${current.kind === "manual" ? " (manual)" : ""}` : null,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test && npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "expose the last approved step and manual phases in views"
```

---

### Task 3: Harness budgets and hidden set

**Files:**
- Modify: `test/skills.test.ts`

- [ ] **Step 1: Update the constants**

```ts
const HIDDEN = new Set(["planet-proposal", "planet-intake", "planet-scoping", "planet-phasing", "planet-phase-plan"]);
const WORD_BUDGET: Record<string, number> = { go: 1000, "planet-proposal": 300, "planet-intake": 1500, "planet-scoping": 1500, "planet-phasing": 1500, "planet-phase-plan": 1500 };
```

`REQUIRED_SKILLS` is unchanged here; Tasks 5 to 7 append their names.

- [ ] **Step 2: Run and commit**

Run: `npm test`

```bash
git add test/skills.test.ts
git commit -m "raise the router budget and register the chain skills as hidden"
```

---

### Task 4: Router changes

**Files:**
- Modify: `skills/go/SKILL.md`

**Interfaces:**
- Consumes: `EpicView.last_approved_step`; the three step skills invoked as `planet:planet-scoping`, `planet:planet-phasing`, `planet:planet-phase-plan` with lines `epic:`, `dir:`, and `reason:` when handing up; their return lines `scoping done, next step phasing`, `phasing done, N phases drafted, next step phase-plan`, `phase N planned`, `re-cut from phase N: <why>`, `back to scoping: <why>`.

- [ ] **Step 1: Replace steps 5 to 8 and the example**

Replace the current step 5 with:

```markdown
5. **Choose the step** from the epic view, using `last_approved_step`, `paths.plan`, and `phases` (this view is the `epic` field in the `planet open` payload), without reading any file. No `paths.plan`: intake. `last_approved_step` is `intake`: scoping. `scoping`: phasing. Any phase with status `draft`: phase-plan, lowest id first. No drafts and no phase `shipped`: say `every phase is planned; implement one with /planet:go <slug> implement <N>, or wait for a merge` and stop. Any phase `shipped` with no retro: say `next step: retro (not built yet); the epic is saved, /planet:go <slug> resumes here` and stop. A step named in the request wins.
```

Replace step 7 with:

```markdown
7. **Dispatch.** Run `planet session step <step>`. Invoke the skill `planet:planet-<step>` with `epic: <slug>` and `dir: <epic.paths.dir>`; intake also gets `prior art: <PR urls or none>`; a hand-up (step 9) also gets `reason: <why>`. When it returns, act on its last line:
   - `... done, next step <name>`: run `planet epic show <slug> --json`, which is read-only and returns the same view as the payload's `epic` field, then go to step 5 with it.
   - `phase N planned`: go to step 8.
   - `re-cut from phase N: <why>` or `back to scoping: <why>`: go to step 9.
   Never dispatch the same step twice without an approval in between; if a step returns without one, stop and say why.
```

Replace step 8 with steps 8 to 10:

```markdown
8. **After a phase is planned.** Ask with AskUserQuestion, three options: `Implement phase N here`, `Plan the next phase`, `Stop`. Implement: run `planet session start <slug> --phase N`, print the phase file path from the view, and stop; planning is over for this session. Plan next: run `planet epic show <slug> --json` and go to step 5. Stop: say `/planet:go <slug>` plans more and `/planet:go <slug> implement N` starts implementation, then run `planet session end`.
9. **Hand-ups.** `re-cut from phase N: <why>`: dispatch phasing with `reason: re-cut from phase N: <why>`. `back to scoping: <why>`: dispatch scoping with `reason: back to scoping: <why>`. Either goes through step 7 once; a second hand-up in the same run stops with the reason shown.
10. **Done.** When the user says they are done, run `planet session end`.
```

Add to step 3, before the resolve bullets, one sentence: "Requests may carry an instruction after the epic: `implement N` (step 8's Implement path, run directly), a step name (`scoping`, `phasing`, `phase-plan`), `re-cut from phase N` or `back to scoping` (step 9)." Extend step 6's repo check to "before intake, scoping, or phase-plan".

Replace the Example with:

```markdown
## Example

Request `continue the GQL thing`. `planet open` returns `match: "gql-migration"`; say `opened gql-migration`. The view has `last_approved_step: "scoping"` and no phases, so the step is phasing. `gh repo view` is not needed for phasing. Run `planet session step phasing`, invoke `planet:planet-phasing` with the slug and dir. It returns `phasing done, 4 phases drafted, next step phase-plan`. Refresh the view; phase 1 is a draft, so dispatch phase-plan. It returns `phase 1 planned`. Ask: implement here, plan next, or stop.
```

Add troubleshooting lines: "`last_approved_step` is null but `paths.plan` exists: the plan was written outside the gate. Treat it as intake done." and "A step returns without a `done`, `planned`, or hand-up line: report its last message and stop."

- [ ] **Step 2: Check budget and validate**

Run: `npm test && claude plugin validate .`
Expected: the `go` conventions test passes under 1,000 words; validation passes.

- [ ] **Step 3: Commit**

```bash
git add skills/go/SKILL.md
git commit -m "route scoping, phasing, and phase-plan through the router"
```

---

### Task 5: `planet-scoping`

**Files:**
- Create: `skills/planet-scoping/SKILL.md`, `skills/planet-scoping/references/shapes.md`, `skills/planet-scoping/references/plan-v2-template.md`, `skills/planet-scoping/references/sweep-brief.md`
- Modify: `test/skills.test.ts` (`REQUIRED_SKILLS` gains `"planet-scoping"`), `docs/superpowers/notes/2026-09-07-skill-baselines.md`

**Interfaces:**
- Consumes: router input lines `epic:`, `dir:`, optional `reason:`; `planet epic show`; the gate `planet:planet-proposal` with `epic`, `to: plan`; `planet proposal approve` writes `plan.md`.
- Produces: return line `scoping done, next step phasing`, or `back to intake: <why>`.

- [ ] **Step 1: Baseline, run by the controller before dispatch**

Subagent prompt, no skill: "Epic `gql-migration` has a `plan.md` with Problem, Context, Constraints, and Open questions from an intake step, and no approach yet. Produce the next planning document: goal, non-goals, success criteria, and a chosen technical approach. `planet` is on PATH." Record under `## planet-scoping` what went wrong: for example deciding the approach without asking, asking several questions in one message, writing phases, writing `plan.md` directly, dropping intake's sections.

- [ ] **Step 2: Write the references**

`references/shapes.md`:

````markdown
# Question sets by shape of work

Examples to borrow from, one question per message. Skip anything the ticket or
plan.md already answers.

## Feature
- Who sees this first, and behind which flag?
- Is there a design? Where, and is it final?
- What does rollout look like: internal, beta, everyone?
- What metric or signal says it worked?
- What is deliberately not in the first version?

## Migration or refactor
- What must keep working unchanged while this lands?
- Is there a hard cutover, or do old and new coexist for a while?
- Who else is changing the same code right now?
- What tells us it is done: a grep that returns nothing, a deleted module, a metric?

## Escalation
- What is the user-visible symptom, and how often?
- Is a fix needed before the cause is understood?
- What is the minimum change that stops the bleeding, and what is the proper fix?

## Decomposing a PRD into tickets
- Which team owns which part?
- What is the first ticket that proves the shape of the whole?
- What is out of the PRD's first release?

## Anything else
- What does done look like?
- What would make you reject the result?
- What is out?
````

`references/plan-v2-template.md`:

````markdown
# plan.md v2 headings

Approving to `plan` replaces the whole file, so the draft carries v1's Problem
and Context unchanged, then adds the sections below. Remove v1's "Open
questions for scoping": their answers live in Goal, Approach, and Constraints.

```
# <Epic title>

## Problem
(from v1, unchanged)

## Context
(from v1; add `- Design: <link>` when a design exists)

## Goal
What done looks like, in the user's words where possible. Two to four sentences.

## Non-goals
Bullets. What is out, including things the user said no to.

## Success criteria
Bullets. Observable checks: a metric, a grep, a behavior, a review passed.

## Approach
The chosen approach in one or two paragraphs.

### Considered
- <alternative>: two lines on why not.

## Sequencing notes
Bullets for phasing: what must come first, what can run in parallel, where a
design review or rollout sits, whether the work ships dark.

## PR budget
One line, only when the default does not fit: `PR budget: <files> files or
<commits> commits; <why>`.

## Constraints
(from v1, plus any "(decided during review)" lines)
```

Under 800 words. No phases, no file-level plan.
````

`references/sweep-brief.md`:

````markdown
# Codebase sweep brief

Send this to one general-purpose subagent only when picking an approach needs
codebase facts the research does not hold. Fill the angle-bracket slots.

```
You are answering questions for a planning step. Read only; do not edit source
files, do not run `planet` commands, do not enter plan mode.

Epic: <slug>. Repo: <owner/name>, checked out in the current directory.
Question: <the one thing the approach choice hinges on>.

Answer with file paths and, where useful, counts from `rg`. Write the answer to
<dir>/research/scoping-<topic>.md under 300 words. Reply with the file path and
at most five lines.
```
````

- [ ] **Step 3: Write the skill**

`skills/planet-scoping/SKILL.md`:

````markdown
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

Input from the router: `epic: <slug>`, `dir: <path>`, and `reason: <text>` when a later step sent the work back. Precondition: `plan.md` exists and the last approved step is intake. Output: `plan.md` v2 through the gate. Scoping decides what and why. Phasing decides the cut. Phase-plan decides how.

## Critical rules

- Read `plan.md` and the research files its Context links. Nothing else from the store.
- One question per message, multiple choice when the options are known. Stop when goal, non-goals, and success criteria are settled.
- The user picks the approach in chat. The gate carries the finished document, never a menu of approaches.
- `plan.md` is written only by `planet proposal approve`. Approving to `plan` replaces the file, so the draft carries v1's sections.
- Do not invoke superpowers brainstorming. This step is Planet's brainstorm.

## Steps

1. **Read.** `plan.md`, then each `research/` file its Context links. If `reason:` was passed, read it first; it says what a later step could not resolve.
2. **Shape.** Ask what kind of work this is: a feature, a migration or refactor, an escalation, decomposing a PRD into tickets, or something else. `references/shapes.md` has example questions per shape. Borrow; do not run down a list.
3. **Converse.** One question at a time: what done looks like, what is out, what would make the user reject the result. For a feature also: whether a design exists and where, the flag and who sees it first, what rollout looks like, what metric says it worked. A clear ticket may need only two questions. Never re-ask what `plan.md` answers.
4. **Approaches.** In one message, propose two or three approaches, each in three to five lines with trade-offs, the recommendation first with why. Wait for the pick. If the pick hinges on a codebase fact the research lacks, dispatch one general-purpose subagent with `references/sweep-brief.md`, read its five lines, and continue.
5. **Draft.** Compose `plan.md` v2 in context from `references/plan-v2-template.md`: v1's Problem and Context kept, a design link added to Context when there is one, then Goal, Non-goals, Success criteria, Approach with alternatives under Considered, Sequencing notes, a PR budget line only when the default does not fit, Constraints. Under 800 words.
6. **Gate.** Invoke `planet:planet-proposal` with `epic: <slug>`, `to: plan`. On rejection, amend the draft in place; a decision in the message becomes a Constraint marked "(decided during review)". Gate again.
7. **Return** `scoping done, next step phasing`.

## Example

`plan.md` describes moving SVG assets into the design system. Shape: migration. Questions: must every import keep working during the move (yes, no hard cutover); is anyone else touching those files this month (one team, coordinate). Approaches: move then rewrite imports in batches; rewrite imports through a path alias first, then move; a codemod in one PR. Recommendation: alias first. The user picks it. Draft v2 with Sequencing notes that the alias lands before any file moves. Gate, approve, return.

## Troubleshooting

- No `plan.md`: return `back to intake: no plan.md` to the router.
- The plan already has an Approach and no `reason:` was passed: say so; the user can name `scoping` in the request to redo it, in which case proceed and the new v2 replaces the old.
- The subagent fails: choose from the research on hand and say so under Approach.
- The gate reports the hooks did not run: stop and return that message.
````

- [ ] **Step 4: Register and check**

`REQUIRED_SKILLS` gains `"planet-scoping"`. Run: `npm test && claude plugin validate .`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "add the planet-scoping step skill"
```

---

### Task 6: `planet-phasing`

**Files:**
- Create: `skills/planet-phasing/SKILL.md`, `skills/planet-phasing/references/cut-patterns.md`, `skills/planet-phasing/references/phases-section.md`
- Modify: `test/skills.test.ts` (`REQUIRED_SKILLS` gains `"planet-phasing"`), `docs/superpowers/notes/2026-09-07-skill-baselines.md`

**Interfaces:**
- Consumes: `planet phase new <epic> <slug> --title <t> [--manual] [--linear ID]`, `planet phase drop <epic> <id>`, `planet epic show`, the gate with `to: plan`.
- Produces: return line `phasing done, N phases drafted, next step phase-plan`.

- [ ] **Step 1: Baseline, run by the controller before dispatch**

Subagent prompt, no skill: "Epic `gql-migration` has an approved `plan.md` with an Approach and Sequencing notes and no phases. Break the work into phases that each map to a PR, and record them. `planet` is on PATH; `planet --help` lists commands." Record under `## planet-phasing`: for example phases sized by topic rather than PR, no dark-shipping, no manual phases, creating phases before any approval, oversized phases with no size stated.

- [ ] **Step 2: Write the references**

`references/cut-patterns.md`:

````markdown
# Cut patterns

Examples to borrow from. Cut by the principles in SKILL.md; match nothing here
mechanically.

## Expand-contract, for a wide migration
1. Add the new form beside the old; nothing uses it yet.
2. Migrate callers in batches under budget, each batch one PR.
3. Remove the old form.
4. Protect the new location: lint rule, barrel, or package boundary.

## Tracer bullet then widen, for a feature
1. A thin end-to-end slice behind a feature flag: one path through every layer.
2. Widen by user-visible capability, one per phase, all behind the flag.
3. Design review before the UI phases it gates: manual.
4. Rollout: internal, then beta, then everyone: manual.
5. Remove the flag.

## Spike then build, when the approach is uncertain
1. A throwaway spike that answers the question: manual, with the answer written to research/.
2. The real phases, cut once the answer is known.

## Diagnose, fix, harden, for an escalation
1. Reproduce and find the cause: manual, findings to research/.
2. The smallest fix that stops the symptom.
3. The proper fix, or the guard that prevents recurrence.

## Decompose a PRD into tickets
Each phase is one ticket to write, ordered as the work would be built; the
first proves the shape of the whole. The epic's output is the ticket set, so
every phase is manual and "done" is the ticket existing in Linear.
````

`references/phases-section.md`:

````markdown
# Phases section format

Appended to plan.md as `## Phases`. One entry per phase, in order. After
approval, the `planet phase new` calls mirror these entries exactly.

```
## Phases

### 1. <Title> (<slug>)
<one paragraph of scope: what changes and what is left alone>
- Depends on: none | phase N
- Size: about <files> files, <commits> commits | not applicable because <why>
- Closes: <Linear ID> | none

### 2. <Title> (<slug>) — manual
<what done means for this phase>
- Depends on: phase 1
- Size: not applicable
- Closes: none
```

Slugs are kebab-case and unique within the epic. "manual" after the title marks
a phase with no PR.
````

- [ ] **Step 3: Write the skill**

`skills/planet-phasing/SKILL.md`:

````markdown
---
name: planet-phasing
description: Only invoked by the Planet router, never on its own. Third planning step for a Planet epic: cuts the approved approach into ordered phases that each map to one PR or a manual step, writes the Phases section of plan.md through the proposal gate, then creates the draft phases with the planet CLI. Do not use outside a Planet session.
user-invocable: false
allowed-tools: Bash(planet *)
compatibility: Claude Code with the planet plugin loaded.
metadata:
  version: 0.1.0
---

# Planet: phasing

Input from the router: `epic: <slug>`, `dir: <path>`, and `reason: re-cut from phase N: <why>` when phase-plan sent a phase back. Precondition: the last approved step is scoping and no phases exist, or a re-cut reason. Output: `plan.md` v3 with a Phases section through the gate, then draft phases in the store.

## Critical rules

- Read `plan.md` only. The research is distilled into it.
- Cut by the principles below. `references/cut-patterns.md` holds examples to borrow from, not a menu.
- The approved Phases section is the source of truth. The `planet phase new` calls after approval mirror it exactly, in order.
- Never drop a phase that is not a draft.

## Principles

- Each phase is independently shippable and reviewable, and the epic's goal is visible in it.
- Order by dependency, then by uncertainty: the phase most likely to change the plan goes first.
- Each phase fits the budget by a rough count, about 20 files or 8 commits unless `plan.md` has a `PR budget:` line, or its entry says why the budget does not apply.
- Anything user-visible ships dark until a deliberate rollout phase.
- Work that produces no PR is still a phase, marked manual: design review, rollout, investigation, tickets to write.

## Steps

1. **Read** `plan.md`: Approach, Sequencing notes, PR budget, Constraints. With a re-cut reason, read it first; phases below N stay as they are and the section is redrawn from N onward.
2. **Cut** by the principles. Consult `references/cut-patterns.md` when the work resembles one of its shapes.
3. **Draft** the Phases section in the format of `references/phases-section.md`, appended to `plan.md` as v3 with everything above it unchanged. On a re-cut, entries below N are copied verbatim.
4. **Gate.** Invoke `planet:planet-proposal` with `epic: <slug>`, `to: plan`. On rejection, amend in place and gate again.
5. **Create.** On a re-cut, first run `planet phase drop <epic> <id>` for every draft with id N or higher. Then run one `planet phase new <epic> <slug> --title "<title>"` per entry in section order, adding `--manual` where the entry says manual and `--linear <ID>` where it names a ticket, all chained with `&&` in one Bash command. If the chain stops partway, drop the drafts it created, fix the failing entry, and rerun.
6. **Verify** with `planet epic show <epic> --json` that `phases` lists the entries in order with the right kinds.
7. **Return** `phasing done, N phases drafted, next step phase-plan`.

## Example

Approach: alias first, then move SVGs, then rewrite imports. Cut: 1 add the path alias (pr); 2 move the files, alias keeps imports working (pr); 3 rewrite design-system imports (pr); 4 rewrite app imports in two directory batches (pr, pr); 5 lint rule protecting the new location (pr); 6 update the adding-an-icon guide (pr). Sizes stated per entry; entry 4 notes the sweep exceeds the file budget by design and is split by directory. Gate, approve, then one chained command with six `planet phase new` calls.

## Troubleshooting

- Phases already exist and no re-cut reason was passed: say so and return; the user can pass `re-cut from phase 1` to redo everything.
- `planet phase drop` refuses a phase: it is no longer a draft. Stop and report; re-cutting a planned or in-progress phase is a scoping decision.
- `planet phase new` reports a duplicate slug: an existing phase has it. Rename in the section and re-gate the section only if the change is visible to the user; otherwise fix the slug and rerun.
- The gate reports the hooks did not run: stop and return that message.
````

- [ ] **Step 4: Register and check**

`REQUIRED_SKILLS` gains `"planet-phasing"`. Run: `npm test && claude plugin validate .`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "add the planet-phasing step skill"
```

---

### Task 7: `planet-phase-plan`

**Files:**
- Create: `skills/planet-phase-plan/SKILL.md`, `skills/planet-phase-plan/references/phase-template.md`, `skills/planet-phase-plan/references/sweep-brief.md`
- Modify: `test/skills.test.ts` (`REQUIRED_SKILLS` gains `"planet-phase-plan"`), `docs/superpowers/notes/2026-09-07-skill-baselines.md`

**Interfaces:**
- Consumes: `planet epic show`, `planet phase set <epic> <id> --status planned [--linear ID]`, the gate with `to: phase:N`.
- Produces: return lines `phase N planned`, `re-cut from phase N: <why>`, `back to scoping: <why>`.

- [ ] **Step 1: Baseline, run by the controller before dispatch**

Subagent prompt, no skill: "Epic `gql-migration` has an approved `plan.md` with an Approach and a Phases section; phase 2, `move-files`, is a draft with an empty body. Write the plan for phase 2 as the document an implementation session will follow. `planet` is on PATH." Record under `## planet-phase-plan`: for example no size estimate, task-level detail instead of a PR document, no commit sequence, writing the phase body directly, re-deciding the approach.

- [ ] **Step 2: Write the references**

`references/phase-template.md`:

````markdown
# Phase document

```
# Phase <N>: <title>

## Context
Why this phase now, what came before it and what follows, in two to four
sentences. Link plan.md's Approach section and the research files used.

## Changes
1. <concern>: what changes, with nested bullets for nuance.
2. ...

## Decisions
### <the tricky choice>
What was chosen and why, two to five sentences. Omit the section when nothing
was tricky.

## Commit sequence
1. <one line per commit, in order: moves and renames first, refactors before
   behavior, tests with the behavior they cover>

## Verification
How a reviewer checks it. Flag name first when there is one. Numbered steps for
a flow; one sentence for a spot check.

## Size
About <files> files, <commits> commits. Basis: <one line>.

## Out of scope for this phase
Bullets, naming the phase that owns each item when known.

## Closes
<Linear ID> | none

Before starting, run `planet session start <epic> --phase <N>`.
```

For a manual phase, Changes becomes Steps and Verification becomes Done means.
Commit sequence and Size are omitted.
````

`references/sweep-brief.md`:

````markdown
# Phase sweep brief

Send this to one general-purpose subagent when the phase touches code that
research/codebase.md does not already cover. Fill the angle-bracket slots.

```
You are researching one phase of a plan. Read only; do not edit source files,
do not run `planet` commands, do not enter plan mode.

Repo: <owner/name>, checked out in the current directory.
Phase: <title>. Scope: <the paragraph from the Phases section>.

Answer with file paths:
1. The files this phase will change, and the modules that import each.
2. Tests that pin the current behavior of those files.
3. Patterns neighbouring code follows that the change should match.
4. Anything in the scope paragraph that the code contradicts.

Write to <dir>/research/phase-<N>.md under 500 words. Reply with the file path
and at most five lines a planner must know, including a rough count of files
that will change.
```
````

- [ ] **Step 3: Write the skill**

`skills/planet-phase-plan/SKILL.md`:

````markdown
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

Input from the router: `epic: <slug>`, `dir: <path>`, and the phase: the lowest-id draft unless the request named one. Output: the phase body through the gate to `phase:<N>`, status `planned`. Phase-plan decides how, inside one phase. Scoping decided what and why; phasing decided the cut.

## Critical rules

- Read `plan.md`'s Approach, Sequencing notes, PR budget, and this phase's entry; the previous phase's body when there is one, and its retro when it shipped. Nothing else from the store.
- Measure before drafting. An oversized phase gets a proposed cut and a hand-up, never a plan document.
- Ask only when the code surfaces a choice `plan.md` does not settle and the answer changes the PR's shape. A question that shows the approach or the cut was wrong goes back up.
- The phase body is written only by `planet proposal approve`.

## Steps

1. **Read** as the rules say. `planet epic show <epic> --json` gives the phase's id, slug, kind, and path.
2. **Sweep.** If `research/codebase.md` does not cover the files this phase touches, dispatch one general-purpose subagent with `references/sweep-brief.md`. It writes `research/phase-<N>.md` and returns five lines including a rough file count. Read the five lines, not the file.
3. **Clarify.** Ask, one at a time, only per the rule above. Typical: two existing patterns and the plan names neither; a shared type must change and the choice is shim now or touch every consumer; a test pins behavior the phase means to change. If an answer or a finding shows the cut was wrong, return `re-cut from phase <N>: <why>`; if it shows the approach was wrong, return `back to scoping: <why>`.
4. **Size check.** Estimate commits and changed files from the sweep and the entry. Budget: the `PR budget:` line in `plan.md`, else about 20 files or about 8 commits. Under: continue. Over: say what grew, propose a cut in one message, and on agreement return `re-cut from phase <N>: <the agreed cut>`. Write no plan document for an oversized phase.
5. **Draft** in context from `references/phase-template.md`. Commit sequence follows the user's git conventions: moves and renames first, refactors before behavior, tests with the behavior they cover, one line each. Size states the two numbers and the basis. For a manual phase use Steps and Done means.
6. **Gate.** Invoke `planet:planet-proposal` with `epic: <slug>`, `to: phase:<N>`. On rejection, amend in place and gate again.
7. **Set.** `planet phase set <epic> <N> --status planned`, adding `--linear <ID>` when Closes names a ticket the phase's frontmatter lacks.
8. **Return** `phase <N> planned`.

## Example

Phase 2, `move-files`, pr kind. `research/codebase.md` covers the directory, so no sweep. No question: the alias from phase 1 settles how imports survive the move. Size: about 460 files moved but zero content changes, 2 commits; the entry says the file budget does not apply to a pure move. Draft: Context links the Approach; Changes lists the `git mv` and the alias target update; Commit sequence: move, then alias; Verification: typecheck and the icon story render. Gate, approve, set planned, return `phase 2 planned`.

## Troubleshooting

- The named phase is not a draft: say its status and stop; a planned phase is re-planned only when the user names it and confirms.
- No draft exists: return `nothing to plan` to the router.
- The subagent fails: draft from the entry and `research/codebase.md`, and say so in Context.
- `planet phase set` refuses: the phase changed under you; refresh with `planet epic show` and report.
- The gate reports the hooks did not run: stop and return that message.
````

- [ ] **Step 4: Register and check**

`REQUIRED_SKILLS` becomes `["go", "planet-proposal", "planet-intake", "planet-scoping", "planet-phasing", "planet-phase-plan"]`. Run: `npm test && claude plugin validate .`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "add the planet-phase-plan step skill"
```

---

### Task 8: README and plugin version

**Files:**
- Modify: `README.md`, `.claude-plugin/plugin.json`

- [ ] **Step 1: Update**

In README's Use section, replace the paragraph starting "The router opens an epic" with:

```markdown
The router opens an epic and runs the next planning step: intake, scoping,
phasing, then phase-plan for each phase. After a phase is planned it offers to
start implementation in the session, plan the next phase, or stop. Retro
follows. Planning documents are approved through native plan mode; the hooks
record what was proposed, approved, edited, and rejected.
```

Bump `.claude-plugin/plugin.json` version to `0.3.0` and set the description to `Epic planning across PRs: intake, scoping, phasing, phase plans through plan mode, PR sync`.

- [ ] **Step 2: Verify and commit**

Run: `npm test && claude plugin validate .`

```bash
git add -A
git commit -m "document the planning chain and bump the plugin version"
```

---

### Task 9: Live verification

Manual, in a fresh `claude --plugin-dir /Users/scottmahr/code/personal/planet` session from the close-ui repo. The epic `move-icons-into-design-system` is at "intake approved". Record outcomes in `docs/superpowers/notes/2026-09-07-planning-chain-live.md`.

- [ ] **Step 1: Scoping.** `/planet:go move-icons`. Expected: `opened`, step scoping, a shape question, then one question at a time, an approaches message, your pick, plan mode with v2. Reject once, approve. Check `plan.md` has Goal through Constraints and no Open questions section; `planet feedback report move-icons-into-design-system` shows the scoping rejection tagged.
- [ ] **Step 2: Phasing.** The router should continue to phasing without another `/planet:go`. Expected: plan mode with a Phases section; approve; one chained Bash command creating the phases; `planet epic show ... --json` lists them in order with kinds; `last_approved_step` is `phasing`.
- [ ] **Step 3: Phase-plan.** Expected: sweep or a stated skip, a size check line, the phase document in plan mode, approve, `phase 1` at `planned`, then the three-option question. Choose Stop; expected two resume lines and `session end`.
- [ ] **Step 4: Implement request.** `/planet:go move-icons implement 1`. Expected: the marker for this session carries `phase: 1` (`cat ~/.planet/sessions/*`), the phase path printed, the router exits.
- [ ] **Step 5: Step override.** In a new session, `/planet:go move-icons scoping`. Expected: scoping runs again with a note that an Approach exists; reject the first proposal to abort, or approve if you want the new version.
- [ ] **Step 6: Re-cut, if reachable.** If any phase-plan flags a phase over budget, follow the cut through: phasing drops drafts from N and recreates them; ids continue from the highest remaining. If none is flagged, note that the path was reviewed as text only.
- [ ] **Step 7: Record.** Deviations, fixes as their own commits, then `record planning chain live verification`.

---

## Self-review notes

- Spec coverage: decisions table → Tasks 1, 2, 4 to 7; step boundaries → the hand-up lines in Tasks 4 and 7; CLI changes → Tasks 1 and 2; budgets → Task 3; testing → each task plus Task 9; error handling → each skill's Troubleshooting.
- Names: `last_approved_step` in view.ts and the router; `--manual`, `phase drop`, `--status shipped` in CLI and phasing; return lines `scoping done, next step phasing`, `phasing done, N phases drafted, next step phase-plan`, `phase N planned`, `re-cut from phase N: <why>`, `back to scoping: <why>` identical in Tasks 4 to 7.
- The router's example uses `last_approved_step: "scoping"` and dispatches phasing, consistent with Task 4's table.
