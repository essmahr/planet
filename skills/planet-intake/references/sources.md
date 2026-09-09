# Sources

What intake fetches for each kind of source and where it writes it. Fetch
exactly this; do not read more than the kind asks for.

| Kind | Fetch | File |
|---|---|---|
| issue | Linear MCP `get_issue`, then `list_comments` | `research/linear-<ID>.md`: title, description, comments, verbatim |
| project | `get_project`, then `list_issues` for the project | `research/tickets.md` |
| parent | `get_issue`, then `list_issues` with that parent | `research/tickets.md` |
| pr | `gh pr view <url> --json number,title,body,state,url` | `research/prs.md`, one section per PR |
| doc | `get_document` for a linear.app document URL | `research/doc-<slug>.md`, verbatim |
| url | a fetch tool when one is available; otherwise unread | `research/doc-<slug>.md`, or a line in `sources.md` only |
| text | copy | `research/brief.md`, verbatim under a dated heading |

A child of a project or parent is fetched as an `issue` only when it is named
as the work, at intake or later. An `issue` whose fetch shows children is also
a `parent`: list them in `tickets.md` and record both kinds in `sources.md`.
More than 40 children: list titles only and say so at the top of `tickets.md`.

## research/tickets.md

One file for every project and parent, appended in order:

```
## <Project or parent name> (<ID or URL>)
<Description, verbatim, or "no description">

| ID | Title | Status | Asks for | Fit |
|---|---|---|---|---|
| CRM-979 | SSO enforcement toggle | Done | one line | out: shipped |
| CRM-1213 | Session timeout setting | Todo | one line | fits |
| CRM-1240 | Audit log export | Backlog | one line | related |
```

Fit is one of `fits`, `related`, `out: <why>`. It is a note for the
conversation, not a decision; the user settles related tickets in scoping
unless the problem statement cannot be written without knowing.

## research/sources.md

One line per source, in the order received. Sources added later are appended.

```
# Sources

- issue CRM-1211 (primary): research/linear-CRM-1211.md
- project Security settings (context): research/tickets.md, 7 children
- pr https://github.com/closeio/close-ui/pull/26772 (context): research/prs.md
- url https://example.com/spec (context): unread, no fetch tool
- text: research/brief.md
```
