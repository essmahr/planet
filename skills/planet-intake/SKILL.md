---
name: planet-intake
description: Only invoked by the Planet router, never on its own, for an epic with no plan.md yet. Do not use outside a Planet session.
user-invocable: false
allowed-tools: Bash(planet *), Bash(gh pr view *), Bash(gh pr list *)
compatibility: Claude Code with the planet plugin loaded. gh authenticated. Linear MCP connected when the sources include Linear issues, projects, or documents.
metadata:
  version: 0.4.0
---

# Planet: intake

Input from the router: `epic: <slug>`, `dir: <path>`, and a `sources:` block, one source per line as `- <kind> <ref> (<role>)`, or `- text: <prose>`, or `sources: none`. Kinds: issue, project, parent, pr, doc, url, text. Roles: primary is the work; context is background. Precondition: the epic has no `plan.md`. Output: `plan.md` v1, proposed for approval. Intake describes the problem. It never proposes an approach or phases; scoping does that.

## Critical rules

- Research files are written to `<dir>/research/`; nothing else under the epic directory is written by hand. `plan.md` is written only by `planet proposal approve`.
- Fetch each source exactly as `references/sources.md` says, no more. A project's children are listed, not fetched.
- Codebase exploration goes to one subagent. Do not read source files in this thread beyond what a clarifying question needs.
- Questions are asked once, in one AskUserQuestion before plan mode, never through the approval gate. Never ask the user to sort a ticket list into keep and drop; a related ticket gets a question only when the problem cannot be stated without it.
- The draft is composed in context. `planet-proposal` writes it.

## Steps

1. **Epic facts.** Run `planet epic show <slug> --json`. Take `epic.title`, `epic.linear`, and `epic.repo`. Every ID in `epic.linear` missing from the `sources:` block is an `issue (primary)` source. With no sources at all, ask in chat what the epic is about and treat the answer as `text`.
2. **Sources.** For each line of the `sources:` block, fetch and write per `references/sources.md`. An issue with children is also a parent. Then write `<dir>/research/sources.md`, one line per source with kind, role, and file. Decide on one PR search: run `gh pr list -R <repo> --state all --limit 20 --search "<ID>" --json number,title,url,state` at most once for the whole epic, using the first primary issue ID, and only when no PR was named and the work reads as a follow-up or continuation, or its IDs are likely to appear in PR titles. Otherwise skip. Say in one line whether you searched and why. Append any hits to `prs.md`.
3. **Codebase.** Dispatch one general-purpose subagent on model sonnet with the brief in `references/research-brief.md` as written, slots filled from the primary sources and the research files written in step 2. It writes `<dir>/research/codebase.md` and returns the path and up to five lines. Read the five lines, not the file.
4. **Ask.** Collect every question the draft would otherwise leave open: a gap in the problem statement (which surface, which users, bug or intended), which related tickets the epic takes on, and the decisions the approach depends on. Ask them in one AskUserQuestion: at most four, multiple choice when the options are known, each with a "Defer to scoping" option. An answer becomes a Constraint marked "(decided during intake)". Only a deferred question goes under Open questions. Clear sources with nothing to decide get no question.
5. **Draft.** Compose `plan.md` v1 in context using `references/plan-template.md`. Context links `research/sources.md` in one line and names what the codebase research settles; with a single source, Context may name that source's file directly. Repeat no figures from research files. 300 to 500 words, never more than 500.
6. **Propose.** Invoke the skill `planet:planet-proposal` with `epic: <slug>`, `to: plan`, and no `changes:`, since this is the document's first proposal. On `approved`, go to step 7. On a rejection message, amend the draft in place to address it: a new source is fetched per step 2, appended to `sources.md`, and gets one Context line; decisions in the message become Constraints marked "(decided during review)". Do not add sections. Then propose again with `changes:` for the amendment. On `aborted: <message>`, run `planet proposal reject <slug> latest --feedback "<message>"`, then return `intake aborted: <message>`.
7. **Return** the line `intake done, next step scoping` to the router.

A source the user adds mid-conversation ("also look at project X") is handled as in step 2 at that moment: fetch, write, append to `sources.md`, and give it a Context line at the next proposal.

## Example

Router passes `epic: finish-security-settings`, `dir: /Users/me/.planet/epics/finish-security-settings`, and a `sources:` block with `issue CRM-1211 (primary)`, `project https://linear.app/close/project/security-settings-abc (context)`, and `text: the SSO section already shipped`. Step 2 saves `research/linear-CRM-1211.md`, lists the project's seven children in `research/tickets.md` with fit notes (two `out: shipped`, three `fits`, two `related`), writes `research/brief.md` and `research/sources.md`, and skips the PR search: the ticket is not a follow-up. Step 3 returns five lines on the settings page modules. Step 4 asks one question with two parts, whether CRM-1240 and CRM-1252 belong to this epic, each with In, Out, and Defer to scoping; the user puts CRM-1240 in and defers CRM-1252. CRM-1240 is fetched as an issue, appended to `sources.md`, and given a Context line; Constraints gets "CRM-1240 is in scope (decided during intake)"; Open questions keeps CRM-1252. Step 5 drafts. Step 6 proposes; approved. Step 7 returns.

## Troubleshooting

- Linear MCP not available or an issue, project, or document is not found: record the source in `sources.md` as unread with the reason, say so once, and continue.
- A URL and no fetch tool: record it in `sources.md` as unread; do not paste the URL into `plan.md` as a finding.
- `gh` not authenticated: skip PR sources and the search, note it in Context, continue.
- The subagent fails or returns nothing: draft from the sources alone and write "not researched" under Context for the codebase line.
- `planet epic show` says no epic: the router did not open one. Return to the router with that message.
- `planet-proposal` reports the hooks did not run: stop and return that message to the router.
