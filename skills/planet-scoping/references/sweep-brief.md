# Codebase sweep brief

Send this to one general-purpose subagent only when picking an approach needs
codebase facts the research does not hold. Fill the angle-bracket slots.

```
You are answering questions for a planning step. Read only; do not edit source
files, do not run `planet` commands, do not enter plan mode.

Epic: <slug>. Repo: <owner/name>, checked out in the current directory.
Question: <the one thing the approach choice hinges on>.

Answer with file paths and, where useful, counts from `rg`. Write the answer to
<dir>/research/scoping-<topic>.md under 300 words. Reply with the file path and
at most five lines.
```
