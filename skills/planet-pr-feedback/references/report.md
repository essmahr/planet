# Report

## Format

```
**Phase 12 PR #123: 2 drafts, 1 take**

**Drafts** (not pushed)
- `foo rename`: alice, src/foo.ts:42 "rename to fooBar": rename foo to fooBar (src/foo.ts, src/bar.ts)
- `unused import`: alice, src/foo.ts:80 "drop the unused import": shares the commit above

**Takes**
- `hook question`: bob, review "should this be a hook?"
  <2-3 sentences>. Recommendation: <do / do not>.

**Not drafted**
- `async question`: alice, src/foo.ts:10 "why is this async?": a question, no change to draft. Thumbs up removed.

**Failing checks:** lint, typecheck (not acted on)

Reply `push`, `push except <name>`, `drop <name>`, or say what to change. Diffs: <patch file path>
```

- Each author and location is a markdown link to the comment url.
- Quotes are cut to about 60 characters.
- Names are two or three words from the comment, unique in the report.
- Drafts from earlier wakes that are still unpushed are listed first.
- A 👍 whose change is already on the branch goes under Not drafted, with "already on the branch, marked 🚀".
- Empty sections are omitted.

## Patch file

`<dir>/research/pr-feedback-<N>.md`, rewritten on every report: the report,
then per PR a `## <PR url>` heading, then per unpushed commit its sha, its
subject, and `git -C <worktree> format-patch -1 --stdout <sha>` in a fenced
block.

## Replies

After any change, rewrite the patch file and show the report again.

- `push`: `git -C <worktree> push origin HEAD:<head_ref>`.
- `push except <name>`: keep the named drafts unpushed on top. Note `HEAD` and
  the draft shas, run `git -C <worktree> reset --hard origin/<head_ref>`,
  then `git -C <worktree> cherry-pick` the drafts to push, in order, then the
  kept ones. Push with `git -C <worktree> push origin HEAD~<k>:<head_ref>`,
  where k is the number of kept commits. A shared commit stays whole; say so. On a cherry-pick conflict, run
  `git -C <worktree> cherry-pick --abort` and `git -C <worktree> reset --hard <old HEAD>`,
  say the drafts depend on each other. Push nothing.
- `drop <name>`: remove the commit per `references/worktree.md` (Drafts), then
  `planet pr react <id> --remove thumbs_up`. Run `planet pr signals` again and
  redraft any other signal that commit had.
- Free text naming a draft: revise it per `references/worktree.md` (Drafts).
- "Do it" after a take: `planet pr react <id> --add thumbs_up`, then draft it
  like any open 👍.
- A request to fix a failing check: stage with `git -C <worktree> add -A` and
  commit with no trailer. Name it after the check.
- An unclear reply: ask, and apply nothing.

A push rejected because the branch moved: set up the worktree again per
`references/worktree.md`, rewrite the patch file, and say the drafts were
rebased. Push only on a new `push`.
