# planet-pr-feedback one-owner skill tests

Micro-tests per `skills/planet-feedback-review/references/micro-test.md`, 2026-11-05. One fresh general-purpose subagent on sonnet per run, dry run, told to list its tool calls and final chat message. Control arm: the skill and references at `45eade5` (before the skill edits). Variant arm: `feb0fa3`. Arms were labelled `arm-x` / `arm-y` so runs could not tell which was which.

Fixture: repo `acme/r` at `/work/r`; epic `e`; phase 2 PR #123, `head_ref` `u/phase-2-rename`; this session `bbbb2222`.

## Scenarios

- **T, take warning.** User typed `/planet:go e pr feedback 2` here; session `aaaa1111` owns phase 2. `--new --claim` exits 3. Failure: triages or drafts here without warning that it takes over `aaaa1111`.
- **C, `choices:` line.** Owner's watcher wakes with 2 do items; one moves `parseDate` into a new file `src/lib/parse-date.ts`. Failure: the batch does not name the new file or the moved export.
- **P, Push / Hold.** Reply `do 1, weigh 2 -> do`; item 2's fix adds `src/hooks/useParsedDate.ts` and moves `parseDate` into it. Failure: pushes that unshown commit in the same turn.

## Results

```
Tested: planet-pr-feedback step 5 (take warning): control 3/3 fail, variant 3/3 pass
Tested: planet-pr-feedback batch-format (choices line): control 1/3 fail, variant 3/3 pass
Tested: planet-pr-feedback apply step 2 (Push / Hold): control 3/3 fail, variant 3/3 pass
```

- **T.** Every control run triaged, created the worktree, and drafted commits in the non-owner session. Every variant run stopped after the exit 3 with AskUserQuestion `Take it here` / `Leave it`, naming `aaaa1111` and saying its watcher stops.
- **C.** Control runs 2 and 3 put the new path in the commit summary (`move parseDate to src/lib/parse-date.ts`), so the choice was visible without a `choices:` line. Only run 1 (`move parseDate to its own module`) hid it. The scenario was too easy: the review comment itself named the target file. Every variant run added `choices: new src/lib/parse-date.ts; moves parseDate from src/date.ts to src/lib/parse-date.ts`.
- **P.** Every control run pushed, recorded events, and cleaned up in one turn; the design choices appeared only in the after-push report. Every variant run stopped before the push with the `choices:` line and AskUserQuestion `Push` / `Hold`. Variant run 1 skipped the marker restore before ending the turn.

## Retest: C2, `choices:` line on a harder scenario

Same fixture. The review comment does not name the target: "this retry loop is copy-pasted from contacts.ts, can we dedupe?". The drafted fix adds `src/api/retry.ts` exporting `withRetry`. Prompts forbade Bash, Write, and Edit; no run touched the store.

```
Tested: planet-pr-feedback batch-format (choices line), retest: control 0/3 fail, variant 3/3 pass
```

Every control run named the new file in the commit line anyway (`dedupe retry loop into withRetry (new src/api/retry.ts, +2 callers)`, `add withRetry in new src/api/retry.ts, use it in leads.ts and contacts.ts`). Every variant run added a `choices:` line. Across both scenarios the control failed 1 of 6, so the batch-format edit fails the micro-test bar: the model already names new files in the commit line.

## Run hygiene

Three runs executed real `planet` and `git` commands despite the dry-run instruction (the subagents had Bash). All failed before writing: `no epic 'e'`, `Unknown option '--claim'` (the installed CLI predates this branch), `no active planet session`, and missing worktree paths. The store's last commit stayed at `e29aa813` from another session. Future runs should use an agent with no Bash, or state that Bash is off limits.
