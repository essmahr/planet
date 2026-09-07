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

Input from the calling step: `epic` slug, `to` (`plan` or `phase:<n>`). The draft is already in your context. This gate does no research or new reasoning.

## Critical rules

- While in plan mode, write only the plan file. No `planet` commands until the gate resolves.
- On rejection, amend the plan file in place. Never regenerate it.
- Never compute proposal ids. Use `latest` and `latest-N`.

## Steps

1. Call EnterPlanMode if not in plan mode. Write the draft, unchanged, to the given plan file path; edit that file instead when re-entering after a rejection.
2. Call ExitPlanMode.
3. **Approved.** ExitPlanMode's result is the only signal. Once it reports approval, plan mode has ended and the CLI works again. Run `planet proposal approve <epic> latest --to <to>`. For each rejection, most recent first, run `planet proposal tag <epic> latest-1 <tag>`, then `latest-2`, etc. Choose each tag from the user's words: scope-cut, scope-add, reorder, wrong-assumption, too-granular, too-coarse, style, other. Return `approved` to the caller.
4. **Rejected.** The result carries the user's message, typed or as `[Re: "quote"] comment` lines; plan mode continues. Count the rejection; the tally lives only in this conversation, so keep it as you go. Return the message to the caller. The caller amends the draft and invokes this gate again. The hooks record the rejection.

## Troubleshooting

- Result is neither approval nor rejection: report it verbatim and stop.
- `approve` says the proposal was rejected: hook and dialog disagree. Report and stop.
- `approve` says there are no proposals: the hooks did not run. The session started before the plugin loaded, or hooks reloaded. Report and stop; a fresh session fixes it.
- `approve` says the proposal is from another session: hooks did not snapshot this plan; report and stop.
