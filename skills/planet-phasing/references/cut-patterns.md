# Cut patterns

Examples to borrow from. Cut by the principles in SKILL.md; match nothing here
mechanically.

## Expand-contract, for a wide migration
1. Add the new form beside the old; nothing uses it yet.
2. Migrate callers in batches under budget, each batch one PR.
3. Remove the old form.
4. Protect the new location: lint rule, barrel, or package boundary.

## Tracer bullet then widen, for a feature
1. A thin end-to-end slice behind a feature flag: one path through every layer.
2. Widen by user-visible capability, one per phase, all behind the flag.
3. Design review before the UI phases it gates: manual.
4. Rollout: internal, then beta, then everyone: manual.
5. Remove the flag.

## Spike then build, when the approach is uncertain
1. A throwaway spike that answers the question: manual, with the answer written to research/.
2. The real phases, cut once the answer is known.

## Diagnose, fix, harden, for an escalation
1. Reproduce and find the cause: manual, findings to research/.
2. The smallest fix that stops the symptom.
3. The proper fix, or the guard that prevents recurrence.

## Decompose a PRD into tickets
Each phase is one ticket to write, ordered as the work would be built; the
first proves the shape of the whole. The epic's output is the ticket set, so
every phase is manual and "done" is the ticket existing in Linear.
