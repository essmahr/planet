# Question sets by shape of work

Examples to borrow from, one question per message. Skip anything the ticket or
plan.md already answers.

## Feature
- Who sees this first, and behind which flag?
- Is there a design? Where, and is it final?
- What does rollout look like: internal, beta, everyone?
- What metric or signal says it worked?
- What is deliberately not in the first version?

## Migration or refactor
- What must keep working unchanged while this lands?
- Is there a hard cutover, or do old and new coexist for a while?
- Who else is changing the same code right now?
- What tells us it is done: a grep that returns nothing, a deleted module, a metric?

## Escalation
- What is the user-visible symptom, and how often?
- Is a fix needed before the cause is understood?
- What is the minimum change that stops the bleeding, and what is the proper fix?

## Decomposing a PRD into tickets
- Which team owns which part?
- What is the first ticket that proves the shape of the whole?
- What is out of the PRD's first release?

## Anything else
- What does done look like?
- What would make you reject the result?
- What is out?
