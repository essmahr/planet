# Planet skills, follow-on 3: scoping, phasing, phase-plan

Follow-on 3 of `2026-09-03-planet-design.md`, after `2026-09-07-planet-skills-design.md`.
It adds the forward planning chain: `planet-scoping`, `planet-phasing`, and
`planet-phase-plan`, plus the router changes that connect them and four small
CLI changes. With these, an epic goes from intake's problem statement to a
planned phase and into implementation. Retro is follow-on 4 and feedback-review
follow-on 5; each waits for the data that can test it.

## Decisions

| Question | Decision |
|---|---|
| Shape of a phase plan | The user's PR-document style: Context, Changes by concern, Decisions, Commit sequence, Verification, Size, Out of scope, ticket, footer. An implementation session may expand it into task-level detail locally. |
| Catching oversized phases early | Phase-plan estimates commits and changed files before drafting and compares them with a budget. Over budget means a proposed cut and a hand-back to phasing, not a plan document. No static analysis tool yet; `planet radius` is a possible follow-up if retros show it would have caught real overruns. |
| PR budget | Default about 20 files or about 8 commits, in the phase-plan skill. `plan.md` may carry an override line for sweeps where the count is meaningless. |
| After a phase is planned | AskUserQuestion: Implement here, Plan next, Stop. Context clearing is the user's to do; the router does not try. |
| Approach selection | In chat during scoping, one question at a time, like a brainstorm. The gate carries only the resulting document. |
| Cutting rules | Principles in the skill body; patterns in a reference file as examples, not a menu. Works for migrations, features, escalations, and decomposing a PRD into tickets. |
| Phases without PRs | `kind: manual`, completed by hand with `planet phase set --status shipped`. |
| Re-cutting | Drafts from the split point onward are dropped and recreated in order, so id order stays sequence order. |
| "Scoping done" signal | `planet epic show` exposes `last_approved_step` from the proposals' frontmatter. No prose parsing. |
| Clarifying questions in phase-plan | No fixed count. Ask when the code surfaces a choice the plan does not settle and the answer changes the PR's shape. A question that shows the approach or the cut was wrong goes back up. |

## Step boundaries

- Scoping decides what and why: goal, non-goals, success criteria, approach.
- Phasing decides the cut: which phases, in what order, of what kind and size.
- Phase-plan decides how, inside one phase, from reading the code for that phase.

A lower step never patches over a higher step's mistake. It returns to the
router with `back to scoping` or `re-cut from phase N` and the reason, and the
router dispatches that step with the reason attached.

## Skills

Conventions from the two earlier specs apply. Budgets: router 1,100 words (raised
from 800), each new skill 1,500. Each skill has Critical rules, Steps,
Troubleshooting, hidden from the slash menu, description opening "Only invoked
by the Planet router", `allowed-tools` with `Bash(planet *)`.

### `planet-scoping`

Precondition: `plan.md` exists and `last_approved_step` is `intake`. Output:
`plan.md` v2 through the gate to `plan`, the whole document.

1. Read `plan.md` and the research files its Context links. Nothing else.
2. Ask the shape of the work first: feature, migration or refactor, escalation,
   decomposing a PRD, or something else. `references/shapes.md` holds example
   question sets per shape; the conversation adapts, it does not follow a list.
3. Guided conversation, one question at a time, multiple choice when the
   options are known: what done looks like, what is out, what would make the
   user reject the result. For a feature: whether a design exists and where,
   the flag and who sees it first, what rollout looks like, what metric says it
   worked. Stop when goal, non-goals, and success criteria are settled.
4. Propose two or three approaches in chat with trade-offs and a
   recommendation. The user picks. One subagent sweep to `research/` when a
   pick needs codebase facts the research lacks, as intake does it.
5. Draft `plan.md` v2 in context from `references/plan-v2-template.md`: intake's
   Problem and Context kept, Context gaining any design link; then Goal,
   Non-goals, Success criteria, Approach with the alternatives in two lines each
   under Considered, Sequencing notes for phasing, and a PR budget line only
   when the default does not fit. Under 800 words.
6. Gate to `plan`. On rejection amend and re-gate.
7. Return `scoping done, next step phasing`.

### `planet-phasing`

Precondition: `last_approved_step` is `scoping` and no phases exist, or the
router passed `re-cut from phase N`. Output: `plan.md` v3 with a Phases section
through the gate, then draft phases in the store.

1. Read `plan.md` only.
2. Cut by the principles in the skill body: each phase independently shippable
   and reviewable with the epic's goal visible in it; order by dependency, then
   by uncertainty; each phase within budget by a rough count, or the entry
   says why the budget does not apply; anything user-visible ships dark until a
   deliberate rollout phase; work that produces no PR is still a phase.
   `references/cut-patterns.md` holds examples to borrow from: expand-contract
   for a wide migration; tracer bullet then widen for a feature, with flag,
   design review, rollout, and flag removal; spike then build when the approach
   is uncertain; diagnose, fix, harden for an escalation; a PRD decomposed into
   the tickets to write.
3. Draft the Phases section: per phase a heading with title and slug, kind when
   `manual`, a paragraph of scope, dependencies, rough size, and the Linear
   ticket it closes if one maps. Gate to `plan`. On rejection amend and
   re-gate. The approved section is the source of truth for what the phases
   are.
