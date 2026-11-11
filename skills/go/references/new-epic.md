# New epic

Run when step 3 found no epic and the request names a Linear ID, a linear.app URL,
or asks to start something new. Ends with `planet open <slug> --json` and the
sources kept for step 7, or a stop.

Sort the request into sources: Linear IDs and issue URLs named as the work are `issue (primary)`; a project, parent, PR, document, or URL, or a ticket introduced with "related to", "see also", or "for background", is `(context)` of its kind, tokens `issue`, `project`, `parent`, `pr`, `doc`, `url`; the remaining prose is `text`. Title: the first primary issue's title via Linear MCP `get_issue`, else at most six words from the request. Slug: lowercase letters, digits, hyphens, at most 40 characters, no leading/trailing hyphen. Run `gh repo view --json nameWithOwner -q .nameWithOwner` for the primary repo; add any other repo the request names after it. Ask exactly `create epic <slug>, "<title>", repos <owner/name>[, <owner/name>], from <IDs>?`; no primary issue: drop `, from <IDs>` and `--linear`. Yes: run `planet epic new <slug> --title "<title>" --repo <owner/name> --linear <ID>`, one `--repo` per repo, primary first, one `--linear` per primary issue, then `planet open <slug> --json`. No: ask what to change, slug, title, or repos, then stop. Keep every source for step 7.
