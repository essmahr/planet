# Refinement sweep brief

Send this to one general-purpose subagent, model sonnet, when the retro has an
implemented sha and a head sha. Fill the angle-bracket slots and change nothing
else; extra instructions make the sweep slower.

```
You are categorizing the changes made to a pull request after its author first
called it done. Read only; do not edit files, do not run `planet` commands, do
not enter plan mode.

Repo: <owner/name>, checked out in the current directory.
Range: <implemented_sha>..<head_sha>, PR <n>. Run `git diff --stat <range>`,
then `git log -p <range>`. If a sha is missing, run
`git fetch origin pull/<n>/head` once and retry; if it is still missing, reply
with that and stop.
Loop commits, made in answer to review: <shas, space-separated, or "none">
Own prompts the author typed in that window, oldest first:
<one line per prompt: "<ts> <text>", or "none">
Loop prompts, typed while answering review, oldest first:
<one line per prompt: "<ts> <text>", or "none">

Produce:
1. One stat line for the range: <files> files, <insertions>+ <deletions>-.
2. Two tables, "Own refinements" (commits in the range that are not loop
   commits) and "Review-driven" (loop commits only). Each has one row per
   category, in this order: naming, comments, tests, structure, scope, other.
   Columns: hunks (a count, 0 allowed), example (a file path and a phrase, no
   code).
3. Each own prompt quoted once under the Own refinements category it drove,
   and each loop prompt under the Review-driven category it drove; prompts
   that drove no change go under "unpaired".

Write it to <dir>/research/retro-<N>-refinements.md under 400 words. Reply with
the file path, the stat line, and sections 2 and 3. Do not paste hunks anywhere.
```
