This live check has not been run yet.

1. Open a PR from a Planet session; confirm the phase file's PR has that session.
   Result: not run
2. Comment from a second account or as a bot; confirm nothing happens in any session.
   Result: not run
3. 👍 two comments within a minute; confirm one wake, two drafts, no push, and a patch file.
   Result: not run
4. 👀 a comment; confirm a take in chat and the 👀 removed.
   Result: not run
5. 👍 a question; confirm the 👍 is removed and the reason is in the report.
   Result: not run
6. Reply `push except <name>`; confirm the pushed commits have the trailer, their comments have 🚀, and the kept draft is still listed.
   Result: not run
7. Kill the watcher process; send any prompt in the owning session; confirm it restarts without a mention.
   Result: not run
8. Send a prompt in a second session on the same epic; confirm no line about the PR.
   Result: not run
9. Merge the PR; confirm cleanup.
   Result: not run
10. Remove a reaction that is not there (`planet pr react <id> --remove eyes` on a comment with no 👀); confirm it does not error.
    Result: not run
11. Quit and reopen the owning session, send a prompt; confirm the watcher restarts. This tells us a resumed session keeps its session id; see `2026-11-13-resumed-session-id.md`.
    Result: not run
12. Say "do it" after a 👀 take; confirm a 👍 appears on the comment and the draft survives the next wake.
    Result: not run
