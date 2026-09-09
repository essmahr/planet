# Planet Intake Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Intake gathers any mix of Linear issues, projects, parent issues, PRs, documents, URLs, and plain text into `research/`, with one `sources.md` index, and the router passes those sources instead of a single ticket and prior-art line.

**Architecture:** Skill text only. The router's new-epic and dispatch steps collect sources from the request and pass a `sources:` block; intake's Linear and GitHub steps merge into one Sources step driven by a kinds table in a new reference file; the plan template's Context gains a Sources line; scoping reads `research/tickets.md` when it exists. No CLI, schema, or hook changes.

**Tech Stack:** Markdown skills under `skills/`, harness `test/skills.test.ts` on `node --test`.

**Spec:** docs/superpowers/specs/2026-09-09-planet-intake-sources-design.md

## Global Constraints

- Skill text never names the user.
- Body word budgets, enforced by `test/skills.test.ts`: `go` 1,100; `planet-intake` 1,500; `planet-scoping` 1,500. Do not raise them.
- Hidden step skills keep `user-invocable: false` and do not set `disable-model-invocation`. Frontmatter parses under the strict `yaml` package; quote a description that contains `: `.
- Every `planet <verb>` in a body is a real command; every `references/<file>.md` named in a body exists.
- No em-dashes in skill text. No personal names.
- `epic.linear` means "tickets this epic closes". Projects, parents, URLs, and prose never become `--linear` values.
- No keep-or-drop question anywhere. Roles are inferred, never asked.
- Commit messages: lowercase imperative, no prefix, no trailing period.
- Run `npm test && npm run typecheck && claude plugin validate .` before each commit.

---

### Task 1: Intake sources step, reference, template, and brief

**Files:**
- Create: `skills/planet-intake/references/sources.md`
- Modify: `skills/planet-intake/SKILL.md` (whole file replaced)
- Modify: `skills/planet-intake/references/plan-template.md:10-13`
- Modify: `skills/planet-intake/references/research-brief.md:9-11`
- Test: `test/skills.test.ts` (existing conventions test covers the new reference name and the budget)

**Interfaces:**
- Consumes: the router's `sources:` block (Task 2 produces it), format below.
- Produces: `research/sources.md`, `research/tickets.md`, the `- Sources:` Context line, return line `intake done, next step scoping` unchanged.

The `sources:` block the router sends, one source per line after the `sources:` label:

```
sources:
- issue CRM-1211 (primary)
- project https://linear.app/close/project/security-settings-abc (context)
- pr https://github.com/closeio/close-ui/pull/26772 (context)
- text: finish the remaining security settings work; the SSO section is already shipped
```

Kinds: `issue`, `project`, `parent`, `pr`, `doc`, `url`, `text`. Roles: `primary` or `context`; `text` has no role. With nothing to pass, the block is the single line `sources: none`.

- [ ] **Step 1: Create `skills/planet-intake/references/sources.md`**

```markdown
# Sources

What intake fetches for each kind of source and where it writes it. Fetch
exactly this; do not read more than the kind asks for.

| Kind | Fetch | File |
|---|---|---|
| issue | Linear MCP `get_issue`, then `list_comments` | `research/linear-<ID>.md`: title, description, comments, verbatim |
| project | `get_project`, then `list_issues` for the project | `research/tickets.md` |
| parent | `get_issue`, then `list_issues` with that parent | `research/tickets.md` |
| pr | `gh pr view <url> --json number,title,body,state,url` | `research/prs.md`, one section per PR |
| doc | `get_document` for a linear.app document URL | `research/doc-<slug>.md`, verbatim |
| url | a fetch tool when one is available; otherwise unread | `research/doc-<slug>.md`, or a line in `sources.md` only |
| text | copy | `research/brief.md`, verbatim under a dated heading |

A child of a project or parent is fetched as an `issue` only when it is named
as the work, at intake or later. More than 40 children: list titles only and
say so at the top of `tickets.md`.

## research/tickets.md

One file for every project and parent, appended in order:

```
## <Project or parent name> (<ID or URL>)
<Description, verbatim, or "no description">

