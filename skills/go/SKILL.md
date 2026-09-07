---
name: go
description: Planet planning workflow for epics that span several PRs. Shows the status table of active epics, opens an epic by name, Linear ticket, or description, creates a new epic from a ticket, and runs the next planning step. Use for /planet:go, "what am I working on", "continue the GQL epic", "start an epic from CRM-123", "plan the next phase". Not for implementing code or for one-off plans, which use plain plan mode.
argument-hint: "[epic, ticket, or what to work on]"
disable-model-invocation: true
allowed-tools: Bash(planet *), Bash(gh repo view *)
compatibility: Claude Code with the planet plugin loaded. Node 24, gh authenticated, Linear MCP connected for tickets.
metadata:
  version: 0.1.0
---

# Planet: go

## Critical rules

- Planet owns planning here; skip superpowers brainstorming and writing-plans.
- Never enter plan mode here; step skills use the proposal gate.
- Never read `plan.md` or phase bodies; the step skill reads what's needed.
- Never guess the epic; zero or several matches means a confirming question.
- Store writes go only through the `planet` CLI, never by hand under `~/.planet`; step skills write only under `research/`.

## Status

Status rows, refreshed on load:

!`planet status --json`

Request: $ARGUMENTS

## Steps

1. **No request text.** Render a table: EPIC, STATUS, PHASES (`shipped/total`), CURRENT, OPEN PRS, REVIEW; rows with `unreviewed` above zero get "retro pending" in REVIEW. Ask what to work on. Stop.
2. **Plan mode check.** In plan mode, say "leave plan mode first, Planet needs to write to its store" and stop.
3. **Resolve.** Requests may carry an instruction after the epic: `implement N` (step 8's Implement path, run directly), a step name (`scoping`, `phasing`, `phase-plan`), `re-cut from phase N` or `back to scoping` (step 9). Run `planet open '<request text>' --json`, single-quoting the text with any single quote removed.
   - `match` is a slug: say `opened <slug>`. If the request carried `implement N`, go straight to step 8's Implement path with that N; otherwise go to step 5.
   - `match` null, `candidates` not empty: list each candidate slug with title when present, ask which; on an answer run `planet open <slug> --json`, go to step 5. If none, go to step 4 when the request could start a new epic, else stop.
   - `match` null, `candidates` empty: go to step 4 if the request names a Linear ID (e.g. CRM-123), a linear.app URL, or asks to start/plan something new; otherwise ask which epic and stop.
4. **New epic.** With a Linear ID, fetch its title via the Linear MCP `get_issue` tool; otherwise propose a title of at most six words taken from the request. Derive a slug: lowercase letters, digits, hyphens, at most 40 characters, no leading/trailing hyphen. Run `gh repo view --json nameWithOwner -q .nameWithOwner` for the repo. Ask exactly `create epic <slug>, "<title>", repo <owner/name>, from <ID>?`; without a ticket, drop `, from <ID>` and `--linear`. On yes, run `planet epic new <slug> --title "<title>" --repo <owner/name> --linear <ID>` (omit `--linear` if none), then `planet open <slug> --json`. On no, ask what to change, slug, title, or repo, or which existing epic to use instead, then stop. Keep PR numbers/URLs as prior art for intake.
5. **Choose the step** from the epic view, using `last_approved_step`, `paths.plan`, and `phases` (this view is the `epic` field in the `planet open` payload), without reading any file. No `paths.plan`: intake. `last_approved_step` is `intake`: scoping. `scoping`: phasing. Any phase with status `draft`: phase-plan, lowest id first. No drafts and no phase `shipped`: say `every phase is planned; implement one with /planet:go <slug> implement <N>, or wait for a merge` and stop. Any phase `shipped` with no retro: say `next step: retro (not built yet); the epic is saved, /planet:go <slug> resumes here` and stop. A step named in the request wins.
6. **Repo check**, before intake, scoping, or phase-plan: run `gh repo view --json nameWithOwner -q .nameWithOwner`; it must equal `epic.epic.repo`, else say `this directory is <a>; the epic is <b>. Run /planet:go from the epic's repo.` and stop.
7. **Dispatch.** Run `planet session step <step>`. Invoke the skill `planet:planet-<step>` with `epic: <slug>` and `dir: <epic.paths.dir>`; intake also gets `prior art: <PR urls or none>`; a hand-up (step 9) also gets `reason: <why>`. When it returns, act on its last line:
   - `... done, next step <name>`: run `planet epic show <slug> --json`, which is read-only and returns the same view as the payload's `epic` field, then go to step 5 with it.
   - `phase N planned`: go to step 8.
   - `re-cut from phase N: <why>` or `back to scoping: <why>`: go to step 9.
   Never dispatch the same step twice without an approval in between; if a step returns without one, stop and say why.
8. **After a phase is planned.** Ask with AskUserQuestion, three options: `Implement phase N here`, `Plan the next phase`, `Stop`. Implement: run `planet session start <slug> --phase N`, print the phase file path from the view, and stop; planning is over for this session. Plan next: run `planet epic show <slug> --json` and go to step 5. Stop: say `/planet:go <slug>` plans more and `/planet:go <slug> implement N` starts implementation, then run `planet session end`.
9. **Hand-ups.** `re-cut from phase N: <why>`: dispatch phasing with `reason: re-cut from phase N: <why>`. `back to scoping: <why>`: dispatch scoping with `reason: back to scoping: <why>`. Either goes through step 7 once; a second hand-up in the same run stops with the reason shown.
10. **Done.** When the user says they are done, run `planet session end`.

## Example

Request `continue the GQL thing`. `planet open` returns `match: "gql-migration"`; say `opened gql-migration`. The view has `last_approved_step: "scoping"` and no phases, so the step is phasing. `gh repo view` is not needed for phasing. Run `planet session step phasing`, invoke `planet:planet-phasing` with the slug and dir. It returns `phasing done, 4 phases drafted, next step phase-plan`. Refresh the view; phase 1 is a draft, so dispatch phase-plan. It returns `phase 1 planned`. Ask: implement here, plan next, or stop.

## Troubleshooting

- Injected status JSON has `stale: true` or `synced_at: null`: `gh` was unavailable; state is what the store holds.
- `[]` in the status block: no active epics, a real answer. Don't run `planet status` again.
- The status block missing, blank, or not JSON: the injected command failed; run `planet status --json` yourself.
- `planet open` errors `no session id`: Bash lacks `CLAUDE_CODE_SESSION_ID`. Report and stop.
- `planet epic new` errors `already exists`: the slug is taken; run `planet open <slug> --json` instead.
- A named step exists but state doesn't match, e.g. `retro` with nothing shipped: say so, stop.
- `last_approved_step` is null but `paths.plan` exists: the plan was written outside the gate. Treat it as intake done.
- A step returns without a `done`, `planned`, or hand-up line: report its last message and stop.
