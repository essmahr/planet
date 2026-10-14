# Question sets by shape of work

Examples to borrow from, one question per message. Skip anything the ticket or
plan.md already answers. The three shapes are the ones the store has seen; a
new one is a retro topic, not a fourth entry here.

## Feature
- Who sees this first, and behind which flag?
- Is there a design? Where, and is it final?
- What does rollout look like: internal, beta, everyone?
- What metric or signal says it worked?
- What is deliberately not in the first version?

## Migration
- What must keep working unchanged while this lands?
- Is there a hard cutover, or do old and new coexist for a while?
- Who else is changing the same code right now?
- What tells us it is done: a grep that returns nothing, a deleted module, a metric?

## Refactor
- Which consumers read the thing being reshaped, and which goes first?
- What stays byte-for-byte the same for users and tests?
- Is there a harness or type the new shape needs before any consumer moves?
- What is deleted at the end, and what proves nothing reads it?

## Any shape
- What does done look like?
- What would make you reject the result?
- What is out?
