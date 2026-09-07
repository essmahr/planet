# Skills live verification (plan Task 7)

Run 2026-09-07 in Claude Code from the close-ui repo, iTerm, with
`claude --plugin-dir /Users/scottmahr/code/personal/planet`. Ticket EPD-616.

## Results

1. **Glance.** `/planet:go` with no text rendered an empty table. The injected
   `planet status --json` block worked at load and showed `[]`. Claude then ran
   `planet status --json` once more because the troubleshooting line said
   "empty"; fixed in `ac18b25` so `[]` reads as a real answer.
2. **New epic.** `/planet:go EPD-616` produced the confirmation line; on yes,
   epic `move-icons-into-design-system` was created and opened, the repo check
   passed, intake started.
3. **Intake.** Linear issue saved to `research/linear-EPD-616.md`; one PR search
   ran (no PR named, ticket carries an ID) and found nothing; a subagent wrote
   `research/codebase.md`; no clarifying questions; plan mode opened with the
   draft.
4. **Gate.** Rejected once with a four-line message, approved the revision. The
   rejection asked for prior art on directory naming; intake added
   `research/prior-art-dir-naming.md` and re-gated. Store: proposal 1
   `rejected` with the message verbatim and tag `scope-add`, proposal 2
   `approved`, `plan.md` written by the CLI (648 words, above the 300 to 500
   target because the rejection asked for more). Dialog offered "Yes, and
   auto-accept edits", "Yes, and manually approve edits", and "No, keep
   planning"; the second was chosen. Both yes options return the same result
   to Claude, so the gate runs `planet proposal approve` either way.
5. **Re-entry.** `/planet:go move-icons-into-design-system` said `opened` and
   `next step: scoping (not built yet)`. The dead-end wording was improved in
   `448fff6` to say the epic is saved and how to resume.
6. **Untouched plan mode.** A plan in a session without `/planet:go` added
   nothing to the store.

Also observed: prompt capture works (`kind: planning`, anchored to proposal 2);
the SessionEnd hook fired when the first session closed (`end session` commit);
`planet capture --help` run by hand logged a stack trace, fixed in `491efec`.

## Open items

- Inline plan editing exists only in the VS Code review; the `.edited.md` path
  is covered by unit tests but has not been exercised live.
- Intake's plan length target (300 to 500 words) was exceeded when the
  rejection asked for more research. Leave as is or say "at most 600".
- The first real epic stops at "next step: scoping (not built yet)". Follow-on 3
  starts with scoping.
