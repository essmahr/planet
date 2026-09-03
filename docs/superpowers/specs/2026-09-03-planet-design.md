# Planet: design

Planet is Scott's personal planning workflow for epics that span several PRs
and may map to several Linear tickets. It is a Claude Code plugin: a set of
skills for planning, a CLI that owns all structured state, and hooks that
capture proposals, feedback, and PR links without manual steps.

Two ideas drive the design:

- **Deterministic where possible.** Scripts read and write state, render
  tables, and talk to `gh`. Claude asks questions, proposes, and judges. Claude
  never parses or hand-edits state files.
- **The planning process learns.** Every proposal Claude shows and every
  prompt Scott types during planning is recorded verbatim. A review step reads
  across epics and proposes edits to the planning skills themselves.
- **Every model turn is the expensive part.** Tool round trips, re-read prose,
  and unbounded inputs cost more than any script. The CLI collapses round
  trips, returns only what the next step needs, and pre-aggregates anything
  Claude would otherwise read raw.

## Use cases

**Start an epic from a ticket.** Trigger: `/planet CRM-123` or `/planet new
<free text>`. Steps: intake pulls the ticket and explores the codebase, scoping
asks questions and proposes an approach, phasing cuts it into PR-sized phases.
Result: an epic directory with `plan.md` and draft phases.

**Continue an epic.** Trigger: `/planet continue the GQL thing`. Steps: sync,
resolve the epic, offer any pending retro, plan the next draft phase. Result:
one phase moved to `planned`, ready for an implementation session.

**Glance at status.** Trigger: `/planet` with no text, or `planet status` in a
terminal. Steps: sync, render the table. Result: every active epic, its current
phase, open PRs, and anything waiting on Scott. No further action.

**Close the loop after a merge.** Trigger: the router notices a shipped phase
with no retro, or `/planet retro <epic>`. Steps: read the merged diffs against
the phase plan, write the retro, propose edits to later phases. Result: phase
`reviewed`, later phases adjusted.

## Success criteria

Rough targets, measured from the store itself where possible.

- The router resolves the epic without asking in most invocations, and
  reaches the step skill in one CLI call on the happy path.
- Status needs one CLI call and no Claude judgment.
- Revisions per approved proposal and inline edits per approved proposal trend
  down over time, per step. These are the feedback loop's own metrics, computed
  from `proposals/`.
- No planning prompt from Scott is lost: every prompt in a marked session
  appears in `prompts.jsonl`.
- No PR opened from a marked implementation session needs a manual `planet link`.
- Step skills never load outside the router.

## Decisions

| Question | Decision |
|---|---|
| Where state lives | Central store at `~/.planet/`, itself a git repo. Not in project repos. |
| Shape of an epic | A directory. Script-owned state file plus free-form files. |
| Phase to PR link | Phase frontmatter holds a list of PR URLs. One phase may have several PRs. PRs never reference Planet. |
| How PRs get linked | PostToolUse hook catches `gh pr create` in a session with an active phase. `planet link` is the manual fallback. |
| Merge detection | On demand. `planet status` and the router run `planet sync` first, skipped when the last sync is fresh. No background jobs. |
| Approval gate | Native plan mode. Proposals are written to the session's plan file and reviewed through ExitPlanMode, so inline editing in VS Code and Ultraplan work unchanged. |
| Feedback capture | Hooks on ExitPlanMode snapshot what Claude proposed, your inline edits, and any rejection message. A UserPromptSubmit hook logs every prompt verbatim. Claude adds a tag only on rejections. |
| Relation to superpowers | Planet owns the whole planning flow so every step can learn. Superpowers stays for execution: TDD, worktrees, review. |
| Entry point | `/planet` in Claude is primary. The CLI is the same code, usable from a terminal for `status` and `link`. |
| Language | TypeScript run directly by Node 24. No build step. No Bun. |
| Linear | Read-only, Claude-side, via the existing Linear MCP. Ticket IDs stored as strings for context. GitHub closes tickets, not Planet. |
| Retro trigger | Router lists shipped-but-unreviewed phases and offers the retro. `/planet retro <epic>` also works. |
| Skill shape | One user-invoked router, several model-invoked step skills, plus a `planet-proposal` skill shared by every step. Step skills are hidden from the slash menu and only reached through the router. |