4. After approval, one `planet phase new <epic> <slug> --title "<title>"` call
   per phase in id order, `--manual` on the phases the section marks manual,
   chained with `&&` in a single Bash command so it costs one tool turn. Bodies
   stay empty. If the chain stops partway, drop the drafts it created and rerun
   it; drafts are disposable.
5. Return `phasing done, N phases drafted, next step phase-plan`.

Re-cut: with `re-cut from phase N`, run `planet phase drop` on every draft
with id N or higher, then proceed from step 2 for the remaining work, keeping
phases below N as they are.

### `planet-phase-plan`

Precondition: a draft phase exists; the router names the lowest id, or the one
in the request. Output: the phase body through the gate to `phase:N`, status
`planned`.

1. Read `plan.md`'s Approach, Sequencing notes, budget line, and this phase's
   entry. Read the previous phase's body when there is one, and its retro when
   it has shipped. Nothing else from the store.
2. One subagent sweep when the phase touches code the research has not covered:
   files involved, tests that pin their behavior, patterns neighbouring code
   follows. It writes `research/phase-N.md` and returns five lines. Skipped
   when `research/codebase.md` already answers.
3. Clarify by the two rules under Step boundaries. Approach and cut questions go
   back up.
4. Size check. Estimate commits and changed files from the sweep and the entry.
   Compare with the budget: the `plan.md` override, else about 20 files or
   about 8 commits. Under: continue. Over: say what grew, propose a cut in
   chat, and on agreement return `re-cut from phase N` with the reason. No
   plan document is written for an oversized phase.
5. Draft from `references/phase-template.md`: `# Phase N: <title>`; Context,
   why now and what precedes and follows; Changes numbered by concern with
   nested bullets; Decisions under their own headings when a choice was tricky;
   Commit sequence following the user's git conventions, moves and renames
   first, refactors before behavior, tests with the behavior they cover;
   Verification, flag name first when there is one; Size, the two numbers and
   one line of basis; Out of scope for this phase; the Linear ticket it closes;
   the fixed footer `Before starting, run planet session start <epic> --phase
   <N>`. A `manual` phase replaces Changes with Steps and Verification with
   Done means.
6. Gate to `phase:N`. On rejection amend and re-gate.
7. After approval: `planet phase set <epic> <N> --status planned`, plus
   `--linear` when the phase maps to a ticket the frontmatter lacks.
8. Return `phase N planned`.

## Router changes

- Step selection from the epic view, with `last_approved_step`: no plan →
  intake; `intake` → scoping; `scoping` → phasing; any draft phase → phase-plan;
  no drafts and nothing shipped → say every phase is planned, implement or wait
  for a merge; a shipped phase without a retro → retro, not built yet. A step
  named in the request wins.
- Post-phase menu, AskUserQuestion after `phase N planned`: Implement here runs
  `planet session start <slug> --phase N`, prints the phase path, exits; Plan
  next returns to step selection; Stop prints `/planet:go <slug>` and
  `/planet:go <slug> implement N` as the two ways back, then `planet session
  end`.
- Requests understood beyond an epic: `implement N`; a step name; `re-cut from
  phase N` and `back to scoping` as hand-ups from a lower step, dispatched with
  the reason attached. The router never dispatches the same step twice without
  a new approval in between.
- Repo check before any step that sweeps the codebase: intake, scoping when it
  sweeps, phase-plan.

## CLI changes

- `epic show` adds `last_approved_step: Step | null`, the step of the highest
  approved proposal.
- Phase frontmatter gains `kind: pr | manual`, default `pr`. The single form of
  `phase new` accepts a `--manual` flag; the batch form stays pr-only and
  phasing does not use it. Status shows the kind.
- `phase set --status shipped` is allowed only for a `manual` phase with no
  linked PRs, and sets `shipped_at`.
- `phase drop <epic> <id>` deletes a `draft` phase and refuses anything else.
  Commit `<epic>: drop phase <id>`.

## Testing

- Unit tests for each CLI change: `last_approved_step` with none, pending only,
  and mixed outcomes; `kind` default and batch syntax; `shipped` refused for
  `pr` kind and for a manual phase with PRs; `drop` refusing a planned phase.
- Skills harness registers the three skills at 1,500 words, router at 1,000;
  reference files checked by the existing reference check.
- Baselines per skill before writing, recorded in the baselines notes file.
- Live: the icons epic goes scoping → phasing → phase-plan on phase 1 → menu →
  Stop; then `/planet:go <slug> implement 1` confirms the marker carries the
  phase; a run naming a step confirms the override. The re-cut path is
  exercised only if a phase is flagged; otherwise it is reviewed as text and
  noted.

## Error handling

- Scoping without `plan.md`, or phasing with phases present and no re-cut
  reason: return to the router with why, no writes.
- Phase-plan on a phase that is not a draft: say its status and stop.
- Subagent failure: draft without the sweep and say so in Context.
- Gate failures as in follow-on 2.

## Later

- `planet radius`, a static blast-radius measure, if retros show overruns it
  would have caught.
- Figma context pulled into `research/` by intake through the Figma MCP.
- Retro (follow-on 4) records actual commits and files beside the Size
  estimate; feedback-review (follow-on 5) shows the ratio over time.

## Amendments to earlier specs

- Router budget 800 → 1,100 words.
- Phase frontmatter gains `kind`; `phase set --status shipped` gains the manual
  case; `phase drop` added. The design spec's Lifecycle rules read: phase
  `shipped` is set by sync for `pr` phases and by `phase set` for `manual`.
