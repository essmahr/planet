# Phases section format

Appended to plan.md as `## Phases`. One entry per phase, in order. After
approval, the `planet phase new` calls mirror these entries exactly.

```
## Phases

### 1. <Title> (<slug>)
<one paragraph of scope: what changes and what is left alone>
- Depends on: none | phase N
- Size: about <files> files, <commits> commits | not applicable because <why>
- Closes: <Linear ID> | none

### 2. <Title> (<slug>), manual
<what done means for this phase>
- Depends on: phase 1
- Size: not applicable
- Closes: none
```

Slugs are kebab-case and unique within the epic. "manual" after the slug marks
a phase with no PR.
