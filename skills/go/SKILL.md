---
name: go
description: Planet, for an epic that spans several PRs. Use for /planet:go, "what am I working on", "continue the GQL epic", "start an epic from CRM-123", "plan the next phase", "review feedback". Not for one-off plans, which use plain plan mode.
argument-hint: "[epic, ticket, or what to work on]"
disable-model-invocation: true
allowed-tools: Bash(planet *), Bash(gh repo view *), Bash(git rev-parse *), Bash(grep *)
compatibility: Claude Code with the planet plugin loaded. Node 24, gh authenticated, Linear MCP connected for tickets.
metadata:
  version: 0.5.0
---

# Planet: go

## Critical rules

- Planet owns planning here; skip superpowers brainstorming and writing-plans.
- Never enter plan mode here; step skills propose through `planet:planet-proposal`.
- Never read `plan.md` or phase bodies; the step skill reads what's needed.
- Never guess the epic; zero or several matches means a confirming question.
- Never end a turn by naming a command for the user to type in place of acting or asking. Every step return refreshes and re-enters step 5; where step 5 cannot pick, ask with AskUserQuestion. Only these end a turn: plan mode is on, the repo is wrong, a step returned `aborted`, a step returned without an approval, a PR just opened, and the user picking Stop.
- Store writes go only through the `planet` CLI, never by hand under `~/.planet`; step skills write only under `research/`.

## Status

Status rows, refreshed on load:

!`planet status --json`

Request: $ARGUMENTS

## Steps

1. **No request text.** Render a table: EPIC, STATUS, PHASES (`shipped/total`), CURRENT, OPEN PRS, REVIEW; REVIEW shows "retro pending" when `unreviewed` is above zero. Ask what to work on. Stop.
2. **Plan mode check.** In plan mode, say "leave plan mode first, Planet needs to write to its store" and stop.
3. **Resolve.** Requests may carry Linear IDs, URLs, prose, and an instruction after the epic: `implement N`, a step name (`scoping`, `phasing`, `phase-plan`, `phase-plan N` to re-plan phase N, `retro N`), `work on N` (once `planet open` resolved the slug, run `planet session start <slug> --phase N --step implement`, say the marker is set, stop), `re-cut from phase N` or `back to scoping` (step 9). The request `review feedback` alone goes to step 10 without `planet open`. Run `planet open '<request text>' --json`, single-quoting the text with any single quote removed.
   - `match` is a slug: say `opened <slug>`. `work on N` was handled. With `implement N`, run step 6, then read phase N in the payload's `phases`: `planned` or `in-progress` goes to step 8's Implement path; `draft` dispatches phase-plan N per step 7 and then that path; `shipped` or `reviewed` says the phase is already built and goes to step 5; absent, say which steps are missing and ask with AskUserQuestion whether to start at the earliest, dispatching it and going to step 5 on yes. Otherwise go to step 5.
   - `match` null, `candidates` not empty: list each candidate slug with title when present, ask which; on an answer run `planet open <slug> --json`, go to step 5. If none, go to step 4 when the request could start a new epic, else stop.
   - `match` null, `candidates` empty: go to step 4 if the request names a Linear ID, a linear.app URL, or asks to start/plan something new; otherwise ask which epic and stop.