## Repository layout

```
planet/
  .claude-plugin/plugin.json
  hooks/hooks.json              four events -> planet capture (see Hooks)
  README.md                     for humans; no README inside any skill folder
  skills/
    planet/SKILL.md             user-invoked router
    planet-proposal/SKILL.md    the approval gate, invoked by every step skill
    planet-intake/SKILL.md      step skills, model-invoked via the router only
    planet-scoping/SKILL.md
    planet-phasing/SKILL.md
    planet-phase-plan/SKILL.md
    planet-retro/SKILL.md
    planet-feedback-review/SKILL.md
    */references/               per-skill detail, loaded on demand
  cli/
    planet.ts                   entry, subcommand dispatch
    commands/                   one file per subcommand
    lib/                        store, frontmatter, gh, table, git
    schema/                     state types and validator
  bin/planet                    bash shim: exec node cli/planet.ts "$@"
  bin/planet-hook               hook shim: exits before Node unless a marker exists
  docs/superpowers/specs/
  test/
```

Runtime split:

- **CLI** owns every read and write of structured state and every `gh` call.
  Skills call it through Bash as `${CLAUDE_PLUGIN_ROOT}/bin/planet` and read
  `--json` output. It knows nothing about Claude beyond two environment
  variables. Terminal use needs `bin/` on PATH separately; the plugin does not
  install it.
- **Skills** own conversation: questions, proposals, judgment.
- **Hooks** are one CLI subcommand, `planet capture`, wired to four Claude Code
  events through `bin/planet-hook`. The shim reads the event JSON, pulls the
  session id with `sed`, and exits 0 before starting Node unless
  `sessions/<session-id>` exists. Node only runs in a Planet session.

The store path is `~/.planet/`, overridable with `PLANET_HOME` for tests.

## Store

```
~/.planet/                          git repo, committed by the CLI after each write
  epics/<slug>/
    epic.yaml                       script-owned
    plan.md                         epic-level prose: problem, goal, non-goals, approach, ordering
    phases/NN-<slug>.md             frontmatter script-owned, body Claude-owned
    proposals/NNN-<step>.md         verbatim snapshot of each proposal shown to Scott
    feedback/prompts.jsonl          hook-written, one line per prompt
    feedback/notes.md               Claude-written tags pointing at proposals
    retros/NN-<slug>.md             plan-versus-shipped write-up per phase
    research/                       subagent output: one file per sweep
    <anything else>                 dumps, screenshots, free-form
  sessions/<session-id>             marker, one JSON line: epic slug, phase id or null, step or null
  hook.log                          hook errors, never surfaced to Claude
```

### epic.yaml

```yaml
slug: gql-migration
title: GQL migration
repo: closeio/close-ui            # owner/name, for gh
status: planning                  # planning | active | paused | shipped | abandoned
linear: [CRM-123]
created: 2026-09-03T15:02:00Z
updated: 2026-09-03T15:02:00Z
synced_at: null                   # last successful gh sync
shipped_at: null
sessions: [<claude session ids>]
```

### Phase frontmatter

```yaml
id: 1
slug: schema-codegen
title: Schema codegen
status: draft                     # draft | planned | in-progress | shipped | reviewed
linear: [CRM-124]
prs:
  - url: https://github.com/closeio/close-ui/pull/1234
    state: merged                 # open | merged | closed, written by sync
    merged_at: 2026-09-10T18:20:00Z
  - url: https://github.com/closeio/close-ui/pull/1240
    state: open
    merged_at: null
shipped_at: null                  # set by sync when the last PR merges
```

### Proposals

`proposals/NNN-<step>.md` is the plan file exactly as Claude wrote it, captured
by the PreToolUse hook before Scott sees it. When Scott approves with inline
edits, the edited plan file is stored as `proposals/NNN-<step>.edited.md`. Both
are written only by the hook.

