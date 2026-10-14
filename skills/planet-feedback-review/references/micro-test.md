# Micro-testing a skill edit

An edit that changes what the skill does, not one that moves text or fixes a
reference, is tested before its commit. The test shows two things: without the
edit the skill produces the failure the lesson describes, and with it the skill
does not. An edit whose control arm does not show the failure is dropped, and
the findings document says so; a lesson is not evidence that the text is wrong.

## Runs

One general-purpose subagent on model sonnet per run, fresh each time, with:

- System context: the whole skill file, control arm from `main`, variant arm
  with the edit applied. Not the edited sentence alone; wording binds or fails
  in the context it sits in.
- User message: a scenario that tempts the old behavior, ending with "List the
  tool calls you make next, in order, verbatim. Do not run them." The subagent
  must not run `planet` commands or touch the store.

Three runs per arm. Five when the arms overlap or a run is ambiguous.

## Scenario

Written once per edit, under 150 words, from a real case in the store:

```
Edit: <skill>, <section>: <the replacement, one line>
Store: <the epic's state as the step would see it: statuses, PR state, what
exists on disk; two to four lines>
Prompt: <what the user said, or the router's dispatch line>
Failure the control should show: <one sentence>
```

## Scoring

Read every run; never grep for a phrase, since quoted counter-examples and
template echoes match too. A run passes when its next calls avoid the failure.
The edit is kept when at least two of three control runs fail and every variant
run passes with the same shape. Variant runs that pass in three different ways
mean the wording is not binding: tighten the form, then test again.

## Record

In the findings document's appendix, one line per edit:
`Tested: <skill> <section>: control <fails>/<runs>, variant <passes>/<runs>`.
A dropped edit says `control did not fail`.