4. **New epic.** Follow `references/new-epic.md`. It ends at `planet open <slug> --json` with the sources kept for step 7, or stops.
5. **Choose the step** from the epic view (`last_approved_step`, `paths.plan`, `phases`; the `epic` field in the `planet open` payload), without reading any file. No `paths.plan`: intake. `last_approved_step` `intake`: scoping. `scoping`, no phases: phasing. `scoping` with phases and any not `shipped`: phasing, with `reason: re-cut from phase <N>` (N: lowest `draft` id, else lowest not `shipped`). `phasing`, no phases: phasing. Any phase `shipped`: retro, lowest id first. Any phase `draft`: phase-plan, lowest id first. No drafts, no phase `shipped`: implement the lowest `planned` phase per step 8. Every phase `reviewed`: say the epic is done and run `planet session end`. A step named in the request wins over every row above, including the stops; `phase-plan N` also fixes the phase.
6. **Repo check**, before intake, scoping, phase-plan, retro, or implement: run `gh repo view --json nameWithOwner -q .nameWithOwner`; it must equal `epic.epic.repo`, else say `this directory is <a>; the epic is <b>. Run /planet:go from the epic's repo.` and stop.
7. **Dispatch.** Run `planet session step <step>`, adding `--phase <N>` for phase-plan and retro. Invoke `planet:planet-<step>` with `epic: <slug>` and `dir: <epic.paths.dir>`; intake also gets a `sources:` block, one line per source as `- <kind> <ref> (<role>)` or `- text: <prose>`, or `sources: none`; phase-plan and retro also get `phase: <N>`, the id step 5 chose or the request named; pass `reason: <why>` whenever step 5 or step 9 supplied one. Act on its last line:
   - `... done, next step <name>`: run `planet epic show <slug> --json --brief` (read-only, same view as the payload's `epic` field), then go to step 5 with it.
   - `phase N planned`: go to step 8.
   - `retro done for phase N`: run `planet epic show <slug> --json --brief`, go to step 5.
   - `phase N not shipped`: say so, run `planet epic show <slug> --json --brief`, go to step 5.
   - `re-cut from phase N: <why>` or `back to scoping: <why>`: go to step 9.
   - `<step> aborted: <why>`: say nothing was written and plan mode may still be on; stop.
   Never dispatch the same step twice without an approval in between (retro's done line counts as one); if a step returns without one, stop and say why.
8. **Implement a planned phase.** Implement at once when every lower-numbered `pr` phase is `shipped` or `reviewed`; otherwise ask with AskUserQuestion, `Implement phase N stacked on phase <M>` (M: the highest such phase), `Stop` (runs `planet session end`). Invoke `planet:planet-implement` with `epic: <slug>`, `dir: <epic.paths.dir>`, `phase: N`, and `base: <M>` when stacking, then act on its last line:
   - `phase N implemented, <url>`: say so, that the session stays open so refinement prompts feed the retro, and that `/planet:go <slug>` moves on; end the turn.
   - `phase N blocked at commit k: <why>`: say which commit and why, then ask `Re-plan phase N`, `Stop`. Re-plan dispatches phase-plan N per step 7.
   - `phase N manual`: ask `Mark phase N shipped`, `Plan the next phase`, `Stop`. Shipped runs `planet phase set <slug> N --status shipped`, then go to step 5. Plan next: refresh, step 5. Stop: `planet session end`.
   - `phase N not planned`: step 3 checks the status first, so this means the store moved under the session; refresh and go to step 5.
9. **Hand-ups.** `re-cut from phase N: <why>`: dispatch phasing with `reason: re-cut from phase N: <why>`. `back to scoping: <why>`: dispatch scoping with `reason: back to scoping: <why>`. Either runs step 6 when it applies, then step 7 once; a second hand-up in the same run stops with the reason shown.
10. **Review feedback.** Only for the request `review feedback`. Follow `references/review-feedback.md`; it ends the session itself.
11. **Done.** When the user says they are done, run `planet session end`.

## Example

`continue the GQL thing` matches `gql-migration`; `last_approved_step` `scoping`, no phases: phasing. It returns done; refresh; phase 1 is a draft: repo check, phase-plan; on `phase 1 planned`, nothing is below it, so implement at once; on `phase 1 implemented`, say so and end the turn.

## Troubleshooting

- `stale: true` or `synced_at: null`: `gh` unavailable; trust the store.
- `[]` in the status block: no active epics; do not rerun `planet status`. Missing or not JSON: run it.
- `planet open` errors `no session id`: `CLAUDE_CODE_SESSION_ID` unset; stop.
- `planet epic new` says `already exists`: run `planet open <slug> --json`.
- A named step whose state disagrees, other than `implement N`, which step 3 routes: say so and ask with AskUserQuestion whether to run the step step 5 would pick instead.
- `last_approved_step` null but `paths.plan` exists: written outside `planet-proposal`; treat as intake done.
