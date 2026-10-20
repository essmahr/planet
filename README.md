# Planet

Personal planning workflow for epics that span several PRs. A Claude Code
plugin: skills for planning, a CLI that owns all state under `~/.planet`, and
hooks that capture proposals, feedback, and PR links.

## Requirements

Node 24, `gh` authenticated, git.

## Use

    /planet:go                      status table of active epics
    /planet:go continue the gql epic
    /planet:go CRM-123              start an epic from a ticket

The router opens an epic and runs the next planning step: intake, scoping,
phasing, then phase-plan for each phase. After a phase is planned it offers to
implement it in the session, plan the next phase, or stop. Implement works the
phase document commit by commit, with a check after each, then opens the PR
that Planet links to the phase. When a phase ships, retro runs before the next phase plan and records weighed lessons; `/planet:go review feedback` from the plugin repo turns recurring lessons and skill-tagged rejections into approved edits to the skills. Planning documents are approved through native plan mode; the hooks
record what was proposed, approved, and rejected. An epic can start
from any mix of Linear issues, projects, PRs, documents, URLs, or plain text;
the research directory holds one file per source, with `sources.md` as the
index.

`/planet:plan <request>` writes a one-off plan for a single PR with the same
drafting rules and template as phase-plan, approved in plan mode. It has no
epic, writes nothing to the store, and stops at approval.

Plan mode without `/planet:go` is untouched: nothing is recorded unless a
session was opened with the router.

## Develop

    claude --plugin-dir /path/to/planet

Run `/reload-plugins` after editing. `bin/` is on the Bash tool's PATH while
the plugin is loaded, so skills call `planet ...` directly. For terminal use,
add `bin/` to your own PATH.

    npm test
    npm run typecheck

Design: `docs/superpowers/specs/2026-09-03-planet-design.md`.
