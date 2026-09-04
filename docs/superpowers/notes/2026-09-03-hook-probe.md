# Live verification notes (plan Task 20)

Task 2's probe was folded into this task; the capture handler was written for
every candidate payload shape, and this session confirms which ones occur.

## Step 1: load plugin, create probe epic

Passed. `planet epic new`, `phase new`, `session start`, and `status` all ran
from the plugin's `bin/` on the Bash tool's PATH. The session id printed by
`planet session start` matched the Claude Code session, so
`CLAUDE_CODE_SESSION_ID` is the right source.

Finding: `node` was not on PATH in the Claude Code Bash shell (nvm not
initialised there), so `bin/planet` failed until PATH was prepended by hand.
The hook shim would have failed the same way, silently. Fixed in commit
`3ccd3b1`: both shims source `cli/find-node.sh`, which tries `PLANET_NODE`,
then `node` on PATH, then the newest v24 under `$NVM_DIR`. The hook logs
`node not found` to `hook.log` and still exits 0 when nothing resolves.

## Steps 2 and 3: plan approval and rejection

Run with a catch-all probe hook logging every raw payload (138 events).

- Approval fires `PostToolUse` for ExitPlanMode with `tool_response` as an object,
  `{ plan, filePath, isAgent }`. `tool_input` is empty at that point. The sentence
  "User has approved your plan" is what the model sees, not what the hook sees.
  Detection now uses `tool_response.plan` as the approved text. The approved plan
  matched the PreToolUse snapshot byte for byte, so `edited: false` is right when the
  review dialog offers no editing.
- Rejection fires no hook event at all. The sequence is `PreToolUse` →
  `PermissionRequest` → `Notification` (permission_prompt), then nothing until the
  next `PreToolUse` for the revised plan. `PostToolUseFailure` and `PermissionDenied`
  never fired. A rejection is therefore inferred when a new ExitPlanMode arrives while
  a proposal from the same session is still pending.
- The rejection message is only in the session transcript, at the `transcript_path`
  every hook payload names. The record for the tool_use has `toolDenialKind:
  "user-rejected"` and `userFeedback` with the exact words. `cli/lib/transcript.ts`
  reads that best-effort and falls back to a placeholder. This is the one dependency
  on Claude Code's transcript format; it is isolated to that file.
- `/reload-plugins` silenced every hook for a `--plugin-dir` plugin in the running
  session. A fresh `claude --plugin-dir ...` session loaded them again. Reload is not
  safe for hook changes during development.
- `UserPromptSubmit` also delivers Claude Code's own `<task-notification>` messages.
  These are now filtered before capture.
- `Stop` and `Notification` events fire per turn; not used.

Fixed in commits `fd6e6b4` and the one after it. Proposals 1 to 5 in the probe epic
stayed `pending` because they were captured before the fix.

## Steps 4 to 6

Pending.
