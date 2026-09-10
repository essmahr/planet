# Planet feedback loop: design

Follow-on 4 to `2026-09-03-planet-design.md`. Adds the two remaining step
skills, `planet-retro` and `planet-feedback-review`, the events and reports
they read, and three deferred fixes (phase on phase-plan proposals, `proposal
reject`, the scoping word budget). Supersedes the parent design's retro and
feedback-review paragraphs where they differ.

## Problem

Four phases have shipped and 14 rejections are recorded, and nothing reads
them. The parent design's retro compares the shipped diff against the plan;
the user says the plan-versus-final diff is the weakest signal. The strong
ones are: a commit the implement skill could not do as planned, the
refinement passes after Claude called the phase done (renames, removed
comments, test syntax, questioned choices), and post-PR review and CI
feedback. None of these are recorded today, and no one weighs which of them
should change the plugin rather than just this epic.

## Decisions

| Question | Decision |
|---|---|
| When retro runs | Before the next phase-plan: a shipped phase with no retro is the router's next step even when a draft is waiting. A named step in the request (`phase-plan`, `phase-plan N`) still wins, which is how to skip. |
| What retro reads, ranked | Blocked events; the diff from the implemented sha to the PR head plus the user's prompts in that window; PR review comments and failed checks; plan versus shipped last, and short. |
| How deep | Structured inputs from one CLI call; a diff is read only for the implemented-to-head range and for a planned file that did not change or a changed file that was not planned. |
| What retro produces | One file, `retros/NN-<slug>.md`, written through the CLI, then status `reviewed`. No edits to later phases; the next phase-plan reads the retro. A cut the retro finds wrong is a `re-cut from phase N` hand-up. |
| Who weighs | Retro names at most three candidate lessons, each pointing at a skill, and asks one multi-select: which should steer the plugin. Answers are recorded as `steer: yes|no`. Rejections tagged `skill` mark pushback about Planet rather than this plan. |
| Recurrence | Feedback-review drafts an edit only for a steer-yes lesson or `skill` rejection that recurs in two phases (a lesson's `phase`, a rejection's `phase`, null counting as its own) or two epics, or that the user names. The rest is an appendix with counts. |
| How edits land | A findings document through plan mode; on approval, one commit per skill on a branch in the plugin repo, harness run, stop at the branch. The applied record is stored so the next review starts after it. |
| Refix tracking | None. The implemented sha and the prompts cover it. |
| Prompts in later sessions | The marker persists in the implementing session. A new session on a phase starts with `/planet:go <slug> work on N`, which sets the marker and stops. |
| Manual phases | Retro compares Done means against what the user says happened, one question, no diff. |
| Scoping budget | Real plans run 1,200 to 1,300 words. Target becomes about 1,000, at most 1,200, not counting Phases. |

## Store additions

- `epics/<slug>/feedback/events.jsonl`: one line per event,
  `{ts, phase, kind, text, sha, session}`. Kinds: `blocked` (text: the
  return line's why), `implemented` (sha: branch head), `reviewed` (text:
  retro path). Written by `planet phase event`.
- `epics/<slug>/retros/NN-<slug>.md`: frontmatter `phase`, `prs`,
  `implemented_sha`, `head_sha`, `lessons` (list of `{text, skill, steer}`),
  `written`. Body per the retro template. Written by `planet retro write`.
- `reviews/<YYYY-MM-DD>.md` at the store root: the findings document
  feedback-review applied; the branch's git log holds the commit shas.
  Written by `planet proposal approve --to review`.
- `prompts.jsonl` `kind` is `implementation` when the marker step is
  `implement`, else `planning` (today it keys on `phase`, which the phase-plan
  fix below would break).

## CLI changes

- `planet phase event <epic> <id> <kind> [text] [--sha <sha>]`: appends to
  `events.jsonl`, commits `<epic>: phase <id> <kind>`. Kinds validated.
- `planet retro inputs <epic> <id> --json`: one bundle for the retro skill:
  the phase's meta and body path, events for the phase, `pr files` output,
  `pr feedback` output, the implemented sha and each PR's head sha
  (`gh pr view --json headRefOid,mergeCommit`), and the prompts logged after
  the implemented event. Read-only, no gh writes.
- `planet pr feedback <epic> <id>`: per linked PR, review comments (path,
  line, author, body, resolved), reviews with state, and check runs that are
  not success, from `gh`. Text and JSON.
- `planet retro write <epic> <id> --file <path>`: validates the frontmatter
  (lessons entries have text, skill, steer), writes `retros/NN-<slug>.md`,
  appends a `reviewed` event, commits. Does not change status; the skill runs
  `phase set --status reviewed` after.
