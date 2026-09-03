# Planet: design

Planet is Scott's personal planning workflow for epics that span several PRs
and may map to several Linear tickets. It is a Claude Code plugin: a set of
skills for planning, a CLI that owns all structured state, and two hooks that
capture feedback and PR links without manual steps.

Two ideas drive the design:

- **Deterministic where possible.** Scripts read and write state, render
  tables, and talk to `gh`. Claude asks questions, proposes, and judges. Claude
  never parses or hand-edits state files.
- **The planning process learns.** Every proposal Claude shows and every
  prompt Scott types during planning is recorded verbatim. A review step reads
  across epics and proposes edits to the planning skills themselves.

## Decisions

| Question | Decision |
|---|---|
| Where state lives | Central store at `~/.planet/`, itself a git repo. Not in project repos. |
| Shape of an epic | A directory. Script-owned state file plus free-form files. |
| Phase to PR link | Phase frontmatter holds a list of PR URLs. One phase may have several PRs. PRs never reference Planet. |
| How PRs get linked | PostToolUse hook catches `gh pr create` in a session with an active phase. `planet link` is the manual fallback. |
| Merge detection | On demand. `planet status` and the router run `planet sync` first. No background jobs. |
| Feedback capture | UserPromptSubmit hook logs every prompt verbatim. Claude adds tags. Proposal snapshots are anchors. |
| Relation to superpowers | Planet owns the whole planning flow so every step can learn. Superpowers stays for execution: TDD, worktrees, review. |
| Entry point | `/planet` in Claude is primary. The CLI is the same code, usable from a terminal for `status` and `link`. |
| Language | TypeScript run directly by Node 24. No build step. No Bun. |
| Linear | Read-only, Claude-side, via the existing Linear MCP. Ticket IDs stored as strings for context. GitHub closes tickets, not Planet. |
| Retro trigger | Router lists shipped-but-unreviewed phases and offers the retro. `/planet retro <epic>` also works. |
| Skill shape | One user-invoked router, several model-invoked step skills. |

## Repository layout

```
planet/
  .claude-plugin/plugin.json
  hooks/hooks.json              UserPromptSubmit + PostToolUse -> planet capture
  skills/
    planet/                     user-invoked router
      SKILL.md
      proposal-protocol.md      shared by every step skill
    planet-intake/SKILL.md      model-invoked step skills
    planet-scoping/SKILL.md
    planet-phasing/SKILL.md
    planet-phase-plan/SKILL.md
    planet-retro/SKILL.md
    planet-feedback-review/SKILL.md
  cli/
    planet.ts                   entry, subcommand dispatch
    commands/                   one file per subcommand
    lib/                        store, frontmatter, gh, table, git
    schema/                     state types and validator
  bin/planet                    bash shim: exec node cli/planet.ts "$@"
  docs/superpowers/specs/
  test/
```

Runtime split:

- **CLI** owns every read and write of structured state and every `gh` call.
  Skills call it through Bash and read `--json` output. It knows nothing about
  Claude beyond two environment variables.
- **Skills** own conversation: questions, proposals, judgment.
- **Hooks** are one CLI subcommand, `planet capture`, wired to two Claude Code
  events. They exit 0 immediately when no epic is active in the session.

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
    <anything else>                 dumps, screenshots, research, free-form
  sessions/<session-id>             marker: active epic slug and optional phase id
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

### Proposal frontmatter