```yaml
id: 3
step: phasing                     # intake | scoping | phasing | phase-plan | retro | feedback-review
phase: null                       # phase id when the step is about one phase
session: <claude session id>
tool_use: <ExitPlanMode tool_use_id, or null when snapshotted by planet propose>
plan_file: <path Claude Code saved the plan to, or null>
created: 2026-09-03T15:40:00Z
outcome: pending                  # pending | approved | rejected
edited: false                     # true when the approved plan differs from the snapshot
feedback: null                    # verbatim rejection message, when rejected
```

### feedback/prompts.jsonl

One object per line, written only by the hook:

```json
{"ts":"2026-09-03T15:41:10Z","session":"<id>","kind":"planning","phase":null,"proposal":3,"text":"<prompt verbatim>"}
```

`kind` is `planning` when the session marker has no phase and `implementation`
when it does. `proposal` is the highest proposal id in the epic at the moment
the prompt arrived, which answers "what was Scott reacting to" without Claude's
help.

### feedback/notes.md

Appended by Claude, one line per rejected proposal:

```
- proposal 3 · reorder
```

Tags come from a fixed list: `scope-cut`, `scope-add`, `reorder`,
`wrong-assumption`, `too-granular`, `too-coarse`, `style`, `other`. The
rejection text itself is already in the proposal's frontmatter, and inline
edits need no tag because the diff is the signal.

### Lifecycle rules

Applied by the CLI only.

- Phase `draft`: sketched by the phasing step. Several phases may sit in draft
  ahead of time.
- Phase `planned`: detailed plan approved. Set by `planet phase set`.
- Phase `in-progress`: set by `planet link` on the first PR.
- Phase `shipped`: set by `planet sync` when every linked PR is merged.
  `shipped_at` is that moment. A PR closed without merge is recorded as
  `closed` and flagged in status. The phase status does not change.
- Phase `reviewed`: set by `planet phase set` after the retro is written.
- Epic `planning` until the first `planet link`, then `active`. `shipped` when
  every phase is `reviewed`. `paused` and `abandoned` are manual.

### Ownership

`epic.yaml`, phase frontmatter, proposal files, `prompts.jsonl`, and session
markers are written only by the CLI, whether invoked by Claude or by a hook.
Phase bodies and `plan.md` are written from an approved plan file through
`planet proposal approve --to`. `notes.md`, retros, and everything unlisted are
written by Claude directly.

## CLI

Every subcommand accepts `--json`. Every write validates, writes, and commits
to the store repo with a generated message, in that order. A validation failure
leaves the store untouched and exits non-zero with a message Claude can act on.

Only `status` and `link` are expected to be run by Scott from a terminal. They
get readable output. Everything else is run by Claude and prints one
confirmation line when not in JSON mode.

### Read

- `planet status [--all] [--no-sync] [--force]`. Runs sync unless every epic's
  `synced_at` is under the max age, five minutes by default. Then one row per
  epic: slug, repo, status, phases shipped of total, current phase, open PRs,
  unreviewed shipped phases, last synced. Hides `shipped` and `abandoned`
  unless `--all`. When `gh` is unavailable, renders from stored state and marks
  the output stale. `--json` returns the rows only, no table formatting.
- `planet open "<text>" [--step <name>]`. The router's happy path in one call:
  sync as above, resolve the text, and when exactly one epic matches, start the
  session marker and return `status` plus `epic show` for it in one payload.
  Zero or several matches return the candidates and the status rows, and set
  nothing.
- `planet epic show <slug>`. `epic.yaml`, every phase's frontmatter, and paths
  to `plan.md`, each phase body, each retro, and the latest proposal. Never
  bodies. The step skill reads only the paths it needs.
- `planet epic resolve "<text>"`. Exact slug, then case-insensitive substring
  on slug and title, then Linear ID. Returns all candidates.
- `planet check`. Validates every file the CLI owns across the store.

### Write, structure

- `planet epic new <slug> --title <t> --repo <owner/name> [--linear ID...]`
- `planet epic set <slug> [--status paused|abandoned|active] [--linear ...] [--title ...]`
- `planet phase new <epic> <slug> --title <t> [--linear ID...]`, repeatable
  as `--phase <slug>:<title>` pairs so phasing creates every draft in one call
  and one commit. Assigns the next ids, status `draft`, empty bodies.