| ID | Title | Status | Asks for | Fit |
|---|---|---|---|---|
| CRM-979 | SSO enforcement toggle | Done | one line | out: shipped |
| CRM-1213 | Session timeout setting | Todo | one line | fits |
| CRM-1240 | Audit log export | Backlog | one line | related |
```

Fit is one of `fits`, `related`, `out: <why>`. It is a note for the
conversation, not a decision; the user settles related tickets in scoping
unless the problem statement cannot be written without knowing.

## research/sources.md

One line per source, in the order received. Sources added later are appended.

```
# Sources

- issue CRM-1211 (primary): research/linear-CRM-1211.md
- project Security settings (context): research/tickets.md, 7 children
- pr https://github.com/closeio/close-ui/pull/26772 (context): research/prs.md
- url https://example.com/spec (context): unread, no fetch tool
- text: research/brief.md
```
```

- [ ] **Step 2: Replace `skills/planet-intake/SKILL.md` with this content**

```markdown
---
name: planet-intake
description: Only invoked by the Planet router, never on its own. First planning step for a Planet epic with no plan.md yet. Gathers the sources the request named, Linear issues, projects, PRs, documents, or plain text, plus codebase context into the epic's research directory, asks only the questions that block a problem statement, and drafts plan.md through the proposal gate. Do not use outside a Planet session.
user-invocable: false
allowed-tools: Bash(planet *), Bash(gh pr view *), Bash(gh pr list *)
compatibility: Claude Code with the planet plugin loaded. gh authenticated. Linear MCP connected when the sources include Linear issues, projects, or documents.
metadata:
  version: 0.2.0
---

# Planet: intake

Input from the router: `epic: <slug>`, `dir: <path>`, and a `sources:` block, one source per line as `- <kind> <ref> (<role>)`, or `- text: <prose>`, or `sources: none`. Kinds: issue, project, parent, pr, doc, url, text. Roles: primary is the work; context is background. Precondition: the epic has no `plan.md`. Output: `plan.md` v1, written through the proposal gate. Intake describes the problem. It never proposes an approach or phases; scoping does that.

## Critical rules

- Research files are written to `<dir>/research/`; nothing else under the epic directory is written by hand. `plan.md` is written only by `planet proposal approve`.
- Fetch each source exactly as `references/sources.md` says, no more. A project's children are listed, not fetched.
- Codebase exploration goes to one subagent. Do not read source files in this thread beyond what a clarifying question needs.
- Clarifying questions: only what blocks a problem statement, at most three, one at a time, in chat, before entering plan mode. Never ask which tickets to keep or drop.
- The draft is composed in context. The gate writes it.

## Steps

1. **Epic facts.** Run `planet epic show <slug> --json`. Take `epic.title`, `epic.linear`, and `epic.repo`. With `sources: none`, each ID in `epic.linear` is an `issue (primary)` source; with none of those either, ask what the epic is about, which counts as one clarifying question, and treat the answer as `text`.
2. **Sources.** For each line of the `sources:` block, fetch and write per `references/sources.md`. Then write `<dir>/research/sources.md`, one line per source with kind, role, and file. Decide on one PR search: run `gh pr list -R <repo> --state all --limit 20 --search "<ID>" --json number,title,url,state` at most once for the whole epic, using the first primary issue ID, and only when no PR was named and the work reads as a follow-up or continuation, or its IDs are likely to appear in PR titles. Otherwise skip. Say in one line whether you searched and why. Append any hits to `prs.md`.
3. **Codebase.** Dispatch one general-purpose subagent on model sonnet with the brief in `references/research-brief.md` as written, slots filled from the primary sources and the research files written in step 2. It writes `<dir>/research/codebase.md` and returns the path and up to five lines. Read the five lines, not the file.
4. **Clarify.** If the sources and research leave a gap that blocks stating the problem, such as which surface, which users, or whether a described behavior is a bug or intended, ask one question and wait. Repeat at most twice more. Clear sources get no questions. Which related tickets the epic takes on is such a gap only when the problem cannot be stated without it; otherwise it goes under Open questions for scoping. Approach and preference questions are deferred to scoping; note them for the Open questions section.
5. **Draft.** Compose `plan.md` v1 in context using `references/plan-template.md`. Context links `research/sources.md` in one line and names what the codebase research settles; with a single source, Context may name that source's file directly. Repeat no figures from research files. 300 to 500 words, never more than 500.
6. **Gate.** Invoke the skill `planet:planet-proposal` with `epic: <slug>`, `to: plan`. On `approved`, go to step 7. On a rejection message, amend the draft in place to address it: a new source is fetched per step 2, appended to `sources.md`, and gets one Context line; decisions in the message become Constraints marked "(decided during review)". Do not add sections. Then invoke the gate again. On `aborted: <message>`, return `intake aborted: <message>`.
7. **Return** the line `intake done, next step scoping` to the router.

A source the user adds mid-conversation ("also look at project X") is handled as in step 2 at that moment: fetch, write, append to `sources.md`, and give it a Context line at the next gate.

## Example

Router passes `epic: finish-security-settings`, `dir: /Users/me/.planet/epics/finish-security-settings`, and a `sources:` block with `issue CRM-1211 (primary)`, `project https://linear.app/close/project/security-settings-abc (context)`, and `text: the SSO section already shipped`. Step 2 saves `research/linear-CRM-1211.md`, lists the project's seven children in `research/tickets.md` with fit notes (two `out: shipped`, three `fits`, two `related`), writes `research/brief.md` and `research/sources.md`, and skips the PR search: the ticket is not a follow-up. Step 3 returns five lines on the settings page modules. The problem is clear without deciding the two related tickets, so step 4 asks nothing and Open questions gets "whether CRM-1240 and CRM-1252 belong to this epic". Step 5 drafts; Context has one Sources line. Step 6 gates; the user rejects with "CRM-1240 is in"; the draft fetches it as an issue, appends to `sources.md`, adds a Context line, and gates again; approved. Step 7 returns.

