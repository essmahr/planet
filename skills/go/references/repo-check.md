# Repo check

Step 6. Phases of one epic can land in different repos, so the check depends on
the step.

1. Run `gh repo view --json nameWithOwner -q .nameWithOwner`.
2. Intake and scoping: it must be one of `epic.epic.repos`. Phase-plan, retro,
   implement, and pr feedback: it must equal phase N's `repo` in `phases`.
3. Match: run `planet repo seen`, so later lookups find this checkout, and go on.
4. Mismatch: run `planet repo path <wanted repo>`. Say
   `this directory is <a>; run /planet:go from <b>`, adding the path it printed,
   if any. Stop.
