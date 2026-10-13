---
name: planet-implement
description: Only invoked by the Planet router, never on its own. Implements one planned phase of a Planet epic in the current session, working the phase document's Commits in order with their checks, running Verification, and opening the PR that the hook links to the phase. Do not use outside a Planet session.
user-invocable: false
allowed-tools: Bash(planet *), Bash(git *), Bash(gh pr create *), Bash(gh pr view *)
compatibility: Claude Code with the planet plugin loaded. gh authenticated. Linear MCP connected when the phase closes a ticket.
metadata:
  version: 0.3.0
---

# Planet: implement

Input from the router: `epic: <slug>`, `dir: <path>`, `phase: <N>`. Precondition: the phase is `planned`, or `in-progress` when resuming. Output: a PR on its own branch, linked to the phase by the hook, and the return line. Three rules below are borrowed; `references/borrowed.md` says from where.

## Critical rules

- The phase document is the plan. Work Commits in order; never reorder, merge, or add one. A deviation that keeps a commit's intent (a name, a signature) is fine; note it for the PR body. A commit whose intent cannot be met stops the work (Blockers).
- A commit with `Test first` starts with that test: write or adjust it, run it, see it fail, then implement. Moves, renames, and refactors have none.
- Run each commit's Check after making it, and every Verification step before the PR; read the output. Nothing is done until the output says so.
- Store writes only through `planet`. Never edit `plan.md` or the phase file; re-planning goes through the router.
- Never commit to the default branch.
- When a commit removes or moves code, grep the files it touches for comments that describe that code and fix or remove them in the same commit.
- Prose a commit adds to docs or rules, and the PR body, follow the repo's writing rules the first time: short sentences, no hedging, no narration of the work.

## Steps

1. **Start.** Run `planet session start <slug> --phase <N> --step implement`. `planet epic show <slug> --json` gives the phase's path, status, and kind. Read the phase file and `plan.md`'s Constraints. Nothing else from the store.
2. **Review.** Compare each commit's Files and Change with the code. A mismatch, or two commits that conflict, stops here per Blockers before anything changes.
3. **Branch.** When Closes names a Linear ID, take `branchName` from the Linear MCP `get_issue` result; otherwise, or when the result has none, ask once for a branch name. From the up-to-date default branch: `git checkout -b <name>`, then run the repo's setup (install, codegen) before any Check. Resuming: when the branch exists, check it out; its commits (`git log --format=%s <default>..HEAD`) must be a prefix of the Commits subjects, else stop per Blockers; skip to the first subject missing.
4. **Implement.** For each commit: Test first when present, then the Change, then the Check, then `git add` the Files and `git commit -m "<subject>"` (the heading without its number). One commit per section. Keep a list of deviations.
5. **Verify.** Run every Verification step, set up per `references/verification.md`; a step you cannot perform blocks. A failure whose fix belongs to a commit already made gets a fix-up commit naming that commit; anything else stops per Blockers.
6. **PR.** `git push -u origin <branch>`, then `gh pr create --title "<phase title>" --body-file <a file in the scratch directory>`. Write the body from what happened: a summary from Context and Decisions, the commits, deviations with reasons, and what Verification asked for. Follow the repo's PR template and the user's PR conventions when they exist. The hook links the PR to the phase.
7. **Record and return.** `planet phase event <slug> <N> implemented --sha $(git rev-parse HEAD)` once per PR, then return `phase <N> implemented, <PR url>`.

## Blockers

Stop and say which commit, what the code shows instead, and what would unblock it. Leave the branch and its commits in place. Run `planet phase event <slug> <N> blocked "<why>"` (single quotes if the why contains a double quote). Return `phase <N> blocked at commit <k>: <why>`.

## Troubleshooting

- The phase is `draft`: it has no plan; return `phase <N> not planned`.
- The phase is `manual`: nothing to implement; return `phase <N> manual`.
- `planet session start` reports no epic or no session id: return its message.
- `planet epic show` lists no PR on the phase after it opened: the hook missed it; run `planet link <slug> <N> <url>`.
- `gh pr create` fails: report the error and the pushed branch, then `planet link` once the PR exists.
- A Check is an observation, not a command: perform it and say what you saw.
- The default branch moved, or a stacked branch's base landed: rebase onto the default branch while the PR is a draft with no reviews; after an approval or review comments, merge it in instead, since a rebase needs a force-push. A rebase before the author's changes re-records `implemented` at the new tip; never after. Rerun Verification.
