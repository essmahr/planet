---
name: plan
description: Planet's phase-plan rules for a one-off plan, one PR, no epic and no store. Use for /planet:plan. Not for work that spans several PRs, which uses /planet:go.
argument-hint: "[what to plan: prose, a ticket, a PR]"
disable-model-invocation: true
allowed-tools: Bash(test -f *), Bash(git log *), Bash(git grep *), Bash(gh pr view *), Bash(gh pr diff *), Bash(gh repo view *)
compatibility: Claude Code with the planet plugin loaded. gh authenticated for PR sources. Linear MCP connected for tickets.
metadata:
  version: 0.1.0
---

# Planet: plan

Input: the request below. Output: a plan document for one PR, approved through native plan mode. Nothing is written to `~/.planet` and nothing is implemented.

Request: $ARGUMENTS

## Critical rules

- Planet owns planning here; skip superpowers brainstorming and writing-plans.
- Run no `planet` command and write nothing under `~/.planet`; step 1's marker check is the only read there. The plan file Claude Code names is the only file written.
- Read `../planet-phase-plan/references/drafting-rules.md` before step 4 and apply it to the draft.
- Ask only when the code surfaces a choice the request does not settle and the answer changes the PR's shape.
- Plan only. After approval, stop; implement only when the user asks in a later message.

## Steps

1. **Epic session check.** Run `test -f "${PLANET_HOME:-$HOME/.planet}/sessions/$CLAUDE_CODE_SESSION_ID" && echo open || echo none`. `open` means a `/planet:go` marker is set for this Claude session, and the hooks would record this plan as that epic's proposal and reject its pending one. Say so, ask the user to run `/planet:plan` in a new session, and stop.
2. **Sources.** Fetch what the request names: a Linear issue through the Linear MCP, a PR with `gh pr view <n> --json title,body,files` and `gh pr diff <n>`, a URL with a fetch tool. With no request text, ask what to plan.
3. **Read the code.** Read the files the work touches, their tests, and their importers directly; this is small work, so no subagent.
4. **Clarify.** One AskUserQuestion, at most four questions, multiple choice when the options are known. Borrow from `../planet-scoping/references/shapes.md` where a question fits: what done looks like, what is out, what would make the user reject the result. Skip what the sources answer. Clear work gets no question.
5. **Size check.** Count commits and changed files in the repo. Budget: about 20 files or about 8 commits. Over: say what drives the size and ask with AskUserQuestion: `Plan it as one PR anyway` or `Stop` (an epic starts with `/planet:go`). A pure move's file count is exempt.
6. **Draft** in context from `../planet-phase-plan/references/phase-template.md`, applying the drafting rules, with these changes for a one-off: the heading is `# <title>`; Context states the request and the sources read, with no Lessons applied; Out of scope bullets name no phase. Work with no code change uses `../planet-phase-plan/references/manual-phase.md` for Steps and Done means, without its `research/` step.
7. **Propose.** Call EnterPlanMode unless in plan mode, write the draft unchanged to the plan file it names, then call ExitPlanMode. On rejection, amend the plan file in place, say in one to four bullets what changed, and call ExitPlanMode again. A message that says stop or abort ends the skill.
8. **Done.** On approval, say the plan file's path and stop.

## Example

`/planet:plan rename usePhoneInput's onBlur prop to onCommit`. The marker check prints `none`. No sources to fetch. Reading the code: the hook, 6 callers, 2 specs. No question: the request settles the name. Size: 9 files, 1 commit. Draft: Commits 1 renames the prop, Kind refactor, green, Files listing the hook, the 6 callers, and the 2 specs. Verification: typecheck and the hook's spec. Propose; approved; say the path and stop.

## Troubleshooting

- Already in plan mode: steps 1 to 6 only read, so continue; step 7 skips EnterPlanMode.
- The request reads as several PRs: say so at step 5 instead of drafting.
- ExitPlanMode's result is neither approval nor rejection: report it verbatim and stop.
