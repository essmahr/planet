# Does a resumed session keep its session id?

The prompt hook restarts a dead feedback watcher only for PRs the prompting session owns. That depends on a resumed session having the same `session_id` it had when it opened the PR.

## Status: not confirmed by a run

The planned probe (`claude -p`, then `claude --resume <id> -p`, comparing ids) did not run. The `claude` CLI in the build shell was not signed in ("OAuth session expired").

## What the docs say (checked 2026-11-13)

- `--continue` and `--resume <id>` reopen the existing transcript. Only `--fork-session` and `/branch` are documented to "get their own session IDs" ([sessions](https://code.claude.com/docs/en/sessions.md)). So a plain resume most likely keeps the id. The docs do not state it outright.
- `SessionStart` fires on resume with `source: "resume"` ([hooks](https://code.claude.com/docs/en/hooks.md)).
- `SessionEnd` fires when a session terminates. Planet deletes the session marker there, so the restart check runs before the marker check and does not need one.
- Background Bash tasks are not restored on resume. A watcher started before the session closed is gone, which is the case the hook restart covers.
- `CLAUDE_CODE_SESSION_ID` is not on the documented env vars page. Planet already relies on it.

Unverified community reports say some paths fork the id on resume (`--resume <id> --bg`).

## How to confirm

Item 7 of the live check in `2026-11-13-pr-feedback-github-first-live.md`: quit and reopen the owning session, send a prompt, and check the watcher restarts.

## If the id changes on resume

The restart never fires for the resumed session. The fallback is `/planet:go <slug> pr feedback N` once in that session, which moves ownership to the new id. That goes against the design's "the user never restarts a watcher by hand". A fix would be to key ownership on something that survives a resume.
