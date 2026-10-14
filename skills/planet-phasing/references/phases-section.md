# Phases section format

The `## Phases` section of plan.md, always its last section; approving
`--to phases` replaces it in place. One entry per phase, in order. After
approval, the `planet phase new` calls mirror these entries exactly.

```
## Phases

### 1. <Title> (<slug>)
<one paragraph of scope: what changes and what is left alone>
- Depends on: none | phase N
- Size: small | medium | large, or about <files> files; phase-plan counts exactly | not applicable because <why>
- Closes: <Linear ID> | none

### 2. <Title> (<slug>), manual
<what done means for this phase>
- Depends on: phase 1
- Size: not applicable
- Closes: none
```

Slugs are kebab-case and unique within the epic. "manual" after the slug marks
a phase with no PR.
