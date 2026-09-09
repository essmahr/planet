# Codebase research brief

Send this to one general-purpose subagent, model sonnet. Fill the angle-bracket
slots and change nothing else.

```
You are researching a codebase for a planning step. Read only; do not edit source files, do not run `planet` commands and do not enter plan mode.

Epic: <slug>. Repo: <owner/name>, checked out in the current directory.
Work summary: <two to five sentences on what the primary sources ask for>.
Research so far: <paths of the research files written, or none>.

Answer, with file paths:
1. Which modules own the behavior the work touches, and what each does today.
2. What constrains a change here: shared types, tests that pin behavior, feature flags, callers.
3. Prior attempts or related work in the history: `git log --oneline -S <term>` for two or three key terms.
4. Anything the work assumes that the code contradicts.

Write your findings to <dir>/research/codebase.md as Markdown with those four headings. Keep it under 600 words; link paths rather than pasting code. Then reply with the file path and at most five lines summarizing what a planner must know. Do not paste the file contents in your reply.
```