- `planet feedback report [epic] --json` gains `lessons` (every retro lesson
  with steer, phase, epic), `skill_rejections` (rejections tagged `skill`,
  verbatim), `events` (counts per kind), `reviews` (applied review dates and
  the lesson texts they covered). The text report gains one line per new
  section.
- `planet session review`: marker for a feedback-review session, no epic.
  The capture hook routes that session's proposals to `reviews/proposals/`.
- `planet proposal approve review latest --to review`: writes the approved
  document to `reviews/<date>.md`; the second approval on one day appends a
  suffix.
- `planet proposal reject <epic> latest [--feedback <text>]`: marks a pending
  proposal rejected. Used by step skills after an `aborted` gate, and by hand.
- `planet session step <step> --phase <N>`: sets both fields. The router uses
  it for phase-plan so those proposals carry the phase.
- `FEEDBACK_TAGS` gains `skill`.
- `planet status` REVIEW column already counts shipped phases; unchanged.

## `planet-retro`

Hidden step skill, budget 900. `allowed-tools`: `Bash(planet *)`,
`Bash(git diff *)`, `Bash(git log *)`, `Bash(gh pr view *)`. Input: `epic`,
`dir`, `phase: <N>`. Precondition: status `shipped`. Output:
`retros/NN-<slug>.md`, status `reviewed`, return `retro done for phase <N>`.

Critical rules:

- Read `planet retro inputs`, the phase document, and `plan.md`'s Approach.
  Read a diff only for the implemented-to-head range and for a file the plan
  and the PR disagree on. Nothing else from the store or the repo.
- Rank by signal: blocked events, then the refinement window (diff plus
  prompts), then review and CI feedback, then plan versus shipped.
- Summarize the refinement diff into categories (naming, comments, tests,
  structure, scope, other) with a count and one example each. Never list
  hunks.
- At most three candidate lessons, each naming the skill it would change.
  Ask once which steer the plugin. Record the answer; do not argue it.
- The retro is written only by `planet retro write`; status only by
  `planet phase set`.

Steps:

1. **Inputs.** `planet retro inputs <slug> <N> --json`. Read the phase
   document (either shape: Commits, or Changes and Commit sequence) and
   `plan.md`'s Approach.
2. **Blocks.** For each `blocked` event: which commit, why, what the
   re-plan did (compare the phase document's version history through the
   proposals for that phase).
3. **Refinements.** `git diff <implemented_sha>..<head_sha> --stat` then the
   diff; categorize. Pair categories with the prompts in the window: quote
   each prompt once, under the category it drove. No implemented event: say
   so, skip to step 4.
4. **Review and CI.** From `pr feedback`: group review comments by theme,
   list failed checks with their fix commit if one followed.
5. **Plan versus shipped.** Planned files not changed, changed files not
   planned, commits added or dropped. One paragraph, classed plan wrong,
   discovered, or scope changed. A wrong cut is a hand-up: return
   `re-cut from phase <N>: <why>` instead of writing the retro.
6. **Lessons.** Up to three, each: one sentence, the skill it points at
   (`planet-phase-plan`, `planet-implement`, `planet-scoping`,
   `planet-phasing`, or `not Planet`), and the evidence line. Ask one
   multi-select: which of these should steer the plugin. Record `steer`.
7. **Write.** Compose from `references/retro-template.md`; say the five-line
   summary and the lessons in chat; `planet retro write <slug> <N> --file
   <scratch path>`; `planet phase set <slug> <N> --status reviewed`.
8. **Return** `retro done for phase <N>`.

Manual phase: steps 3 to 5 are replaced by one question, did Done means
hold and what took longer or differed; lessons and write as above.

Template `references/retro-template.md`: frontmatter, then `## Blocks`,
`## Refinements` (category table plus quoted prompts), `## Review and CI`,
`## Plan versus shipped`, `## Lessons` (each with skill and steer). Under 600
words.

## `planet-feedback-review`

