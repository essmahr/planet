# Findings document

```
# Feedback review <date>

Since: <last review date or the beginning>. Sources: <N> lessons to apply,
<N> skill-tagged rejections, <N> retros (distinct epic and phase pairs in lessons), <N> epics.

## Recurring

### <what the group asks for, as a sentence>
Seen <N> times in <phases or epics>:
- "<quote>" (<epic> phase <N> | proposal <id>)
- ...
Skill: `skills/<name>/SKILL.md` <section or step>.
Replace:
> <current text>
With:
> <new text>
Budget: <words before> to <words after> of <budget>.

## Appendix

### Tested
- Tested: <skill> <section>: control <fails>/<runs>, variant <passes>/<runs> | control did not fail, dropped

### Singletons
- <text> (<source>): seen once; marked apply but no recurrence yet.

### Plan-local
- <text> (<source>): about that epic, not the skill.

### Not Planet's to fix
- <text> (<source>): points at <superpowers | CLAUDE.md | the repo>.
```

Under 1,000 words. One `###` per recurring group; the group heading is what
later reviews match against, so keep it stable when the same group recurs.