- `planet phase write <epic> <id> --body-file <path>`. Replaces the body, keeps frontmatter.
- `planet phase set <epic> <id> --status planned|reviewed [--linear ...]`.
- `planet link <epic> <id> <pr-url>...`. Validates the URL against the epic's repo.
- `planet unlink <epic> <id> <pr-url>`.

### Write, process

- `planet proposal approve <epic> <id> --to plan|phase:<n> [--from <path>]`.
  Marks the proposal approved and writes the approved text to `plan.md` or the
  phase body, preserving frontmatter. The text defaults to what the hook
  captured at approval, edits included; `--from <path>` overrides it.
- `planet propose <epic> <step> --file <path> [--phase <id>]`. Manual snapshot
  for paths that skip ExitPlanMode. Prints the id.
- `planet session start <epic> [--phase <id>] [--step <name>]`,
  `planet session step <name>`, and `planet session end`. Session id from
  `CLAUDE_CODE_SESSION_ID`, overridable with `--session <id>`. `start` also
  appends the id to `epic.yaml` sessions.
- `planet capture`. Hook entry, see below.

### Aggregate

Pre-computed views so Claude reads a report, never raw files.

- `planet pr files <epic> <phase>`. Files changed across the phase's merged PRs
  with added and removed line counts, from `gh`. The retro step reads full
  diffs only for files the phase plan named.
- `planet feedback report [epic]`. Per step: proposals, rejection rate, edit
  rate, revisions per approval. Every rejection message verbatim. Unified diffs
  of edited approvals, trimmed to changed hunks. Tag counts from `notes.md`.
  This is the input to feedback-review and the source of the success-criteria
  trends.

### Sync

- `planet sync [epic] [--force]`. Skipped when `synced_at` is under the max
  age unless forced. One `gh api graphql` call per repo covering every linked
  PR not yet in a terminal state. Updates PR entries, `synced_at`, flips phase
  and epic statuses, prints what changed.

## Hooks

Four events run `bin/planet-hook`, which exits 0 before starting Node unless a
session marker exists, then `planet capture` reads Claude Code's JSON from
stdin and dispatches on `hook_event_name`.

- **UserPromptSubmit.** Append the prompt to the epic's `prompts.jsonl` with
  `kind`, `phase`, and the current highest proposal id.
- **PreToolUse, matcher ExitPlanMode.** Copy the session's plan file to
  `proposals/NNN-<step>.md` with `outcome: pending`, using the marker's step and
  phase. This is what Claude proposed, before any edit.
- **PostToolUse, matcher ExitPlanMode.** Read the tool result and the plan file
  again. Approved: set `outcome: approved`, and if the file differs from the
  snapshot, store it as `.edited.md` and set `edited: true`. Rejected: set
  `outcome: rejected` and store the message verbatim in `feedback`.
- **PostToolUse, matcher Bash.** Exit 0 unless the marker has a phase and the
  command contains `gh pr create`. Otherwise pull the PR URL from the tool
  output and run the same code path as `planet link`.

Hooks never block. Any error exits 0 and appends to `~/.planet/hook.log`.

Two facts to verify in the CLI spec before relying on them:

- Whether PostToolUse fires for ExitPlanMode on a rejection. If not, the
  rejection message arrives as Scott's next prompt and UserPromptSubmit still
  captures it; the proposal then stays `pending` until the next snapshot
  supersedes it.
- Whether Ultraplan reviews go through ExitPlanMode. If not, `planet propose`
  is the fallback and the step skill calls it before presenting.

## Skills

### Conventions

Every skill follows Anthropic's skill-authoring guide. The per-skill specs carry
the exact values; this spec sets the rules.

- **Frontmatter.** `name` matches the folder, kebab-case. `description` states
  what the skill does and when to use it, with trigger phrases, under 1024
  characters, and no angle brackets. CLI placeholders like `<epic>` stay out of
  descriptions. `compatibility` names the dependencies: Claude Code hooks, the
  session ID environment variable, `gh`, Node 24, and the Linear MCP where
  used. `metadata.version` is present and bumped on every edit, so a proposal
  can be traced to the skill version that produced it.
