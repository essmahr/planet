---
name: go
description: Planet planning workflow for epics that span several PRs. Shows the status table of active epics, opens an epic by name, Linear ticket, or description, creates a new epic from tickets, projects, PRs, documents, or plain text, and runs the next planning step. Use for /planet:go, "what am I working on", "continue the GQL epic", "start an epic from CRM-123", "plan the next phase". Not for one-off plans, which use plain plan mode.
argument-hint: "[epic, ticket, or what to work on]"
disable-model-invocation: true
allowed-tools: Bash(planet *), Bash(gh repo view *), Bash(git rev-parse *), Bash(grep *)
compatibility: Claude Code with the planet plugin loaded. Node 24, gh authenticated, Linear MCP connected for tickets.
metadata:
  version: 0.3.0
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

1. **No request text.** Render a table: EPIC, STATUS, PHASES (`shipped/total`), CURRENT, OPEN PRS, REVIEW; REVIEW shows "retro pending" when `unreviewed` is above zero. Ask what to work on. Stop.
2. **Plan mode check.** In plan mode, say "leave plan mode first, Planet needs to write to its store" and stop.
3. **Resolve.** Requests may carry Linear IDs, URLs, prose, and an instruction after the epic: `implement N` (step 6, then step 8's Implement path), a step name (`scoping`, `phasing`, `phase-plan`, `phase-plan N` to re-plan phase N, `retro N`), `work on N` (once `planet open` resolved the slug, run `planet session start <slug> --phase N --step implement`, say the marker is set, stop), `re-cut from phase N` or `back to scoping` (step 9). The request `review feedback` alone goes to step 10 without `planet open`. Run `planet open '<request text>' --json`, single-quoting the text with any single quote removed.
   - `match` is a slug: say `opened <slug>`. If the request carried `implement N`, run step 6, then step 8's Implement path with that N; `work on N` was handled; otherwise go to step 5.
   - `match` null, `candidates` not empty: list each candidate slug with title when present, ask which; on an answer run `planet open <slug> --json`, go to step 5. If none, go to step 4 when the request could start a new epic, else stop.
   - `match` null, `candidates` empty: go to step 4 if the request names a Linear ID, a linear.app URL, or asks to start/plan something new; otherwise ask which epic and stop.
4. **New epic.** Sort the request into sources: Linear IDs and issue URLs named as the work are `issue (primary)`; a project, parent, PR, document, or URL, or a ticket introduced with "related to", "see also", or "for background", is `(context)` of its kind, tokens `issue`, `project`, `parent`, `pr`, `doc`, `url`; the remaining prose is `text`. Title: the first primary issue's title via Linear MCP `get_issue`, else at most six words from the request. Slug: lowercase letters, digits, hyphens, at most 40 characters, no leading/trailing hyphen. Run `gh repo view --json nameWithOwner -q .nameWithOwner` for the repo. Ask exactly `create epic <slug>, "<title>", repo <owner/name>, from <IDs>?`; no primary issue: drop `, from <IDs>` and `--linear`. Yes: run `planet epic new <slug> --title "<title>" --repo <owner/name> --linear <ID>`, one `--linear` per primary issue, then `planet open <slug> --json`. No: ask what to change, slug, title, or repo, then stop. Keep every source for step 7.
5. **Choose the step** from the epic view (`last_approved_step`, `paths.plan`, `phases`; the `epic` field in the `planet open` payload), without reading any file. No `paths.plan`: intake. `last_approved_step` `intake`: scoping. `scoping`, no phases: phasing. `scoping` with phases and any not `shipped`: phasing, with `reason: re-cut from phase <N>` (N: lowest `draft` id, else lowest not `shipped`). `phasing`, no phases: phasing. Any phase `shipped`: retro, lowest id first. Any phase `draft`: phase-plan, lowest id first. No drafts, no phase `shipped`: say `every phase is planned; implement one with /planet:go <slug> implement <N>, or wait for a merge` and stop. A step named in the request wins over every row above, including the stops; `phase-plan N` also fixes the phase.
6. **Repo check**, before intake, scoping, phase-plan, retro, or implement: run `gh repo view --json nameWithOwner -q .nameWithOwner`; it must equal `epic.epic.repo`, else say `this directory is <a>; the epic is <b>. Run /planet:go from the epic's repo.` and stop.
7. **Dispatch.** Run `planet session step <step>`, adding `--phase <N>` for phase-plan and retro. Invoke `planet:planet-<step>` with `epic: <slug>` and `dir: <epic.paths.dir>`; intake also gets a `sources:` block, one line per source as `- <kind> <ref> (<role>)` or `- text: <prose>`, or `sources: none`; phase-plan and retro also get `phase: <N>`, the id step 5 chose or the request named; pass `reason: <why>` whenever step 5 or step 9 supplied one. Act on its last line:
   - `... done, next step <name>`: run `planet epic show <slug> --json` (read-only, same view as the payload's `epic` field), then go to step 5 with it.
   - `phase N planned`: go to step 8.
   - `retro done for phase N`: run `planet epic show <slug> --json`, go to step 5.
   - `phase N not shipped`: say so, stop.
   - `re-cut from phase N: <why>` or `back to scoping: <why>`: go to step 9.
   - `<step> aborted: <why>`: say nothing was written and plan mode may still be on; stop.
   Never dispatch the same step twice without an approval in between (retro's done line counts as one); if a step returns without one, stop and say why.
8. **After a phase is planned.** Ask with AskUserQuestion, three options: `Implement phase N here`, `Plan the next phase`, `Stop`. Implement: invoke `planet:planet-implement` with `epic: <slug>`, `dir: <epic.paths.dir>`, `phase: N`. On `phase N implemented, <url>`: say so and stop; leave the session open; later prompts are recorded against the phase. On `phase N blocked at commit k: <why>`, `phase N not planned`, or `phase N manual`: say `/planet:go <slug> phase-plan N` re-plans it (a manual phase is done by hand and shipped with `planet phase set`), stop. Plan next: run `planet epic show <slug> --json`, go to step 5. Stop: say `/planet:go <slug>` plans more and `/planet:go <slug> implement N` implements, then run `planet session end`.
9. **Hand-ups.** `re-cut from phase N: <why>`: dispatch phasing with `reason: re-cut from phase N: <why>`. `back to scoping: <why>`: dispatch scoping with `reason: back to scoping: <why>`. Either runs step 6 when it applies, then step 7 once; a second hand-up in the same run stops with the reason shown.
10. **Review feedback.** Only for the request `review feedback`. The directory must be the Planet plugin repo: `grep -q '"name": "planet"' "$(git rev-parse --show-toplevel)/.claude-plugin/plugin.json"` must succeed, else say `run /planet:go review feedback from the Planet plugin repo` and stop. Run `planet session review`, then `planet feedback report` and read the `reviews:` line for the last date, and invoke `planet:planet-feedback-review` with `since: <date or none>`. On either `feedback review done` line: say it, run `planet session end`. On `feedback-review aborted: <why>`: say so, run `planet session end`.
11. **Done.** When the user says they are done, run `planet session end`.

## Example

`continue the GQL thing` matches `gql-migration`; `last_approved_step` `scoping`, no phases: phasing. It returns done; refresh; phase 1 is a draft: repo check, phase-plan; on `phase 1 planned`, ask step 8's question.

## Troubleshooting

- `stale: true` or `synced_at: null`: `gh` unavailable; trust the store.
- `[]` in the status block: no active epics; do not rerun `planet status`. Missing or not JSON: run it.
- `planet open` errors `no session id`: `CLAUDE_CODE_SESSION_ID` unset; stop.
- `planet epic new` says `already exists`: run `planet open <slug> --json`.
- A named step whose state disagrees: say so, stop.
- `last_approved_step` null but `paths.plan` exists: written outside the gate; treat as intake done.
