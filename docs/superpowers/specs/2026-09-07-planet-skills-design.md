# Planet skills, follow-on 2: router, proposal gate, intake

Follow-on 2 of `2026-09-03-planet-design.md`. It adds the first three skills to
the plugin: the router `/planet:go`, the approval gate `planet-proposal`, and the
first planning step `planet-intake`, plus two CLI verbs the skills need. With
these, one real epic can be opened and taken through intake end to end.
Scoping, phasing, phase-plan, retro, and feedback-review are follow-on 3.

## Decisions

| Question | Decision |
|---|---|
| Router command | `/planet:go`. Plugin skills are namespaced `plugin:skill`, so the router folder is `skills/go/`. |
| Who starts Planet | Only the user. `go` has `disable-model-invocation: true`. No Planet skill auto-triggers on conversation. |
| Scope of this follow-on | Router, gate, and intake, so the gate is proven by its real caller. |
| New epic creation | Confirm first: one line with slug, title, repo, ticket. Slug is permanent. |
| How the router gets status | Injected at skill load with a `!`planet status --json`` line. Zero tool turns for the glance case. |
| How the router opens an epic | One Bash call to `planet open`, because user text cannot be safely spliced into an injected shell command. |
| Research | Linear tickets and named PRs are fetched by the main thread and saved verbatim to `research/`. Codebase exploration goes to one general-purpose subagent that writes `research/codebase.md` and returns a short digest. |
| GitHub search | Named PRs always fetched. At most one `gh pr list --search`, and only when Claude judges it worth running from the ticket and the typed text. |
| Ids in skills | Skills never compute proposal ids. The CLI accepts `latest` and `latest-N`. |
| Tags | Written by `planet proposal tag`, validated against the fixed list, never hand-edited into `notes.md`. |

## Skills

### Conventions

All conventions from the design spec apply: kebab-case names matching folders,
descriptions with trigger phrases and no angle brackets, `compatibility`,
`metadata.version` bumped on every edit, critical rules first, numbered steps
with the command and its expected output, a troubleshooting section, detail in
`references/`, scripts over prose, read only what the step needs, subagents
share memory through the store and never call ExitPlanMode or Planet writes.

Size budgets: `go` under 800 words (raised to 1,000 by follow-on 3), `planet-proposal` under 300, `planet-intake`
under 1,500. The combined `description` and `when_to_use` stays under 1,536
characters, Claude Code's cap.

Every skill sets `allowed-tools: Bash(planet *)` so CLI calls run without
permission prompts during the skill's turn.

Skill text never names the user. It says "the user" or addresses them as
"you".

### `skills/go/SKILL.md`, invoked as `/planet:go`

```yaml
---
name: go
description: Planet planning workflow for epics that span several PRs. Shows the status table of active epics, opens an epic by name, Linear ticket, or description, creates a new epic from a ticket, and runs the next planning step. Use for /planet:go, "what am I working on", "continue the GQL epic", "start an epic from CRM-123", "plan the next phase". Not for implementing code or for one-off plans, which use plain plan mode.
argument-hint: [epic, ticket, or what to work on]
disable-model-invocation: true
allowed-tools: Bash(planet *) Bash(gh repo view *)
compatibility: Claude Code with the planet plugin loaded. Node 24, gh authenticated, Linear MCP connected for tickets.
metadata:
  version: 0.1.0
---
```

Body, in order: critical rules, the injected line `!`planet status --json``,
the text `$ARGUMENTS`, the steps below, one example, troubleshooting.

Critical rules: Planet owns planning in this session, superpowers brainstorming
and writing-plans are not invoked; the router never enters plan mode, never
reads `plan.md` or phase bodies, and never invokes a step skill while in plan
mode.

Steps:

1. No text: render the injected rows as the table, list shipped phases without
   a retro, ask what to work on. Stop.
2. Already in plan mode: say so, stop. Plan mode blocks the CLI writes below.
3. Run `planet open "<text>" --json`. One match: the marker is set; say which
   epic in one line. Zero or several: pick the likely one from the injected
   rows, confirm in one line, then `planet open <slug> --json`. Never a silent
   guess.
