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

- Planet owns planning in this session. Do not invoke superpowers brainstorming or writing-plans.
- Never enter plan mode from this skill. Step skills do that through the proposal gate.
- Never read `plan.md` or phase bodies here. The step skill reads what it needs.
- Never guess which epic. Zero or several matches means one confirming question.
- Every write to the store goes through the `planet` CLI. Never edit structured files under `~/.planet` by hand; step skills write only under `research/`.

## Status

Status rows, refreshed when this skill loaded:

!`planet status --json`

Request: $ARGUMENTS

## Steps

1. **No request text.** Render the rows as a table with columns EPIC, STATUS, PHASES as `shipped/total`, CURRENT, OPEN PRS, REVIEW. Rows with `unreviewed` above zero get "retro pending" in REVIEW. Ask what to work on. Stop.
2. **Plan mode check.** If this session is in plan mode, say "leave plan mode first, Planet needs to write to its store" and stop.
3. **Resolve.** Run `planet open '<request text>' --json`, passing the request text single-quoted, with any single quote in it removed.
   - `match` is a slug: say `opened <slug>` and go to step 5.
   - `match` is null and `candidates` is not empty: list every candidate slug with its title from the rows when present and ask which one, then wait. On an answer run `planet open <slug> --json` and go to step 5. If the user says none of them, go to step 4 if the request could start a new epic, otherwise stop.
   - `match` is null and `candidates` is empty: if the request names a Linear ID like CRM-123, a linear.app URL, or asks to start or plan something new, go to step 4. Otherwise ask which epic and stop.
4. **New epic.** When there is a Linear ID, fetch the issue with the Linear MCP `get_issue` tool and take its title. Without a Linear ID, propose a title of at most six words taken from the request. Derive a slug: lowercase, letters, digits, hyphens, at most 40 characters, no leading or trailing hyphen. Run `gh repo view --json nameWithOwner -q .nameWithOwner` for the repo. Ask exactly `create epic <slug>, "<title>", repo <owner/name>, from <ID>?` and wait. Without a ticket, drop the `, from <ID>` clause and the `--linear` flag. On yes run `planet epic new <slug> --title "<title>" --repo <owner/name> --linear <ID>` (omit `--linear` without an ID), then `planet open <slug> --json`. On no, ask what to change, slug, title, or repo, or which existing epic to use instead, then stop until answered. Keep any PR numbers or URLs from the request as prior art for intake.
5. **Choose the step** from the epic view, using `paths.plan` and `phases` (this view is the `epic` field in the `planet open` payload), without reading any file. `paths.plan` null: intake. Plan present and `phases` empty: scoping. Any phase with status `shipped`: retro. Any phase with status `draft`: phase-plan. Otherwise: phasing. Every step but intake is not built yet: say `next step: <name> (not built yet)` and stop. A step named in the request wins.
6. **Repo check.** Run `gh repo view --json nameWithOwner -q .nameWithOwner`. It must equal `epic.epic.repo`. Otherwise say `this directory is <a>; the epic is <b>. Run /planet:go from the epic's repo.` and stop.
7. **Dispatch.** Run `planet session step intake`. Invoke the skill `planet:planet-intake` with three lines: `epic: <slug>`, `dir: <epic.paths.dir>`, `prior art: <PR urls or none>`. When it returns, run `planet epic show <slug> --json`, which is read-only and returns the same view as the payload's `epic` field, then go to step 5 using it.
8. **Done.** When the user says they are done, run `planet session end`.

## Example

Request `continue the GQL thing`. `planet open` returns `match: "gql-migration"`. Say `opened gql-migration`. The payload has `paths.plan: null`, so the step is intake. `gh repo view` matches `closeio/close-ui`. Run `planet session step intake`, invoke `planet:planet-intake` with the slug, dir, and `prior art: none`.

## Troubleshooting

- The injected status JSON has `stale: true` or `synced_at: null`: `gh` was unavailable. Continue; state is what the store holds.
- The status block above is empty or shows an error instead of JSON: the injected command failed at load. Run `planet status --json` yourself and continue.
- `planet open` errors with `no session id`: the Bash tool lacks `CLAUDE_CODE_SESSION_ID`. Report it and stop.
- `planet epic new` errors with `already exists`: the slug is taken. Run `planet open <slug> --json` instead.
- The request names a step that exists but the state does not match, for example `retro` with nothing shipped: say so and stop.
