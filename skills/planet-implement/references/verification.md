# Verification setup

Prepare each Verification step yourself; never wait for the user. Before a step runs, put the app in the state it needs: after any branch switch, dependencies installed, generated code current, dev servers restarted, and stale browser pages closed; then whatever configuration, services, or data the step depends on. A running container can predate the image it should run: compare its creation time with the image's, and recreate it when the image is newer.

Browser steps run in Playwright's bundled Chromium, never the built-in browser pane, Claude in Chrome, or the system browser. For a step the user signs in to by hand (OAuth, MCP Inspector), launch that Chromium headed with `--remote-debugging-port` and drive it over CDP with `chromium.connectOverCDP`. Start a tool that opens a browser on its own with that turned off, such as `MCP_AUTO_OPEN_ENABLED=false` for MCP Inspector, and open its URL in the Chromium instead.

When the phase changes something a user sees, screenshots come in before/after pairs of the same state: "before" from a worktree on the default branch, "after" from the phase branch. Attach both when opening the PR with `gh pr create --attach '<file>#<alt>'`, and show each pair in the body as one row of a two-column Before and After table.

A step you cannot perform blocks the phase; never record `implemented` with a step skipped.
