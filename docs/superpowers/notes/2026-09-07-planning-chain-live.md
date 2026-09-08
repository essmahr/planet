# Planning chain live verification

Branch `planning-chain`, plan `docs/superpowers/plans/2026-09-07-planet-planning-chain.md`, Task 9. Run from the close-ui repo in a fresh `claude --plugin-dir` session against the epic `move-icons-into-design-system`.

## Results

Run on 2026-09-07 (UTC evening) over three sessions.

1. Scoping: shape question, questions one at a time, an approaches message, plan mode with v2. One rejection (tagged scope-add), then approval. `plan.md` has Goal through Constraints, no Open questions. Passed.
2. Phasing: the router continued without a second `/planet:go`, Phases section gated and approved, one chained Bash command created eight phases in order with kinds, `last_approved_step` phasing. Passed. The first cut included a manual "announce the move" phase (see Deviations).
3. Phase-plan: for phase 1 (after the re-cut) a sweep wrote `research/phase-1.md` in about four minutes, a size line printed against the `PR budget:` line from `plan.md`, the document was gated and approved, phase 1 set planned, then the three-option question. Stop printed both resume lines and ran `planet session end`; the marker was removed. Phase 2 repeated the same path in a new session with one legitimate clarifying question (`mobile/` move or delete, which the phase entry left open). Passed.
4. `implement 1`: marker carries `phase: 1`, phase path printed, router exited. Passed, with a UX note below.
5. `scoping` override: named step won, repo check ran, the router composed a `reason:` line, scoping skipped the shape and asked which decision to revisit. Reaching the gate and typing "reject" did not abort (see Deviations); the run was interrupted, leaving proposal 10 pending.
6. Re-cut: no phase exceeded the 120-file budget (98 and 102 files), so the budget-driven re-cut was not reached. The cut was redrawn once after a phase-plan rejection, but through a bypass, not the hand-up (see Deviations).

### Fixes made on the branch

- Manual phases are engineering work without a PR; announcements and coordination are never phases (phasing skill and cut patterns).
- The gate never swaps in a different document on rejection; phasing and phase-plan return `back to scoping` or `re-cut from phase N` when the rejection says the approach or the cut is wrong; a rejection saying stop, abort, or keep the current plan returns `aborted`, which every step skill passes up and the router stops on. Gate budget raised to 350 words.
- Sweeps run on sonnet with the brief as written.
- The router's Implement exit tells the user to read the phase file and start.

Not fixed here: `phase: null` on phase-plan proposals, a `proposal reject` command to close a pending proposal after an abort, and the scoping word budget (`plan.md` came out at 1,281 words against 800).

### Deviations

- Phasing proposed "Announce the move" (post a message in the team channel) as phase 1, a manual phase. That kind of phase should not happen: a Planet phase is a unit of engineering work, and posting a message is not one. The phasing skill's manual-phase rule ("design review, rollout, investigation, tickets to write") plus the "work that produces no PR is still a phase" line invite it. Fix: manual phases are for work that changes something in the codebase or its systems without a PR (a migration run, a feature-flag flip, a data backfill), never for communication or coordination; those go in Sequencing notes or the phase's own plan, not as phases.
- The rejection of that phase ("this phase is unnecessary") did not produce a hand-up. Transcript order: rejection at 23:31:30, then at 23:32:36 the gate re-entered plan mode with the whole plan, Phases redrawn without the announce phase, still inside the `to: phase:1` gate call; after approval one Bash chain ran `session step phasing`, `proposal approve latest --to plan`, `tag latest-1 scope-cut`, dropped all eight drafts and recreated seven, then `session step phase-plan`. No `re-cut from phase 1` or `back to scoping` line was printed and neither scoping nor phasing was dispatched. End state is what a re-cut would give, but proposal 7 is recorded as `step: phase-plan` though it is a phasing document, and the router never saw the hand-up. Fix: the gate's rejection handling must not redraw a different document; when the rejection says the phase or the cut is wrong, the step skill returns the hand-up line instead of re-gating. Phase-plan: a rejection that questions the phase's existence returns `re-cut from phase N: <why>`.
- Phase-plan proposals record `phase: null` (see Follow-ups).
- Step 5 (`/planet:go move-icons scoping`) routed correctly: named step wins, repo check, `reason:` line composed by the router, scoping skipped the shape and asked which decision to revisit. But there is no way to abort at the gate. Typing "reject" at the plan-mode dialog is a rejection, and the gate's rule is amend and re-gate, so the skill kept refining. Rejection means revise, never abort; the plan's step 5 assumed otherwise. Fix: the gate treats a rejection whose message is stop, abort, or keep the current plan as an abort: it returns `aborted: <message>`, the step skill returns `<step> aborted`, the router says so and stops. The pending proposal is left for the next PreToolUse to mark rejected, or the CLI gains `proposal reject latest`.
- Step 4 (`implement 1`) worked: marker carries `phase: 1`, phase path printed, router exited. But the exit reads like a hang: the last line is the file path with no cue that the user speaks next. One closing sentence ("Read the phase file and start; `gh pr create` links the PR to phase 1") would fix it without steering context management.
- The phase sweep is slow: about four minutes for phase 1, and phase 2 (six subdirectories) ran longer. The sweep briefs name no model, so the Agent call inherits the session model, and the skill's dispatch expanded the brief with extra grep instructions. Fix: sweep briefs specify a fast model (`model: sonnet`) and the skill says to send the brief as written, filling only the slots.
- `plan.md` after scoping is 1,281 words against the template's "under 800".

## Follow-ups from the final review

Deferred to follow-on 4, not blockers for the planning chain:

- Phase-plan proposals record `phase: null`. The router runs `planet session step phase-plan` without a phase, so the capture hook has no phase to record. Retro and feedback-review cannot tie those proposals to a phase until the router passes the id.
- `last_approved_step` is null when the highest approved proposal has an unknown step, even if an earlier approved `scoping` exists. Falling back to the highest known step would avoid a redundant scoping pass.
- Two Troubleshooting return lines, `back to intake: no plan.md` and `nothing to plan`, have only the router's catch-all row. Both are unreachable in normal flow.
- Chained `planet ... && planet ...` under `allowed-tools: Bash(planet *)`: watch whether phasing's create step prompts for permission.
- `back to scoping` was reviewed as text only. Exercise it deliberately if a phase-plan question shows the approach was wrong.
