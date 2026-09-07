# Planning chain live verification

Branch `planning-chain`, plan `docs/superpowers/plans/2026-09-07-planet-planning-chain.md`, Task 9. Run from the close-ui repo in a fresh `claude --plugin-dir` session against the epic `move-icons-into-design-system`.

## Results

Pending.

## Follow-ups from the final review

Deferred to follow-on 4, not blockers for the planning chain:

- Phase-plan proposals record `phase: null`. The router runs `planet session step phase-plan` without a phase, so the capture hook has no phase to record. Retro and feedback-review cannot tie those proposals to a phase until the router passes the id.
- `last_approved_step` is null when the highest approved proposal has an unknown step, even if an earlier approved `scoping` exists. Falling back to the highest known step would avoid a redundant scoping pass.
- Two Troubleshooting return lines, `back to intake: no plan.md` and `nothing to plan`, have only the router's catch-all row. Both are unreachable in normal flow.
- Chained `planet ... && planet ...` under `allowed-tools: Bash(planet *)`: watch whether phasing's create step prompts for permission.
- `back to scoping` was reviewed as text only. Exercise it deliberately if a phase-plan question shows the approach was wrong.
