# Cut patterns

Examples to borrow from, by plan.md's `Shape:` line. Cut by the principles in
SKILL.md; match nothing here mechanically.

## Expand-contract, for a `migration`
1. Add the new form beside the old; nothing uses it yet.
2. Migrate callers in batches under budget, each batch one PR, each file in
   one batch only.
3. Remove the old form.
4. Protect the new location: lint rule, barrel, or package boundary.

## Consumer by consumer, for a `refactor`
1. The harness, type, or adapter the new shape needs, with nothing on it yet.
2. One consumer per phase, leaf first; the old path stays intact for the rest.
3. Remove the old path once no consumer reads it, with the orphan sweep.

## Tracer bullet then widen, for a `feature`
1. A thin end-to-end slice behind a feature flag: one path through every layer.
2. Widen by user-visible capability, one per phase, all behind the flag.
3. Rollout by flag: internal, then beta, then everyone: manual.
4. Remove the flag.

## Spike then build, for any shape when the approach is uncertain
1. A throwaway spike that answers the question: manual, with the answer written to research/.
2. The real phases, cut once the answer is known.