4. No match and the text names a Linear ID or URL, or asks to start
   something: fetch the ticket title through the Linear MCP when there is an
   ID; derive a kebab-case slug; take the repo from
   `gh repo view --json nameWithOwner`. Show one line:
   `create epic <slug>, "<title>", repo <owner/name>, from <ID>?` On yes:
   `planet epic new <slug> --title ... --repo ... --linear <ID>`, then
   `planet open <slug> --json`. PR numbers or URLs in the text are passed to
   intake as prior art.
5. Choose the step from the payload's frontmatter: no `plan.md` → intake. Any
   other state names a step that follow-on 3 builds; report it and stop. A step
   named in the text wins.
6. Before intake: `gh repo view --json nameWithOwner` must equal the epic's
   repo. Mismatch: report and stop. Intake explores the repo it stands in.
7. `planet session step intake`, then invoke `planet:planet-intake` with the
   slug, the epic directory path, and any prior-art PRs. When it returns, go to
   step 5.
8. When the user says they are done: `planet session end`. The SessionEnd hook covers
   a closed window.

### `skills/planet-proposal/SKILL.md`

```yaml
---
name: planet-proposal
description: Only invoked by Planet step skills, never on its own. Presents a drafted planning document for approval through native plan mode and records the outcome with the planet CLI. Do not use for ordinary plan mode or for any task outside a Planet session.
user-invocable: false
allowed-tools: Bash(planet *)
compatibility: Claude Code with the planet plugin loaded and its hooks active.
metadata:
  version: 0.1.0
---
```

Input from the caller: epic slug, destination `plan` or `phase:<n>`, step name.
The proposal text is already drafted in the caller's context. The gate does no
research and no reasoning.

1. EnterPlanMode. Write the draft to the plan file Claude Code names. Nothing
   else is written while in plan mode.
2. ExitPlanMode. The hooks snapshot the proposal; the skill does nothing for
   that.
3. Approved: the tool result says so and plan mode has ended. Run
   `planet proposal approve <epic> latest --to <destination>`. For each
   rejection in this gate cycle, `planet proposal tag <epic> latest-1 <tag>`,
   `latest-2`, and so on, one tag per rejection from the fixed list, chosen from
   the user's words. Return "approved".
4. Rejected: the tool result carries the user's words, as a typed message or as
   `[Re: "quote"] comment` lines, and plan mode continues. Count it, return the
   message to the caller. The caller amends the plan file in place, never
   regenerates it, and invokes the gate again. The hook records the rejection
   when the next ExitPlanMode fires.

Refinement is the loop between steps 2 and 4. Inline edits made in the review
dialog arrive in the approval payload and are stored by the hook as the edited
variant; `approve --to` writes that version.

Tag list: `scope-cut`, `scope-add`, `reorder`, `wrong-assumption`,
`too-granular`, `too-coarse`, `style`, `other`.

### `skills/planet-intake/SKILL.md`

```yaml
---
name: planet-intake
description: Only invoked by the Planet router, never on its own. First planning step for a Planet epic with no plan.md yet. Gathers the Linear ticket, named PRs, and codebase context into the epic's research directory, asks only the questions that block a problem statement, and drafts plan.md through the proposal gate. Do not use outside a Planet session.
user-invocable: false
allowed-tools: Bash(planet *) Bash(gh pr view *) Bash(gh pr list *)
compatibility: Claude Code with the planet plugin loaded. gh authenticated. Linear MCP connected when the epic has tickets.
metadata:
  version: 0.1.0
---
```

Input: epic slug, epic directory, prior-art PRs from the router. Precondition:
no `plan.md`. Output: `plan.md` v1 through the gate. Intake never proposes an
approach or phases.