Hidden step skill, budget 900. Runs only from the plugin repo: the router
checks that `.claude-plugin/plugin.json` under `git rev-parse
--show-toplevel` contains `"name": "planet"`. `allowed-tools`:
`Bash(planet *)`, `Bash(git *)`, `Bash(npm test)`. Input: `since: <date or none>` from the router (the last
review's date from the report). Output: a findings document through the
gate to `review`, edits committed on a branch, return
`feedback review done, <branch>` or `feedback review done, nothing recurs`.

Critical rules:

- Read `planet feedback report --json` and the retros it lists. Not raw
  proposals or prompts; the report holds the rejections verbatim.
- An edit needs recurrence: the same steer-yes lesson or `skill` rejection
  in two phases or two epics, or one the user named in the request.
  Everything else is the appendix, with counts, no edit.
- Every edit is exact replacement text for a named skill file and line.
  Budgets hold: run `npm test` before committing.
- Never edit `main`. Never edit superpowers, CLAUDE.md, or anything outside
  `skills/`; those go under "not Planet's to fix".

Steps:

1. **Report.** `planet feedback report --json`. Drop lessons and rejections
   already covered by a prior review. Read each retro's Lessons section.
2. **Group.** Cluster by what they ask for, not by wording. A group recurs
   when it spans two phases or two epics. Attach every quote and its source.
3. **Draft** from `references/findings-template.md`: per recurring group,
   the quotes, the count, the skill file and line, the replacement text, and
   the harness effect (words added, budget). Then the appendix: singletons
   and plan-local items with counts, and "not Planet's to fix".
4. **Gate.** `planet:planet-proposal` with `epic: review`, `to: review`. On
   rejection, amend in place and gate again; on `aborted`, return
   `feedback-review aborted: <message>`.
5. **Apply.** `git checkout -b feedback-review/<date>` from `main`; one
   commit per skill file with the approved text; `npm test` before each
   commit. A failing budget is fixed by trimming in that skill, said in the
   commit body.
6. **Return** `feedback review done, <branch>`; with no recurring group,
   skip steps 3 to 5 and return `feedback review done, nothing recurs`.

Template `references/findings-template.md`: `## Recurring` (one subsection
per group: quotes, count, file:line, replacement, budget), `## Appendix`
(singletons, plan-local, not Planet's to fix). Under 1,000 words.

The hooks record proposals only for a marked session, and a review has no
epic. `planet session review` writes a marker `{review: true}`; the capture
hook then stores proposals under `reviews/proposals/` with their own
numbering, and `planet proposal approve review latest --to review` writes the
record. The router runs `planet session review` before dispatching
feedback-review; `planet session end` clears it as for an epic.

## Router changes (`skills/go/SKILL.md`)

- Step 5: before the draft row, `any phase shipped with no retro: retro,
  lowest id first`. The old retro stop row is removed.
- Step 3: `work on N` (set the marker with `planet session start <slug>
  --phase N --step implement`, say so, stop) and `review feedback`
  (feedback-review; the repo check reads `.claude-plugin/plugin.json` under
  the repo root and wants `"name": "planet"`, not the epic's repo; no epic).
- Step 7: retro gets `phase: <N>`; on `retro done for phase N` refresh and go
  to step 5; feedback-review gets `since: <date>` and its two return lines
  end the run.
- Step 7 runs `planet session step phase-plan --phase N` for phase-plan.
- Step 8 leaves the session open after `phase N implemented`: the marker has
  to persist for later prompts to be recorded against the phase, and the
  SessionEnd hook clears it.
- Budget rises to 1,200 words: two dispatch rows and two request forms are
  new behavior, not verbosity.

## Other skill changes

- `planet-implement`: Blockers step runs `planet phase event <slug> <N>
  blocked "<why>"` before returning; step 7 runs `planet phase event <slug>
  <N> implemented --sha $(git rev-parse HEAD)` before the return line. Budget
  rises to 750.
- `planet-proposal`: tag list gains `skill`, chosen when the rejection says
  the skill or Planet should behave differently in general, not this plan.
  `to: review` documented. After `aborted`, step skills run `planet proposal
  reject <epic> latest --feedback "<message>"` so a proposal the hooks did not
  already mark rejected does not stay pending.
- `planet-scoping` and its template: "about 1,000 words, at most 1,200, not
  counting a carried Phases section".
- `planet-phase-plan`: reads the previous phase's retro when it exists
  (already stated); the retro's Lessons for `planet-phase-plan` are applied
  to this draft and said so in Context.

## Not included

- Editing later phases from the retro.
- Recording refix invocations or per-tool events.
- Trends over time or charts from the report.
- Scheduling reviews; feedback-review is on demand.
- Retro for phases shipped before this lands beyond what the inputs hold:
  no implemented sha means the refinement section says so.

## Testing

CLI: unit tests for `phase event` (kinds, sha, commit), `retro write`
(frontmatter validation, path, event), `pr feedback` (gh stub), `retro
inputs` (bundle shape, prompt window), report additions, `proposal reject`,
`approve --to review`, `session step --phase`, prompt kind from step, the
`skill` tag. Harness: two new hidden skills with budgets, templates exist,
router budget 1,200, implement 750. Live: retro on
`finish-security-settings-page` phase 1 (pr, shipped, no implemented event)
and phase 2 (manual); then one implement run that records events and a retro
that reads them; then `review feedback` from the plugin repo with the
threshold met by the `skill`-tagged rejections and steer-yes lessons.
