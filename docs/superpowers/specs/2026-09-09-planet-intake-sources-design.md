# Planet intake sources: design

Follow-on to `2026-09-07-planet-skills-design.md` (router, gate, intake) and
`2026-09-07-planet-planning-chain-design.md` (scoping, phasing, phase-plan).
Changes the router's new-epic step, the intake skill, and one sentence of
scoping. No store, CLI, or hook changes.

## Problem

Intake is written for one Linear ticket. Real epics start from several
things at once: a ticket plus a Linear project shared as background, a parent
issue with children, a design doc, PRs, or plain text with no ticket. Two of
the first three real epics had the model improvise this: it fetched a
project, a second ticket, an SSO doc, and desktop notes into `research/` with
no skill text describing what to fetch, where to write it, or how to refer to
it from `plan.md`. In one run the model refused a per-ticket review because
the template forbids extra sections, without offering the research-file route
the design intends.

## Decisions

| Question | Decision |
|---|---|
| Where the source list lives | `research/sources.md`, written by intake. `epic.linear` keeps meaning "tickets this epic closes". No schema change. |
| Project or parent issue | Shallow: children listed in `research/tickets.md` with a fit note each. A child is fetched in full only when it becomes primary. |
| Who decides which related tickets are in | Nobody by rule. A ticket named as the work is in. Related tickets are settled in the ordinary conversation, at intake only if it blocks the problem statement, otherwise in scoping. No keep-or-drop question. |
| Source roles | Inferred from phrasing: primary (named as the work) or context ("related to", "see also", "for background"). Never asked. |
| Non-Linear URLs | Fetched when a fetch tool is available, else recorded in `sources.md` as unread. |

## Sources

Six kinds, each with a fixed fetch and a fixed file:

| Kind | How recognized | Fetch | File |
|---|---|---|---|
| Linear issue | `ABC-123` or a linear.app issue URL | `get_issue`, then `list_comments` | `research/linear-<ID>.md`, verbatim title, description, comments |
| Linear project | linear.app project URL, or "project" plus a name | `get_project`, then `list_issues` for the project | `research/tickets.md` |
| Parent issue | an issue whose children are non-empty, or "and its sub-issues" | `list_issues` with the parent | `research/tickets.md` |
| PR | github.com pull URL | `gh pr view --json number,title,body,state,url` | `research/prs.md`, one section per PR |
| Document | linear.app document URL, or any other URL | `get_document`; other URLs with a fetch tool if one is available | `research/doc-<slug>.md`; unread URLs get a line in `sources.md` only |
| Text or local file | request prose, pasted text, or a path | copy | `research/brief.md` |

`research/tickets.md` holds one line per child ticket: ID, title, status, one
line of what it asks for, and a fit note (fits, related, out). Project or
parent metadata (name, description) goes at the top of the same file.

`research/sources.md` holds one line per source: kind, role, the file it was
written to, and for unread URLs the reason. Context in `plan.md` links this
file with one line instead of listing sources itself, so v1 stays under budget
with many sources. When there is exactly one source, Context may name it
directly and `sources.md` is still written.

Sources arriving after epic creation ("also look at project X", mid-intake or
mid-scoping) are handled the same way by whichever step is running: fetch,
write the file, append to `sources.md`, and add or amend one Context line
through the next gate.

## Router changes (`skills/go/SKILL.md`)

- Step 3: the request may carry any number of Linear IDs, URLs, and prose.
  Resolution runs `planet open` on the whole text as today.
- Step 4: the title comes from the first Linear issue named as the work, else
  from the request. `--linear` gets every Linear issue ID named as the work;
  projects, parents, URLs, and prose are not IDs and are not passed. The
  confirmation line keeps its shape; `from <ID>` lists the IDs or is dropped.
- Step 7: the intake dispatch passes `sources: <one per line: kind, ref, role>`
  in place of `prior art: ...`. With nothing but the request text, the line is
  `sources: text` and the text follows.

## Intake changes (`skills/planet-intake/SKILL.md`)

- Input line `prior art:` becomes `sources:`.
- Step 2 (Linear) and step 3 (GitHub) merge into **Sources**: for each source
  in the router's list, do the fetch and write the file from the table above,
  then write `research/sources.md`. The one `gh pr list` search keeps its
  current trigger and limit.
- Step 4 (Codebase): the research brief's slots change from ticket summary
  and prior art to a summary of the primary sources and the paths of the
  research files written so far.
- Step 5 (Clarify): unchanged rule. Which related tickets the epic takes on
  is a clarifying question only when the problem statement cannot be stated
  without it; otherwise it goes under Open questions for scoping.
- Template: Context gains `- Sources: research/sources.md, <N> sources`; the
  Tickets and Prior art lines stay for the single-source case. Non-goals may
  name tickets the user said are out.
- Troubleshooting: a project with more than 40 children is listed by title
  only, with a note; `get_project` or `get_document` unavailable is recorded
  in `sources.md` as unread and intake continues.
- New reference `references/sources.md` holding the kinds table and the two
  file formats, so the skill body stays short. Budget stays 1,500 words.

## Scoping change (`skills/planet-scoping/SKILL.md`)

Step 1 reads `research/tickets.md` when it exists. Step 3 (Converse) settles
related tickets that Open questions left undecided, as part of "what is out";
Goal and Non-goals name ticket IDs. Nothing else changes; phasing already
attaches ticket IDs to phases with `--linear`.

## Testing

Harness (`test/skills.test.ts`): the new reference file exists and is named by
the intake body; budgets hold; `prior art` no longer appears in any skill body.
Live: one epic created from a Linear issue plus a project shared as "related
to", checking `sources.md`, `tickets.md`, the Context line, and that no
keep-or-drop question is asked.

## Not included

- Sources on `epic.yaml` or `planet epic new --source`.
- `planet open` matching on project names or URLs.
- A triage question or a per-ticket section in `plan.md`.
- Re-fetching sources at later steps; research files are corrected in place
  when they turn out stale.
