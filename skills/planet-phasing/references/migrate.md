# Migrate

The `reason: migrate` path: a one-time pass that moves an epic's legacy
`## Phases` section in `plan.md` into milestones and blockers in the store.

## Draft

- `## Milestones` by the milestone rule in SKILL.md, or the heading alone when
  there are none.
- `## Phases`, one bullet per phase, shipped included:
  `- <id> <slug>: milestone <n|none>, blocked by <ids>`, taken from the entry's
  `Depends on` line.

Approval removes the legacy section from `plan.md`. So before proposing, save
each draft's legacy entry to its own scratch file, with `Depends on` renamed
`Blocked by`, plus a `Milestone:` line when there are milestones. These files
become the draft bodies.

Propose with `to: milestones`, passing no `changes:`.

## Apply

Chain with `&&` in one Bash command, in this order:

- `planet milestone new <epic> <slug> --title "<title>" --proposal latest` per
  milestone.
- `planet phase move <epic> <id> --milestone <n>` per phase with a milestone,
  shipped included.
- `planet phase block <epic> <id> --by <ids> --proposal latest` per unshipped
  phase with blockers. Shipped phases keep an empty list; readiness ignores
  them.
- `planet phase write <epic> <id> --body-file <path>` per draft, from the saved
  scratch files.

Then verify and return as SKILL.md says.

## Troubleshooting

- `planet phase block` refuses a shipped phase: shipped phases keep their
  blockers. Skip it.
- The chain stops partway: fix the failing call and rerun from there.
  Never recreate a phase that exists.
