# Manual phases

Read in step 5 when the phase's kind is `manual`. The document has `## Steps`
and `## Done means` in place of Commits and Verification; Context, Decisions,
Size, Out of scope, and Closes stay.

## Steps

- One numbered Step per action. Where a command does the action, the Step is
  the command and the observation that says it worked, not a description of
  doing it by hand. "Can we do these steps programmatically?" is the question
  to answer before writing a Step a person performs.
- A per-item phase (tickets to write, issues to update, documents to
  replace) is one Step per item. Each Step is "present the draft in chat, get
  a yes, write it", and the writing tool is named. Approval is in chat, item by
  item, not plan mode: the items are the phase's output, and the phase
  document only lists them.
- A spike Step reads the installed source and the code first and writes
  predictions; a run in a server or browser only confirms them.
- A phase that replaces an existing document starts with a Step that reads
  the current version.
- An investigate or measuring phase ends with a Step that writes its findings
  to `research/<name>.md` and names the later phases those findings can
  change. When they do change one, implement returns
  `re-cut from phase <N>: <what the findings showed>` rather than re-planning
  the later phase in place.

## Done means

One sentence a person can check: a file exists, a count is zero, a ticket is
in Linear, a flag is on for a named group. Never "the investigation is
complete".

## Size

"Not applicable" plus the number of items or Steps, so the retro can compare.
