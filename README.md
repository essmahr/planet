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

The router opens an epic and runs the next planning step. Intake is the only
step built so far; scoping, phasing, phase-plan, and retro follow. Planning
documents are approved through native plan mode; the hooks record what was
proposed, approved, edited, and rejected.

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
