---
name: planet-feedback-review
description: Only invoked by the Planet router, never on its own. Reads the feedback report and retros across every epic, groups recurring pushback, proposes exact edits to the Planet step skills through plan mode, and applies approved edits on a branch in the plugin repo. Do not use outside a Planet review session.
user-invocable: false
allowed-tools: Bash(planet *), Bash(git *), Bash(npm test)
compatibility: Claude Code with the planet plugin loaded, run from the plugin repo itself.
metadata:
  version: 0.2.0
---

# Planet: feedback-review

Input from the router: `since: <date or none>`. Precondition: the current directory is the plugin repo and `planet session review` has run. Output: a findings document proposed for approval and recorded in the store, edits committed on a branch, and the return line.

## Critical rules

- Read `planet feedback report --json` and the retros it lists. Not raw proposals or prompts; the report carries the rejections verbatim.
- An edit needs recurrence: the same lesson marked apply, or the same `skill` rejection, in two phases (a lesson's `phase`, a rejection's `phase`, null counting as its own) or two epics, or one the user named in the request. Everything else goes in the appendix with a count and no edit.
- Every edit is exact replacement text for a named skill file and section. Run `npm test` before each commit; a budget failure is fixed by trimming in that skill and said in the commit body.
- Never commit to `main`. Never edit anything outside `skills/`; pushback about superpowers, CLAUDE.md, or the repo goes under "not Planet's to fix".
- The findings document is written by `planet-proposal` and recorded by `planet proposal approve review latest --to review`. Nothing else is written to the store.

## Steps

1. **Report.** `planet feedback report --json`. Take `lessons` with `apply: true`, `skill_rejections`, and `reviews`. Each lesson row carries `path`; read that retro's Lessons section for the evidence line.
2. **Group.** Cluster by what they ask for, not by wording. A group recurs when its items span two phases or two epics. Attach every quote with its source. Drop a group whose heading matches one in a past review's `groups`; keep headings stable so this works.
3. **Draft** from `references/findings-template.md`: one section per recurring group with quotes, count, the skill file and section, current text, replacement text, and the word count effect against the harness budget (the harness enforces budgets; state words added). Then the appendix. No recurring group: skip to step 6 with the second return line.
4. **Propose.** Invoke `planet:planet-proposal` with `epic: review`, `to: review`, and no `changes:`, since this is the document's first proposal. On rejection, amend in place and propose again with `changes:` for the amendment. On `aborted: <message>`, run `planet proposal reject review latest --feedback "<message>"` and return `feedback-review aborted: <message>`.
5. **Apply.** `git checkout main && git pull --ff-only`, then `git checkout -b feedback-review/<date>`. For each skill file in the approved document, apply its replacements, run `npm test`, commit `<skill>: <group heading, lowercased>`. Leave the branch checked out.
6. **Return** `feedback review done, feedback-review/<date>`, or `feedback review done, nothing recurs`.

## Example

Report: three lessons to apply, two `skill` rejections, one past review dated 2026-09-01 with the group "Name the spec file in phase plans". Two lessons and one rejection from different epics all ask phase-plan to state the test file and its describe block before implementation; that group recurs and is not in the past review. One rejection asks implement to stop adding docblocks: seen once, appendix. Draft: one recurring group pointing at `skills/planet-phase-plan/SKILL.md` step 5 with the replacement sentence and "659 to 671 of 1,500". Propose, approve, record. Branch `feedback-review/2026-09-10`, one commit `planet-phase-plan: name the test file and describe block in commits`, `npm test` green. Return `feedback review done, feedback-review/2026-09-10`.

## Troubleshooting

- `planet feedback report` lists no lessons and no skill rejections: return `feedback review done, nothing recurs` without proposing.
- `planet-proposal` reports the hooks did not run: `planet session review` was not run; return that message to the router.
- `npm test` fails on a budget after an edit: trim the same skill's Example or Troubleshooting until it passes; say so in the commit body.
- `main` is behind the remote: `git pull --ff-only` before branching; if that fails, stop and report.