## Troubleshooting

- Linear MCP not available or an issue, project, or document is not found: record the source in `sources.md` as unread with the reason, say so once, and continue.
- A URL and no fetch tool: record it in `sources.md` as unread; do not paste the URL into `plan.md` as a finding.
- `gh` not authenticated: skip PR sources and the search, note it in Context, continue.
- The subagent fails or returns nothing: draft from the sources alone and write "not researched" under Context for the codebase line.
- `planet epic show` says no epic: the router did not open one. Return to the router with that message.
- The gate reports the hooks did not run: stop and return that message to the router.
```

- [ ] **Step 3: Update the Context block in `skills/planet-intake/references/plan-template.md`**

Replace lines 10 to 13:

```
## Context
One line per research file: its path and what it settles. No figures or lists
from the file; the file holds the detail and is the one place it is corrected.
- Tickets: <ID> (research/linear-<ID>.md)
- Prior art: <PR urls> (research/prs.md), or none
- Codebase: research/codebase.md, one sentence on what it found
```

with:

```
## Context
One line per research file: its path and what it settles. No figures or lists
from the file; the file holds the detail and is the one place it is corrected.
- Sources: research/sources.md, <N> sources; with exactly one source, name its
  file here instead (Ticket: <ID> (research/linear-<ID>.md), or PRs: <urls>
  (research/prs.md), or Brief: research/brief.md)
