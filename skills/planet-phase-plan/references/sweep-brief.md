# Phase sweep brief

Send this to one general-purpose subagent, model sonnet, when the phase touches
code that research/codebase.md does not already cover. Fill the angle-bracket
slots and change nothing else; extra instructions make the sweep slower.

```
You are researching one phase of a plan. Read only; do not edit source files,
do not run `planet` commands, do not enter plan mode.

Repo: <owner/name>, checked out in the current directory.
Phase: <title>. Scope: <the paragraph from the Phases section>.

Answer with file paths:
1. The files this phase will change, and the modules that import each.
2. Tests that pin the current behavior of those files.
3. Patterns neighbouring code follows that the change should match.
4. Anything in the scope paragraph that the code contradicts.

Write to <dir>/research/phase-<N>.md under 500 words. Reply with the file path
and at most five lines a planner must know, including a rough count of files
that will change.
```