1. Gather.
   - Linear: for each ID on the epic, fetch the issue and its comments through
     the Linear MCP; save each verbatim to `research/linear-<ID>.md`. No ID:
     the text the user typed is the brief.
   - GitHub: fetch each named PR with `gh pr view --json` into
     `research/prs.md`. Then decide whether one `gh pr list --search` in the
     epic repo is worth running: yes when nothing was named and the ticket
     reads as a follow-up, continuation, or carries IDs likely to appear in PR
     titles; no for a fresh ticket. At most one search. Say which and why.
   - Codebase: one general-purpose subagent with a brief in
     `references/research-brief.md`: the ticket summary and the questions to
     answer, which modules own the behavior, what it does today, what
     constrains a change, what prior attempts exist. It writes
     `research/codebase.md` and returns the path plus at most five lines.
     Intake reads the five lines, not the file.
2. Clarify, in chat, outside plan mode. Only questions that block a problem
   statement, at most three, one at a time. A clear ticket gets none.
   Approach and preference questions are deferred to scoping.
3. Draft `plan.md` in context with fixed headings: Problem, Context (links to
   research files, tickets, PRs), Constraints, Open questions for scoping,
   Non-goals when evident. Roughly 300 to 500 words.
4. Invoke `planet:planet-proposal` with the slug, `plan`, `intake`. On
   rejection amend the draft in place and gate again.
5. Return "intake done, next step scoping".

## CLI additions

Both in `cli/commands/proposal.ts` and `cli/lib/proposal.ts`.

- Proposal id arguments accept `latest` and `latest-N`, resolved against the
  highest id in the epic. `planet proposal approve <epic> latest --to plan`.
- `planet proposal tag <epic> <id> <tag>`: validates `tag` against the fixed
  list, appends `- proposal <N> · <tag>` to `feedback/notes.md`, creating it if
  absent, and commits `<epic>: tag proposal <N> <tag>`.

## Testing

- CLI: unit tests for `latest` and `latest-N` resolution, an out-of-list tag
  rejected, the `notes.md` line format, the commit message.
- Skill files as data: `test/skills.test.ts` parses every SKILL.md and asserts
  required fields, the description cap, no angle brackets, `user-invocable:
  false` on the hidden skills, `disable-model-invocation: true` on `go`,
  `allowed-tools` present, word counts under budget, and the injected status
  line in `go`. `claude plugin validate .` passes.
- Triggering: all should-not-trigger. Plan something in a session without
  `/planet:go`; no Planet skill loads and the store is untouched.
- Behavior: per skill, run the scenario without the skill and record what goes
  wrong, then write the skill against those failures. Live run: `/planet:go`
  alone shows the table; `/planet:go <ticket>` confirms creation, runs intake,
  produces research files and `plan.md` through one rejection and one
  approval; `/planet:go` again reports next step scoping and stops.

## Error handling

- Router: in plan mode, stop. `gh` unavailable, rows are stale, continue. Repo
  mismatch, stop. Zero or many matches, confirm. CLI errors are surfaced as is.
- Gate: an ExitPlanMode result that is neither approval nor rejection is
  reported and the gate stops. `approve` reporting the proposal was rejected
  means the hook and the dialog disagree; surface it and stop.
- Intake: Linear MCP not connected, say so once and continue from the typed
  brief. `gh` unauthenticated, skip GitHub with a note. Subagent failed, draft
  from Linear alone and mark the codebase section not researched. Ticket not
  found, stop and ask.

## Non-goals

- Scoping, phasing, phase-plan, retro, feedback-review. Follow-on 3.
- Ultraplan. Not exercised by these skills.
- Any Planet skill starting on its own from conversation.

## Amendments to the design spec

- The router is `/planet:go` and explicit-only. The design spec's router
  triggering tests change from should-trigger paraphrases to should-not-trigger.
- Tags are written by `planet proposal tag`, not by Claude appending to
  `notes.md`.

## Open items for follow-on 3

- Linear ID tier ordering under token matching in `resolveEpics`.
- What linking a PR to a shipped phase means.
- Approving to `plan.md` replaces the whole file, so scoping's proposal must
  carry the full document including intake's sections.
