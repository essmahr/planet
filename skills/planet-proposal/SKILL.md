---
name: planet-proposal
description: Only invoked by Planet step skills, never on its own. Presents a drafted planning document for approval through native plan mode and records the outcome with the planet CLI. Do not use for ordinary plan mode or for any task outside a Planet session.
user-invocable: false
allowed-tools: Bash(planet *)
compatibility: Claude Code with the planet plugin loaded and its hooks active.
metadata:
  version: 0.1.0
---

# Planet: proposal gate

Input from the calling step: `epic` slug, `to` (`plan` or `phase:<n>`), `step` name. The draft is already in your context. This gate does no research and no new reasoning. No session wrapper is needed: the caller's active planet session already covers it.

## Critical rules

- While in plan mode, write only the plan file. No `planet` commands until the gate resolves.
- On rejection, amend the plan file in place. Never regenerate it.
- Never compute proposal ids. Use `latest` and `latest-N`.

## Steps

1. If not already in plan mode, call EnterPlanMode. Write the draft, unchanged, to the plan file path Claude Code gives you. When re-entering after a rejection, edit that file instead.
2. Call ExitPlanMode.
3. **Approved.** The result says the plan was approved and plan mode has ended. Run `planet proposal approve <epic> latest --to <to>`. Then for each rejection in this cycle, most recent first, run `planet proposal tag <epic> latest-1 <tag>`, then `latest-2`, and so on. Choose each tag from the user's words: scope-cut, scope-add, reorder, wrong-assumption, too-granular, too-coarse, style, other. Return `approved` to the caller.
4. **Rejected.** The result carries the user's message, either typed or as `[Re: "quote"] comment` lines, and plan mode continues. Count the rejection and return the message to the caller. The caller amends the draft and invokes this gate again. The hooks record the rejection.

## Troubleshooting

- The result is neither an approval nor a rejection: report it verbatim and stop.
- `approve` says the proposal was rejected: the hook and the dialog disagree. Report and stop.
- `approve` says there are no proposals: the hooks did not run. The session was started before the plugin loaded, or hooks were reloaded. Report and stop; a fresh session fixes it.