```yaml
id: 3
step: phasing                     # intake | scoping | phasing | phase-plan | retro | feedback-review
phase: null                       # phase id when the step is about one phase
session: <claude session id>
created: 2026-09-03T15:40:00Z
approved: false
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

Appended by Claude, one line per pushback:

```
- proposal 3 · reorder · "phase 2 should come before 1, codegen has no consumers yet"
```

Tags come from a fixed list: `scope-cut`, `scope-add`, `reorder`,
`wrong-assumption`, `too-granular`, `too-coarse`, `style`, `other`. The quote is
the shortest verbatim fragment that identifies the prompt.

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

`epic.yaml`, phase frontmatter, proposal frontmatter, `prompts.jsonl`, and
session markers are written only by the CLI. Phase bodies are written by Claude
through `planet phase write --body-file`, which preserves frontmatter. `plan.md`,
`notes.md`, retros, and everything unlisted are written by Claude directly.

## CLI

Every subcommand accepts `--json`. Every write validates, writes, and commits
to the store repo with a generated message, in that order. A validation failure
leaves the store untouched and exits non-zero with a message Claude can act on.

Only `status` and `link` are expected to be run by Scott from a terminal. They
get readable output. Everything else is run by Claude and prints one
confirmation line when not in JSON mode.

### Read

- `planet status [--all] [--no-sync]`. Runs sync, then one row per epic: slug,
  repo, status, phases shipped of total, current phase, open PRs, unreviewed
  shipped phases, last updated. Hides `shipped` and
  `abandoned` unless `--all`. When `gh` is unavailable, renders from stored
  state and marks the output stale with the last sync time.
- `planet epic show <slug>`. Full `epic.yaml`, every phase's frontmatter, paths
  to `plan.md` and the latest proposal.
- `planet epic resolve "<text>"`. Exact slug, then case-insensitive substring
  on slug and title, then Linear ID. Returns all candidates.
- `planet check`. Validates every file the CLI owns across the store.

### Write, structure

- `planet epic new <slug> --title <t> --repo <owner/name> [--linear ID...]`
- `planet epic set <slug> [--status paused|abandoned|active] [--linear ...] [--title ...]`
- `planet phase new <epic> <slug> --title <t> [--linear ID...]`. Assigns the next id, status `draft`, empty body.
- `planet phase write <epic> <id> --body-file <path>`. Replaces the body, keeps frontmatter.
- `planet phase set <epic> <id> --status planned|reviewed [--linear ...]`.
- `planet link <epic> <id> <pr-url>...`. Validates the URL against the epic's repo.
- `planet unlink <epic> <id> <pr-url>`.

### Write, process

- `planet propose <epic> <step> --file <path> [--phase <id>]`. Stores the snapshot, prints the id.
- `planet proposal approve <epic> <id>`.
- `planet session start <epic> [--phase <id>]` and `planet session end`. Session
  id from `CLAUDE_CODE_SESSION_ID`, overridable with `--session <id>`. `start`
  also appends the id to `epic.yaml` sessions.
- `planet capture`. Hook entry, see below.

### Sync

- `planet sync [epic]`. One `gh api graphql` call per repo covering every
  linked PR not yet in a terminal state. Updates PR entries, flips phase and
  epic statuses, prints what changed.

## Hooks

Both events run `planet capture`, which reads Claude Code's JSON from stdin and
dispatches on `hook_event_name`.

- **UserPromptSubmit.** Look up `sessions/<session_id>`. No marker: exit 0. With
  a marker: append the prompt to that epic's `prompts.jsonl` with `kind`,
  `phase`, and the current highest proposal id.
- **PostToolUse, matcher Bash.** Look up the marker. Exit 0 unless it has a
  phase and the command contains `gh pr create`. Otherwise pull the PR URL from
  the tool output and run the same code path as `planet link`.

Hooks never block. Any error exits 0 and appends to `~/.planet/hook.log`.

## Skills

### Router: `/planet [text]`

1. Run `planet status --json`. With no text: print the table, list shipped
   phases without a retro, ask what Scott wants. Stop
   if the table was the point.
2. With text: run `planet epic resolve`. One candidate: use it and say so. Zero
   or several: Claude picks the likely one from the status table and confirms
   in one line before continuing. A Linear ID or URL with no match means a new
   epic. Never a silent guess.
3. `planet session start <epic>`, then `planet epic show`, `plan.md`, and the
   phase bodies the step needs.
4. Choose the step from state unless the text names one:
   no `plan.md` → intake; plan but no phases → scoping, then phasing; a draft
   phase → phase-plan; a shipped phase without a retro → offer retro first.
5. Dispatch to the step skill. When it returns, go to 4.
6. `planet session end` when Scott is done.

Implementing a phase is out of scope. The router prints the phase file path
and stops.

### Step skills

Each is model-invoked and reached only through the router. Each has one input
and one output and follows the proposal protocol for every approval.

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
- **retro.** For a shipped phase: read the merged PR diffs against the phase
  plan. Output: `retros/NN-<slug>.md` covering what deviated and why, classed
  as plan was wrong, discovered during implementation, or scope changed. Then
  proposed edits to remaining phases through the proposal protocol. Sets
  status `reviewed`.
- **feedback-review.** Cross-epic, via `/planet review feedback`. Reads
  `prompts.jsonl`, `notes.md`, proposals, and retros across all epics, groups
  recurring pushback, and proposes concrete edits to the step skills' own
  `SKILL.md` files in this repo. Scott approves each edit.

Each step skill gets its own spec before it is written.

### Proposal protocol

Shared reference file, followed by every step skill at every approval gate.

1. Write the proposal to a scratch file. Register it with `planet propose`.
   Show it to Scott verbatim.
2. Wait for a response. On pushback: append one line to `feedback/notes.md`
   with the proposal id, a tag, and a short quote. Revise and register the
   revision as a new proposal.
3. On approval: `planet proposal approve`, then write the result to its
   destination through the CLI.

## Testing

- **CLI.** Node's built-in test runner against a temp `PLANET_HOME`. Each
  subcommand: JSON output and resulting files. `gh` lives in one module and is
  replaced with recorded GraphQL fixtures, so sync tests run offline.
- **Hooks.** Fed the JSON Claude Code sends. Cases: no marker, marker without
  phase, `gh pr create` with and without a URL in the output, malformed input.
  Every case exits 0.
- **Schema.** One validator over every CLI-owned file, run on each read and by
  `planet check`.
- **Skills.** Superpowers writing-skills approach: run the scenario without the
  skill, record what goes wrong, write the skill against those failures.

## Error handling

- Hooks never fail a prompt or a tool call.
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

## Follow-on specs

In dependency order:

1. Store and CLI, including hooks.
2. Router and proposal protocol.
3. intake, scoping, phasing, phase-plan.
4. retro.
5. feedback-review.
