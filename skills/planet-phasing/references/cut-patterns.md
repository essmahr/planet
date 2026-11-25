# Cut patterns

Examples to borrow from, by plan.md's `Shape:` line. Cut by the principles in
SKILL.md; match nothing here mechanically. Each bullet is a phase; blockers are
named where one phase needs another's result.

## Expand-contract, for a `migration`
- Add the new form beside the old; nothing uses it yet.
- Migrate callers in batches under budget, each batch one PR, each file in
  one batch only. Each batch is blocked by the new form, not by other batches.
- Remove the old form, blocked by every batch.
- Protect the new location: lint rule, barrel, or package boundary, blocked by
  the removal.

## Consumer by consumer, for a `refactor`
- The harness, type, or adapter the new shape needs, with nothing on it yet.
- One consumer per phase, each blocked by the harness; the old path stays
  intact for the rest. Leaf consumers first when one consumer needs another.
- Remove the old path, blocked by every consumer phase, with the orphan sweep.

## Tracer bullet then widen, for a `feature`
- A thin end-to-end slice behind a feature flag: one path through every layer.
- Widen by user-visible capability, one per phase, all behind the flag, each
  blocked by the slice.
- Rollout by flag: internal, then beta, then everyone: manual, blocked by the
  capabilities that ship in it.
- Remove the flag, blocked by the rollout.

## Spike then build, for any shape when the approach is uncertain
- A throwaway spike that answers the question: manual, with the answer written
  to research/.
- The real phases, cut once the answer is known, blocked by the spike.
