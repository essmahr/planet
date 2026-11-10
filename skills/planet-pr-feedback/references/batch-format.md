# Batch format

## Shown in chat

Leave out comments with nothing to review (Linear link-backs) and merge
items that restate one issue (a bot's summary and its inline comment).
Propose skip for an approval with no comment and for a thread the PR author
already answered.

Show the batch as a markdown list, never a code block. Number items from 1
and give each a short name (`faded error`); the reply may use either. Items
notified in an earlier batch and still unhandled come first, marked
`(earlier)`. Never a diff. Quotes are cut to about 60 characters.

**Phase 2 PR #123: 5 new items**

**do**
1. `foo rename`: alice, src/foo.ts:42: "rename to fooBar"
   commit A: rename foo to fooBar (+1 caller)  [drafted]
2. `unused import`: alice, src/foo.ts:80: "drop the unused import"
   commit A

**weigh**
3. `hook question`: bob, review: "should this be a hook?"
   assessment: <2-3 sentences, leaning yes/no>

**refute**
4. `prefer const`: bot, CI lint: "prefer const"
   reply: <draft>

**defer**
5. `pagination`: bob, src/bar.ts:10: "add pagination"
   to phase 3, reply: <draft>

Reply e.g. "do 1 2, weigh hook question -> do, refute 4, defer 5". Full diffs: <triage file path>

A CI item reads `ci, check <name>: failing`. A refute or defer on a CI item
shows `no reply (CI)`. Omit empty buckets. When the batch interrupted other
work, add one last line naming it and any question it was waiting on.

## Triage file

`<dir>/research/pr-feedback-<N>.md`: the batch as shown, then a table of
number, id, kind, url, proposed bucket, and commit letter, then per drafted
commit its sha, message, and `git -C <path> format-patch -1 --stdout <sha>`.
The shorthand turn maps numbers to ids from this table.

## Shorthand

Comma-separated clauses. Numbers and names are the batch's.

| Clause | Meaning |
|---|---|
| `do 1 3` | Push these items' commits. |
| `weigh 2 -> do` | Draft a commit for 2 now, then push it. Also `refute 2 -> do` and so on: any bucket moves. |
| `refute 4` | Post the drafted reply. |
| `defer 5 to phase 3` / `defer 5 to follow-up` / `defer 5` | Post the drafted reply; the target given wins over the proposed one. |
| `6 merge into 1` | Fold 6's fix into 1's commit; 6 is handled with it. |
| `skip 7` | Handled, no commit, no reply. |
| free text on an item (`1: call it fooValue`, `4 reply: ...`) | Edit that draft before it goes out; record `edited: true`. |

An item the reply does not name stays notified and unhandled. It leads the
next batch. An unclear clause or an unknown number: ask, and apply nothing.
