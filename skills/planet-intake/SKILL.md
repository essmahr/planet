---
name: planet-intake
description: Only invoked by the Planet router, never on its own. First planning step for a Planet epic with no plan.md yet. Gathers the Linear ticket, named PRs, and codebase context into the epic's research directory, asks only the questions that block a problem statement, and drafts plan.md through the proposal gate. Do not use outside a Planet session.
user-invocable: false
allowed-tools: Bash(planet *), Bash(gh pr view *), Bash(gh pr list *)
compatibility: Claude Code with the planet plugin loaded. gh authenticated. Linear MCP connected when the epic has tickets.
metadata:
  version: 0.1.0
---

# Planet: intake

Input from the router: `epic: <slug>`, `dir: <path>`, `prior art: <PR urls or none>`. Precondition: the epic has no `plan.md`. Output: `plan.md` v1, written through the proposal gate. Intake describes the problem. It never proposes an approach or phases; scoping does that.

## Critical rules

- Research files are written to `<dir>/research/`; nothing else under the epic directory is written by hand. `plan.md` is written only by `planet proposal approve`.
- Codebase exploration goes to one subagent. Do not read source files in this thread beyond what a clarifying question needs.
- Clarifying questions: only what blocks a problem statement, at most three, one at a time, in chat, before entering plan mode.
- The draft is composed in context. The gate writes it.

## Steps

1. **Epic facts.** Run `planet epic show <slug> --json`. Take `epic.title`, `epic.linear`, and `epic.repo`.
2. **Linear.** For each ID in `epic.linear`, call the Linear MCP `get_issue` tool, then `list_comments` for that issue. Save the title, description, and comments verbatim to `<dir>/research/linear-<ID>.md`. With no IDs, the user's request text is the brief; record it in `<dir>/research/brief.md`.
3. **GitHub.** For each prior-art PR, run `gh pr view <url> --json number,title,body,state,url` and append a section to `<dir>/research/prs.md`. Then decide on one search: run `gh pr list -R <repo> --state all --limit 20 --search "<ID>" --json number,title,url,state` at most once for the whole epic, using the first ID in `epic.linear`, and only when no PR was named and the ticket reads as a follow-up or continuation, or its IDs are likely to appear in PR titles. Otherwise skip. Say in one line whether you searched and why. Append any hits to `prs.md`.
4. **Codebase.** Dispatch one general-purpose subagent with the brief in `references/research-brief.md`, slots filled from the router's input lines and steps 1 to 3. It writes `<dir>/research/codebase.md` and returns the path and up to five lines. Read the five lines, not the file.
5. **Clarify.** If the ticket and research leave a gap that blocks stating the problem, such as which surface, which users, or whether a described behavior is a bug or intended, ask one question and wait. Repeat at most twice more. A clear ticket gets no questions. Approach and preference questions are deferred to scoping; note them for the Open questions section.
6. **Draft.** Compose `plan.md` v1 in context using `references/plan-template.md`. Link the research files by relative path; Context names what each settles and repeats none of its figures. 300 to 500 words, never more than 500.
7. **Gate.** Invoke the skill `planet:planet-proposal` with `epic: <slug>`, `to: plan`. On `approved`, go to step 8. On a rejection message, amend the draft in place to address it: new research becomes a new file plus one Context line, and decisions in the message become Constraints marked "(decided during review)". Do not add sections. Then invoke the gate again.
8. **Return** the line `intake done, next step scoping` to the router.

## Example

Router passes `epic: gql-migration`, `dir: /Users/me/.planet/epics/gql-migration`, `prior art: https://github.com/closeio/close-ui/pull/26772`. Step 2 saves `research/linear-CRM-123.md`. Step 3 saves PR 26772 to `research/prs.md` and skips the search: a PR was named. Step 4 returns "email writes already go through useAutosaveMutation; the lead page thread refetch is the last REST read; tests pin the thread shape in LeadEmailThread.test.tsx". No gap blocks the problem statement, so step 5 asks nothing. Step 6 drafts. Step 7 gates; the user rejects with "leave the analytics page out"; Non-goals gains a line; the gate approves. Step 8 returns.

## Troubleshooting

- Linear MCP not available or the issue is not found: say so once, continue with the request text as the brief, and list the ticket under Open questions.
- `gh` not authenticated: skip step 3, note it in Context, continue.
- The subagent fails or returns nothing: draft from Linear alone and write "not researched" under Context for the codebase line.
- `planet epic show` says no epic: the router did not open one. Return to the router with that message.
- The gate reports the hooks did not run: stop and return that message to the router.
