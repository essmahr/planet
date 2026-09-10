---
name: planet-implement
description: Only invoked by the Planet router, never on its own. Implements one planned phase of a Planet epic in the current session, working the phase document's Commits in order with their checks, running Verification, and opening the PR that the hook links to the phase. Do not use outside a Planet session.
user-invocable: false
allowed-tools: Bash(planet *), Bash(git *), Bash(gh pr create *), Bash(gh pr view *)
compatibility: Claude Code with the planet plugin loaded. gh authenticated. Linear MCP connected when the phase closes a ticket.
metadata:
  version: 0.1.0
---

# Planet: implement

Input from the router: `epic: <slug>`, `dir: <path>`, `phase: <N>`. Precondition: the phase is `planned`, or `in-progress` when resuming. Output: a PR on its own branch, linked to the phase by the hook, and the return line. Three rules below are borrowed; `references/borrowed.md` says from where.

## Critical rules

- The phase document is the plan. Work Commits in order; never reorder, merge, or add one. A small deviation that keeps a commit's intent (a name, a signature, a line the code demanded) is fine; note it for the PR body. A commit whose intent cannot be met stops the work (Blockers).
- A commit with `Test first` starts with that test: write or adjust it, run it, see it fail, then implement. Moves, renames, and refactors have none.
- After each commit run its Check and read the output. Before the PR run every Verification step and read the output. Nothing is done until the output says so.
- Store writes only through `planet`. Never edit `plan.md` or the phase file; re-planning goes through the router.
- Never commit to the default branch.

## Steps

1. **Start.** Run `planet session start <slug> --phase <N> --step implement`. Read the phase file and `plan.md`'s Constraints. Nothing else from the store.
2. **Review.** Compare each commit's Files and Change with the code as it is. A mismatch, or two commits that conflict, stops here per Blockers before anything changes.
3. **Branch.** When Closes names a Linear ID, take `branchName` from the Linear MCP `get_issue` result; otherwise, or when the result has none, ask once for a branch name. From the up-to-date default branch: `git checkout -b <name>`. Resuming: when the branch exists, check it out; its commits (`git log --format=%s <default>..HEAD`) must be a prefix of the Commits subjects, else stop per Blockers; skip to the first subject missing.
4. **Implement.** For each commit: Test first when present, then the Change, then the Check, then `git add` the Files and `git commit -m "<subject>"` (the heading without its number). One commit per section. Keep a list of deviations.
5. **Verify.** Run every Verification step. A failure whose fix belongs to a commit already made gets a fix-up commit naming that commit; anything else stops per Blockers.
6. **PR.** `git push -u origin <branch>`, then `gh pr create --title "<phase title>" --body-file <a file in the scratch directory>`. Write the body now, from what happened: a summary from Context and Decisions, the commit list, each deviation with its reason, and what Verification asked the body to carry. Follow the repo's PR template and the user's PR conventions when they exist. The hook links the PR to the phase.
7. **Return** `phase <N> implemented, <PR url>`.

## Blockers

Stop and say which commit, what the code shows instead, and what would unblock it. Leave the branch and its commits in place. Return `phase <N> blocked at commit <k>: <why>`.

## Example

Phase 3, `move-subdirs`, Closes none. Review finds every Files list matches the tree. No Linear ID, so ask for a branch name; the user gives `icons/move-subdirs`. Commit 1 is a move: no Test first; `git mv` the directories, Check `pnpm typecheck` passes, commit. Commit 2 rewrites imports: Test first names `Icon.test.tsx > resolves logos from the new path`; run it, it fails on the old path; rewrite; Check passes; commit. Verification's grep for the old path returns nothing. Push, `gh pr create`, return `phase 3 implemented, https://github.com/o/r/pull/123`.

## Troubleshooting

- The phase is `draft`: it has no plan; return `phase <N> not planned`.
- `planet session start` reports no epic or no session id: return its message.
- The PR is open but `planet epic show <slug> --json` shows no PR on the phase: run `planet link <slug> <N> <url>` and say the hook missed it.
- `gh pr create` fails: the branch is pushed; report the error and the branch name so the user can open the PR, then `planet link` as above.
- A Check is an observation, not a command: perform it and say what you saw.
- The default branch moved under you: `git rebase` onto it before pushing, rerun Verification.