- Codebase: research/codebase.md, one sentence on what it found
```

- [ ] **Step 4: Update the slots in `skills/planet-intake/references/research-brief.md`**

Replace:

```
Epic: <slug>. Repo: <owner/name>, checked out in the current directory.
Ticket summary: <two to five sentences from the Linear issue, or the user's brief>.
Prior art: <PR urls or none>.
```

with:

```
Epic: <slug>. Repo: <owner/name>, checked out in the current directory.
Work summary: <two to five sentences on what the primary sources ask for>.
Research so far: <paths of the research files written, or none>.
```

- [ ] **Step 5: Run the checks**

Run: `npm test && npm run typecheck && claude plugin validate .`
Expected: all pass; the conventions test finds `references/sources.md`, the intake body is under 1,500 words (print the count: `awk 'f>=2{print} /^---$/{f++}' skills/planet-intake/SKILL.md | wc -w`).

- [ ] **Step 6: Commit**

```bash
git add skills/planet-intake
git commit -m "take any mix of sources into intake"
```

---

### Task 2: Router passes sources; harness forbids "prior art"

**Files:**
- Modify: `skills/go/SKILL.md:34-38,41`
- Modify: `test/skills.test.ts:51`

**Interfaces:**
- Consumes: intake's `sources:` block format from Task 1.
- Produces: the `sources:` block on the intake dispatch line.

- [ ] **Step 1: Add the failing harness assertion**

In `test/skills.test.ts`, directly after line 51 (`assert.doesNotMatch(body, /\bScott\b/, ...)`), add:

```ts
    assert.doesNotMatch(body, /prior art/i, "sources replaced the prior-art line");
