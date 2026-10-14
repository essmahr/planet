# Routing edits: micro-tests, 2026-10-14

Method per `skills/planet-feedback-review/references/micro-test.md`: one fresh
general-purpose subagent on sonnet per run, reading the skill directory
(control: `main` at 4dbaadc, extracted with `git archive`; variant:
`routing/skills`) and a scenario file, asked for its next tool calls verbatim
in a dry run. Three runs per arm. Every run read by hand. Scenarios in the
session scratchpad, reproduced in short below.

## S1 go: implement a planned phase without asking

Scenario: phases 1 and 2 reviewed, phase 3 just planned, phase 4 draft;
phase-plan returned `phase 3 planned`.

- Control 3/3 fail: every run's next call is the three-option AskUserQuestion
  ("Implement phase 3 here / Plan the next phase / Stop"); two load the tool
  schema first.
- Variant 3/3 pass, one shape: `Skill(planet:planet-implement, epic, dir,
  phase: 3)` with no question, each noting both lower phases are reviewed so
  no `base:` applies, and each ending the turn after `implemented`.

Kept.

## S2 intake: open questions in one AskUserQuestion before plan mode

Scenario: CRM-1211 fetched, two things undecided (two related tickets; bug or
intended), draft composed.

- Control 3/3 fail: every run asks the bug-or-intended question alone, in
  chat, and sends the related-ticket question to Open questions, where the
  store shows it comes back as a rejection.
- Variant 3/3 pass, one shape: one AskUserQuestion with three questions, each
  with In/Out (or Bug/Intended) and "Defer to scoping"; answers to
  Constraints "(decided during intake)", deferred ones to Open questions, then
  the proposal.

Kept.

## S3 implement, push policy

Scenario: draft PR, no reviews or comments, commit 2 just amended locally.

- Control 0/3 asked before pushing: all three force-push with lease without a
  prompt. The dry run lacks what makes live sessions ask (the user's standing
  "confirm hard-to-reverse actions" rule and the real diff), so the 58 stored
  "push" prompts stand as the evidence for that clause. What the control did
  show, 3/3: re-recording `implemented` at the new tip after the author's own
  change, which empties the retro's refinement window.
- Variant 3/3 pass, one shape: `git push --force-with-lease`, report, no
  re-record; one run re-checks reviews first, which the reference allows.

Kept on the record-once evidence; the ask-first clause rests on the store.

## S3 implement, branch name

Scenario: planned phase closing CRM-1402, no branch.

- Control 3/3 fail: every run loads and calls the Linear `get_issue` tool for
  `branchName`, with "ask once for a name" as the fallback.
- Variant 3/3 pass, one shape: `gh api user -q .login`, then
  `git checkout -b <login>/crm-1402-calling-call-bar-labels`, then setup. Two
  runs note the skill does not name the setup command; that is by design, it
  comes from the repo.

Kept.

## S4 phasing: section-only proposal

Scenario: re-cut from phase 4 on a 2,100-word plan.md with 8 phases, 1 to 3
shipped.

- Control 3/3 fail: every run proposes the whole plan.md ("v3", all nine
  sections) with `to: plan`.
- Variant 3/3 pass, one shape: the proposal is `## Phases` alone, nothing
  above it shown, `to: phases`, with a `changes:` block naming the split and
  the renumbering. One run miscounted the renumbering (6 to 10 instead of 6 to
  9); the shape is the same.

Kept.

## S5a phase-plan: conventions checked and a why per decision

Scenario: a lint rule phase where a hand-written rule was picked over wrapping
a vendored one after reading ESLint's docs and the installed plugin source.

- Control: 0/3 write a Conventions checked line; the sources read are
  mentioned in passing, inside Decisions, or not at all. 3/3 do write a
  Decisions section with a why, so this scenario did not show the
  missing-Decisions failure; the scenario primes the choice too strongly.
- Variant 3/3 pass, one shape: `Conventions checked:` with one bullet per
  source and what it says the commits rely on, then one `###` Decision with a
  one-to-three-sentence why.

Kept for the Conventions slot on this evidence; the Decisions slot rests on
the store's 37 questions-only rejections.

## S7 retro: no quota, no Blocks, repeats as repeats

Scenario: shipped phase, two prompts, one lesson already applied in phase 18
and not applied by this phase's plan.

- Control 3/3 fail on two of three counts: every run writes `## Blocks` with
  "none", and every run rewords the phase 18 lesson as a new one ("Repeat of
  phase 18, the grep ... did not happen" or the old text with "(repeat of
  phase 18)" appended), with no machine-readable marker. The quota failure did
  not reproduce: each run wrote one lesson, since the scenario gave material
  for one.
- Variant 3/3 pass: no Blocks section; the lesson in phase 18's exact words
  with `repeat_of: 18`; the evidence says the plan did not apply it. Wobble:
  two runs put the evidence in a frontmatter `evidence:` field the CLI drops,
  instead of the Lessons body line. Harmless, but the template could name the
  body line more plainly next time.

Kept.

## Summary

| Edit | Control fails | Variant passes | Note |
|---|---|---|---|
| S1 router default | 3/3 | 3/3 | |
| S2 intake question | 3/3 | 3/3 | |
| S3 push policy | 0/3 ask, 3/3 re-record | 3/3 | ask-first clause rests on the store |
| S3 branch name | 3/3 | 3/3 | |
| S4 section-only | 3/3 | 3/3 | |
| S5a conventions, decisions | 3/3, 0/3 | 3/3 | Decisions slot rests on the store |
| S7 retro | 3/3 Blocks and rewording, 0/3 quota | 3/3 | evidence field wobble |

42 runs, about 1.8M subagent tokens on sonnet.
