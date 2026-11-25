# Next phase

Step 5, for a request for the next phase: `next phase`, `plan the next phase`,
`plan and implement the next phase`. Phases of one epic can land in different
repos, and the user means the next phase this checkout can run.

1. The rows before the phase rows (intake, scoping, phasing) apply as usual.
2. Run `gh repo view --json nameWithOwner -q .nameWithOwner`, then
   `planet phase ready <epic> --repo <it> --json`. Phases in other repos are
   skipped, not a repo-check mismatch.
3. Apply step 5's phase rows to this repo: any phase `shipped` whose `repo`
   equals it, retro, lowest id first; else the first `plannable`, phase-plan;
   else implement the first `ready`, or the lowest `planned` there, per step 8.
4. No phase in this repo fits: say `no phase left in <repo>`, name the phase step 5
   would pick across all repos, and follow mismatch in
   `references/repo-check.md` for it. Stop.
5. Say `the next possible phase for this session is N (<slug>)`, then ask with
   AskUserQuestion: `Phase N (<slug>)`, `Pick another`. Pick another: list the
   epic's phases with status and repo, ask which, and take the step step 5's
   phase rows give it.
6. Go on to step 6. The filter holds for the rest of the run; ask again only
   when step 5 picks a different phase.