- **Step skills stay hidden.** `user-invocable: false` keeps them out of the
  slash menu, and each description opens with a negative trigger: "Only
  invoked by the planet router." Their triggering tests are all
  should-not-trigger cases.
- **Superpowers stays off during planning.** Superpowers brainstorming
  describes itself as mandatory before any creative work and will try to take
  over a scoping step. The router SKILL.md states that Planet owns planning in
  this session and superpowers planning skills are not to be invoked.
  Superpowers execution skills are unaffected.
- **SKILL.md shape.** Critical rules first. Numbered steps, each with the
  command to run and what its output looks like. One or two examples. A
  troubleshooting section for the skill's own failure modes, such as `gh`
  unauthenticated, no session ID, store missing, or an ambiguous resolve.
  Detail goes in `references/`.
- **Size budgets.** Skill content is re-injected on every invocation. Router
  under 800 words. `planet-proposal` under 300, since it runs at every gate.
  Step skills under 1,500.
- **Scripts over prose.** Any check that can be a CLI command is a CLI
  command, never an instruction to "make sure".
- **Read only what the step needs.** A step opens the paths `epic show` gives
  it for its own inputs and nothing else. Never `cat` the epic directory.
- **Subagents share memory through the store.** A subagent gets a command to
  run and a file path, not a context transplant. It writes results to
  `research/` or another free-form file in the epic directory and returns the
  path plus a few lines of summary. Subagents never call ExitPlanMode and
  never run Planet write commands: hooks are keyed on the session id, which
  subagents share, so a subagent exiting plan mode would corrupt proposal
  snapshots.

### Router: `/planet [text]`

1. No text: run `planet status --json`, print the table, list shipped phases
   without a retro, ask what Scott wants. Stop if the table was the point.
2. With text: run `planet open "<text>"`. One match: the marker is set and the
   payload holds status and the epic view. Say which epic was picked. Zero or
   several: Claude picks the likely one from the returned status rows and
   confirms in one line, then runs `planet open <slug>`. A Linear ID or URL
   with no match means a new epic. Never a silent guess. If the session is
   already in plan mode, the router says so and asks Scott to leave it first,
   since plan mode blocks the CLI writes.
3. Choose the step from the frontmatter in the payload, before reading any
   prose, unless the text names one: no `plan.md` → intake; plan but no phases
   → scoping, then phasing; a draft phase → phase-plan; a shipped phase without
   a retro → offer retro first.
4. `planet session step <name>`, then dispatch to the step skill, passing the
   paths it needs from the payload. When it returns, go to 3.
5. `planet session end` when Scott is done.

All CLI writes happen outside plan mode: before a step enters it, or after
ExitPlanMode returns.

Implementing a phase is out of scope. The router prints the phase file path
and stops.

### Step skills

Each is model-invoked and reached only through the router. Each has one input
and one output. Clarifying questions happen in chat. Every document a step
produces goes through `planet-proposal`: drafted in the plan file, reviewed in
plan mode, written to its destination on approval.

- **intake.** From a Linear ticket or a prompt. Pull ticket context via the
  Linear MCP, explore the codebase with a subagent, find related PRs. Output:
  problem statement, known constraints, open questions in `plan.md`.
- **scoping.** Clarifying questions one at a time. Goal, non-goals, success
  criteria, then two or three technical approaches with a recommendation.
  Output: the rest of `plan.md`.
- **phasing.** Cut the approach into phases that each map to one PR or a small
  set. Ordering, dependencies, expand-contract for wide refactors, what can run
  in parallel. Output: one `planet phase new` per phase with a short body, all
  draft.
- **phase-plan.** Detailed plan for one phase: files, approach, tests, commit
  sequence following Scott's git conventions, the Linear ticket it closes.
  Output: the phase body, status `planned`. Ends with a fixed footer:
  "Before starting, run `planet session start <epic> --phase <id>`."
- **retro.** For a shipped phase: `planet pr files` for the change list, full
  diffs only for files the phase plan named, a subagent summary for the rest,
  all against the phase plan. Output: `retros/NN-<slug>.md` covering what
  deviated and why, classed as plan was wrong, discovered during
  implementation, or scope changed. Then proposed edits to remaining phases
  through `planet-proposal`. Sets status `reviewed`.