```

Run: `npm test 2>&1 | grep -E 'not ok|prior'`
Expected: FAIL for `skills/go/SKILL.md follows the conventions` (the router still says "prior art" in steps 4 and 7). Intake passed in Task 1.

- [ ] **Step 2: Replace router step 4**

Replace the whole step 4 line in `skills/go/SKILL.md` with:

```
4. **New epic.** Sort the request into sources: Linear IDs and issue URLs named as the work are `issue (primary)`; a project, parent issue, PR, document, or URL, or a ticket introduced with "related to", "see also", or "for background", is `(context)` of its kind; the remaining prose is `text`. Title: the first primary issue's title via the Linear MCP `get_issue` tool, else at most six words from the request. Slug: lowercase letters, digits, hyphens, at most 40 characters, no leading/trailing hyphen. Run `gh repo view --json nameWithOwner -q .nameWithOwner` for the repo. Ask exactly `create epic <slug>, "<title>", repo <owner/name>, from <IDs>?`; with no primary issue, drop `, from <IDs>` and `--linear`. On yes, run `planet epic new <slug> --title "<title>" --repo <owner/name> --linear <ID>` with one `--linear` per primary issue, then `planet open <slug> --json`. On no, ask what to change, slug, title, or repo, or which existing epic to use instead, then stop. Keep every source for step 7.
```

- [ ] **Step 3: Replace the intake clause in router step 7**

In step 7, replace:

```
intake also gets `prior art: <PR urls or none>`;
```

with:

```
intake also gets a `sources:` block, one line per source as `- <kind> <ref> (<role>)` or `- text: <prose>`, kinds issue, project, parent, pr, doc, url, text, or `sources: none`;
```

- [ ] **Step 4: Replace router step 3's opening sentence**

Replace:

```
3. **Resolve.** Requests may carry an instruction after the epic:
```

with:

```
3. **Resolve.** Requests may carry any number of Linear IDs, URLs, and prose, and an instruction after the epic:
```

- [ ] **Step 5: Check the budget and trim if needed**

Run: `awk 'f>=2{print} /^---$/{f++}' skills/go/SKILL.md | wc -w`
Expected: at most 1,100. The router was at 1,093 before this task and step 4 grows by roughly 30 words. If over, trim in this order, keeping meaning: in the Example, cut the sentence `Refresh the view; phase 1 is a draft, so run the repo check, then dispatch phase-plan.` to `Refresh; phase 1 is a draft, so repo check, then phase-plan.`; in Troubleshooting, cut `- `planet epic new` errors `already exists`: the slug is taken; run `planet open <slug> --json` instead.` to `- `planet epic new` says `already exists`: run `planet open <slug> --json`.`; in step 4, drop `or which existing epic to use instead`.

- [ ] **Step 6: Run the checks**

Run: `npm test && npm run typecheck && claude plugin validate .`
Expected: all pass, including the new `prior art` assertion for every skill. Also run `git grep -n -i 'prior art' -- skills README.md` and expect no output; if README mentions it, change the wording there in this task.

- [ ] **Step 7: Commit**

```bash
git add skills/go/SKILL.md test/skills.test.ts README.md
git commit -m "pass sources to intake from the router"
```

(Drop `README.md` from the add if it did not change.)

---

### Task 3: Scoping reads the ticket list

**Files:**
- Modify: `skills/planet-scoping/SKILL.md` steps 1 and 3

- [ ] **Step 1: Amend step 1**

Replace:

```
1. **Read.** `plan.md`, then each `research/` file its Context links. If `reason:` was passed, read it first; it says what a later step could not resolve.
```

with:

```
1. **Read.** `plan.md`, then each `research/` file its Context links, and `research/tickets.md` when it exists. If `reason:` was passed, read it first; it says what a later step could not resolve.
```

- [ ] **Step 2: Amend step 3**

Replace:

```
3. **Converse.** One question at a time: what done looks like, what is out, what would make the user reject the result.
```

with:

```
3. **Converse.** One question at a time: what done looks like, what is out, including any related tickets Open questions left undecided, what would make the user reject the result.
```

Goal and Non-goals already name what is in and out; write ticket IDs there when tickets were decided.

- [ ] **Step 3: Run the checks**

Run: `npm test && npm run typecheck && claude plugin validate .`
Expected: pass; scoping body under 1,500 words.

- [ ] **Step 4: Commit**

```bash
git add skills/planet-scoping/SKILL.md
git commit -m "settle related tickets in scoping"
```

---

### Task 4: Docs and version

**Files:**
- Modify: `README.md` (the Use section paragraph that describes intake, if it names a ticket or prior art)
- Modify: `.claude-plugin/plugin.json` version `0.3.0` to `0.3.1`

- [ ] **Step 1: README**

Find the sentence in README's Use section that describes what intake gathers. Make it say that an epic can start from any mix of Linear issues, projects, PRs, documents, URLs, or plain text, and that the research directory holds one file per source with `sources.md` as the index. Keep it to two sentences.

- [ ] **Step 2: Version**

Set `.claude-plugin/plugin.json` `version` to `0.3.1`.

- [ ] **Step 3: Checks and commit**

Run: `npm test && npm run typecheck && claude plugin validate .`

```bash
git add README.md .claude-plugin/plugin.json
git commit -m "document intake sources and bump the plugin version"
```

---

### Task 5: Live verification

Manual, in a fresh `claude --plugin-dir /Users/scottmahr/code/personal/planet` session from the epic's repo. Record outcomes in `docs/superpowers/notes/2026-09-09-intake-sources-live.md`.

- [ ] **Step 1: Create an epic from a ticket plus a project shared as related.** Request text like `/planet:go start CRM-1234, related to the project https://linear.app/... `. Expected: the confirmation line lists `from CRM-1234` only; `epic.linear` is `[CRM-1234]`; intake's dispatch shows a `sources:` block with the issue as primary, the project as context, and a text line.
- [ ] **Step 2: Intake.** Expected: `research/linear-CRM-1234.md`, `research/tickets.md` with a fit column, `research/sources.md`, `research/brief.md`; no question about keeping or dropping tickets; `plan.md` Context has one Sources line; Open questions names undecided related tickets if any.
- [ ] **Step 3: Add a source mid-intake or at the gate rejection** ("also look at PR #N"). Expected: `prs.md` gains a section, `sources.md` gains a line, Context gains a line at the next gate.
- [ ] **Step 4: Scoping.** Expected: the related tickets come up under "what is out" without a keep-or-drop menu; Goal or Non-goals name the IDs.
- [ ] **Step 5: Record.** Deviations, fixes as their own commits, then `record intake sources live verification`.

---

## Self-review notes

- Spec coverage: Sources table and file formats → Task 1 reference; router changes → Task 2; intake steps and template → Task 1; scoping sentence → Task 3; testing (harness `prior art`, reference exists, budgets) → Tasks 1 and 2; live → Task 5. Not included items untouched.
- Names: the `sources:` block format is identical in the router step 7 clause, intake's input line, and the Task 1 interface block. `references/sources.md` is named in intake's Critical rules and step 2, so the harness checks it exists.
- Budgets: intake grows to roughly 900 words; router near 1,100 with trims listed.
