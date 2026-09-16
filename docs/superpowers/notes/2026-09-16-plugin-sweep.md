# Plugin sweep, 2026-09-16

A read of every spec, note, skill, reference, CLI file, and test, plus
measurements of the live store, looking for token cost, cheaper-model
opportunities, and correctness gaps. What was found, what was done the same
day, and what is parked with its trade-offs.

## Store measurements

Three epics with data (a fourth directory was an orphan with no `epic.yaml`).

- 78 proposals, 109K words of proposal bodies. Phasing proposals run 2,700 to
  2,900 words each because they carry all of `plan.md`.
- phase-plan: 25 of 49 proposals rejected, 2.0 proposals per approval. Intake
  3.0 on nine. Scoping 1.0 on three.
- Inline edits (plan text changed in the review pane before approving): 0 of 78.
  Rejections with `[Re: "quote"]` comments are the mechanism actually used.
- Prompts captured: 147 during implementation, 17 during planning.
- Rejection tags: 33 of 36 tagged; none tagged `skill`. `wrong-assumption` 9,
  `scope-add` 8, `style` 8.
- Store git: 25MB, 868 commits, 22MB of it implement-run `.log` files under one
  epic's `research/`.

## Done on 2026-09-16

- `recomputeEpicStatus` ships an epic whose phases are all manual; it never
  linked a PR, so it stayed `planning` after every phase was reviewed.
- `commit()` retries when another hook run holds `.git/index.lock`; three
  failures were in `hook.log`.
- `retro inputs` closes the prompt window at the phase's `shipped_at`, so the
  retro session's own prompts stay out of Refinements.
- `last_approved_step` moves only on intake, scoping, phasing, and phase-plan;
  an approved plan from plain plan mode mid-implement or mid-retro no longer
  masks where planning stands.
- Inline-edit tracking removed: no `.edited.md`, no `edited` flag, no edit diffs
  in the report. `approve --to` writes the snapshot; an approved text that
  differs from its snapshot is written to `hook.log`.
- Store: orphan epic directory removed, `.log` files removed, `*.log` ignored
  (also in the default `.gitignore` for new stores).
- Retro's refinement pass (categorizing `implemented..head`) moved to a sonnet
  sweep with `skills/planet-retro/references/refinement-brief.md`.
- Router: new-epic and review-feedback paths moved to
  `skills/go/references/`; the body is back under 1,250 words.

## Parked

### Section-only proposals for phasing re-cuts

Today phasing proposes all of `plan.md` as v3, and a re-cut from phase N
re-sends the whole document. With edit tracking gone, the proposal body no
longer has to equal the file, so `planet proposal approve --to plan --section
Phases` could splice an approved section into `plan.md`.

For:

- The plan-mode dialog shrinks from ~2,800 words to the Phases section.
  Rejection cycles re-send the section, not the document.
- The proposal snapshot records what actually changed, so the feedback report's
  per-step stats stop counting untouched sections as proposed text.

Against:

- A re-cut from phase 3 of 6 still shows all six entries, so it shrinks the
  noise without removing it. The `changes:` block above the dialog is what
  tells you which entries moved.
- The section is reviewed without the Approach above it. That text was
  approved earlier and is unchanged, but it is out of sight during review.
- `approveTo` gains a splice: find `## Phases`, replace to end of file, or
  append when absent. Scoping's "carry `## Phases` verbatim at the end" rule
  already assumes it is the last section, so the splice is bounded.
- Two proposal shapes for one destination. `feedback report` and any future
  diffing of approved plans need to know a `plan` proposal may be partial.

Decision needed before building: whether section-only applies to first cuts as
well as re-cuts (consistent, but the first cut loses the in-context review of
Approach next to Phases), and whether scoping's carried Phases section stays.

### `planet epic show --brief`

The router reads the epic view after every step; it is 5 to 9KB with PR URLs
and retro paths. A brief form (id, slug, status, kind per phase, plus
`last_approved_step` and `paths.dir`) would be under 1KB. Small saving, hot
path, one flag.

### Haiku for the intake codebase brief

`references/research-brief.md` asks four factual questions answered with paths
and `git log -S`. Try haiku on the next new epic and compare `codebase.md`
against the sonnet ones (600 to 780 words today). Keep sonnet for the phase
sweep, which asks for signatures and contradictions.

### Zero `skill` tags

Feedback-review's recurrence rule keys on `skill` rejections and `apply`
lessons; only lessons feed it today. Read the 36 rejection texts once to decide
whether the model under-tags or the rejections are plan-local. The nine
`wrong-assumption` and eight `style` tags look skill-shaped.

### Implement commits to a subagent

Not recommended. The implement spec keeps the session model so context stays
with the user; the 147 implementation prompts are the retro's strongest
signal and would move out of the conversation. A middle path exists for
commits with no `Test first` (moves, renames), returning a sha, but it splits
one branch across two actors for modest savings.

### Specs are historical

The design spec still names `skills/planet/`, omits the `skill` tag, says
`steer` (renamed `apply`), and has retro proposing edits to later phases. The
README is current. A one-line "superseded by" header per spec would stop a
future reader trusting them. Not done; low value until someone is misled.

### Minor, unchanged

- `unlinkPr` does not recompute the epic status; `linkPrs` does.
- `planet check` skips retros, `events.jsonl`, and `reviews/`.
- Feedback-review step 5 runs `git checkout main` with no dirty-tree check.
- Scoping's `back to intake: no plan.md` and phase-plan's `nothing to plan`
  return lines have no router row.
- `hooks.json` registers `PostToolUseFailure` and `PermissionDenied` for
  ExitPlanMode; the 2026-09-03 probe found they never fire.
- Session markers from ended sessions linger when SessionEnd does not fire.
- Proposal bodies pass through three times per gate: the plan file, the
  ExitPlanMode argument, and the approval echo. Not fixable from the plugin.
