# Apply a shorthand reply

Read at step 7. `<path>` is the worktree from `references/worktree.md`;
shas and patches come from the triage file.

## 1. Rebuild the drafts

The push sends everything above `origin/<head_ref>`, so the worktree must hold
only commits for items the reply put in do. Unpushed drafts may be rewritten.

1. Recreate the worktree per `references/worktree.md` if it is gone. Then
   `git -C <path> fetch origin <head_ref>` and
   `git -C <path> reset --hard origin/<head_ref>`.
2. For each drafted commit, in triage file order:
   - Every item in it is do, unedited: `git -C <path> cherry-pick <sha>`. When
     the sha is gone or the pick conflicts, `git cherry-pick --abort` and
     redraft it.
   - Any item in it is not do (skipped, refuted, deferred, unnamed): redraft
     it with only its do items, or drop it.
3. Draft new commits for items moved to do, for `merge into` (fold the fix
   into the target's commit), and for free-text edits.
4. `git -C <path> log --oneline origin/<head_ref>..HEAD` must list only these
   commits. Anything else: stop and fix before pushing.

## 2. Push

A commit drafted this turn that needs a `choices:` line
(`references/batch-format.md`) was never shown: list each with that line and
ask with AskUserQuestion: `Push`, `Hold`. Hold pushes nothing and keeps the
batch open.

`git -C <path> push origin HEAD:<head_ref>`, when step 1 left a commit. A
rejected push means the branch moved: repeat step 1, push again. Never force.

## 3. Replies

Refute and defer items only, with the edited text when given. Write each body
to `<dir>/research/pr-feedback-<N>-reply-<number>.md`, then:

- `comment` item: `gh api repos/<owner>/<repo>/pulls/<pr>/comments/<id>/replies -F body=@<file>`,
  `<id>` being the number after `discussion_r` in its url.
- `review` or `conversation` item: `gh pr comment <pr> --body-file <file>`.
- `check`, do, skip, or unnamed: none.

## 4. Record

1. Per pushed commit: `planet phase event <slug> <N> feedback-commit '<space-separated item ids>' --sha <sha>`.
2. One `planet phase event <slug> <N> triage '<json array>'`, an entry per
   item the reply named:

   ```
   {"id":"PRR_k3","proposed":"weigh","final":"do","edited":false,"merged_into":null,"defer_to":null}
   ```

   - `id` and `merged_into` are item ids, never batch numbers.
   - Every key is present; absent values are `null`.
   - `final` is do, weigh, refute, defer, or skip. An item merged into
     another's commit is `final: "do"` with `merged_into` set to that item's id.
   - `defer_to` is `"phase <M>"` or `"follow-up"` for a defer, else `null`.
   - `edited` is true when the reply changed the drafted commit or reply.
3. `planet pr feedback mark <slug> <N> handled <ids>` for every item the reply
   named. Unnamed items stay notified.

## 5. Clean up and report

Fast-forward and remove per `references/worktree.md` (After the push). Report
one line per pushed commit and per posted reply.