- **feedback-review.** Cross-epic, via `/planet review feedback`. Reads
  `planet feedback report`, not raw files, plus retros. Groups recurring
  pushback and proposes concrete edits to the step skills' own `SKILL.md`
  files in this repo. Scott approves each edit.

Each step skill gets its own spec before it is written.

### Proposal skill: `planet-proposal`

Model-invoked, hidden, called by every step skill at every approval gate. It is
a skill rather than a shared reference file so each step skill stays
self-contained and the feedback loop edits the gate in one place. It wraps
native plan mode so Scott reviews in the editor he already uses, with inline
edits, and Ultraplan stays available.

Input: the proposal text and its destination, `plan` or `phase:<n>`. Steps:

1. Enter plan mode. Write the proposal into the session's plan file. Nothing
   else is written while in plan mode.
2. Call ExitPlanMode. The hooks snapshot the proposal, then record the outcome,
   edits, or rejection message. The skill does none of that itself.
3. Rejected: append one tag line to `feedback/notes.md`, return the rejection
   message to the calling step, which edits the plan file in place, never
   regenerates it, and invokes `planet-proposal` again as a new proposal.
4. Approved: `planet proposal approve <epic> <id> --to <destination>`, which
   copies the plan file, edits included, into place. Return approved.

## Testing

- **CLI.** Node's built-in test runner against a temp `PLANET_HOME`. Each
  subcommand: JSON output and resulting files. `gh` lives in one module and is
  replaced with recorded GraphQL fixtures, so sync tests run offline.
- **Hooks.** Fed the JSON Claude Code sends. Cases: no marker, marker without
  phase, `gh pr create` with and without a URL in the output, PreToolUse
  snapshot with and without a marker, PostToolUse with approve,
  approve-with-edits, reject, and a missing plan file, malformed input. Every
  case exits 0.
- **Schema.** One validator over every CLI-owned file, run on each read and by
  `planet check`.
- **Skills, triggering.** For the router: should-trigger cases including
  paraphrases such as "what am I working on" and "continue the GQL thing", and
  should-not-trigger cases such as unrelated coding requests. For every hidden
  skill: should-not-trigger cases only, run by asking Claude when it would use
  the skill.
- **Skills, behavior.** Superpowers writing-skills approach: run the scenario
  without the skill, record what goes wrong, write the skill against those
  failures. Then compare with and without the skill on the same task: questions
  asked, corrections needed, tool calls.

## Error handling

- Hooks never fail a prompt or a tool call. A missing or unreadable plan file
  is logged and the proposal is left `pending`.
- CLI writes are validate, write, commit. Nothing partial.
- `gh` unavailable: sync reports it, status renders stored state marked stale.
- PR closed without merge: entry marked `closed`, phase flagged, no status change.
- Ambiguous resolve and unreviewed phases are reported, never guessed.

## Non-goals

- Implementing phases. Superpowers or plain Claude does that from the phase file.
- Writing to Linear. GitHub closes tickets through its own integration.
- Background sync, cron, or launchd.
- Storing state in project repos or in PR bodies.
- A `planet` CLI that launches Claude. Possible later via `claude "/planet ..."`, not built now.

## Later

Deferred to the step-skill specs or beyond. None of it changes the store, CLI,
or hooks.

- A reviewer subagent for phasing and phase-plan output, run before
  ExitPlanMode so Scott sees fewer first-draft mistakes.
- Parallel subagents in feedback-review, one per epic or per step.
- Model routing per subagent. Mechanical work is scripts, not a cheaper model,
  so there is little to route today.
- Ultraplan as the planner for a whole phase-plan step.
- `planet feedback report` trends rendered as a chart or table over time.

## Follow-on specs

In dependency order:

1. Store and CLI, including hooks.
2. Router and `planet-proposal`.
3. intake, scoping, phasing, phase-plan.
4. retro.
5. feedback-review.

Every skill spec includes: the exact frontmatter, including description,
compatibility, and version; the SKILL.md outline in the shape above; its
should-trigger and should-not-trigger cases; the CLI commands it calls and
their expected output; and its troubleshooting entries.
