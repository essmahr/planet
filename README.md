# Planet

Personal planning workflow for epics that span several PRs. A Claude Code
plugin: skills for planning, a CLI that owns all state under `~/.planet`, and
hooks that capture proposals, feedback, and PR links.

## Requirements

Node 24, `gh` authenticated, git.

## Develop

    claude --plugin-dir /path/to/planet

Run `/reload-plugins` after editing. `bin/` is on the Bash tool's PATH while
the plugin is loaded, so skills call `planet ...` directly. For terminal use,
add `bin/` to your own PATH.

    npm test
    npm run typecheck

Design: `docs/superpowers/specs/2026-09-03-planet-design.md`.
