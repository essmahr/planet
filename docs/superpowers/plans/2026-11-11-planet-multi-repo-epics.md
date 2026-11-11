# Planet: epics that span repos

**Status:** implemented 2026-11-11 on `multi-repo-epics`. Live check not run yet.

**Goal:** One epic holds phases in several repos, such as the MCP apps work in `closeio/close-ui` and `closeio/closeio`.

## Today

- `Epic.repo` is one `owner/name` (`cli/schema/types.ts`).
- `linkPrs` refuses a PR outside `epic.repo` (`cli/lib/link.ts:22`), so the capture hook can't link a closeio PR.
- Router step 6 stops unless the current repo equals `epic.repo` (`skills/go/SKILL.md:40`).
- Research and sweep briefs say `Repo: <owner/name>, checked out in the current directory`.

## Design

A phase ships PRs in one repo, so the repo belongs to the phase. The epic lists the repos its phases may use.

- **Epic:** `repos: string[]`; the first one is the primary repo. The validator reads a legacy `repo: x` as `repos: [x]`, the same way it defaults `kind`. Writes always use `repos`. No store migration.
- **Phase:** `repo: string | null`. `null` means the epic's primary repo, so every existing phase stays valid. It must be one of `epic.repos`.
- **CLI:**
  - `planet epic new --repo` repeats.
  - `planet epic repo add <slug> <owner/name>` adds a repo later.
  - `planet phase new --repo` and `planet phase set --repo`, the latter only on `draft` or `planned` phases.
- **Link:** `linkPrs` checks the PR against the phase's resolved repo.
- **Local checkouts:** `planet repo path <owner/name>` prints a local path.
  - It reads `~/.planet/run/repos.json` first. That file is ignored by the store's git and is machine-local.
  - Otherwise it checks the current repo's sibling directories for a matching `origin`.
  - Exit 3 when neither finds one.
  - `planet repo seen` records the current checkout. The router runs it on every passing repo check, so each checkout registers itself once.
- **Router step 6:**
  - Intake, scoping, and phasing accept any repo in `epic.repos`.
  - Phase-plan, implement, retro, and pr feedback require the phase's repo.
  - The mismatch message names the repo, and its path when `planet repo path` finds one.
- **Router step 8:** stacking only counts lower phases in the same repo. When a lower phase in another repo is not shipped, ask `Implement phase N now` or `Stop`. Stacking across repos is not possible.
- **Skills:**
  - Intake runs its PR search once per repo.
  - Intake, scoping, phase-plan, and retro briefs list each repo with its path. When a path is missing, the skill asks for it once and runs `planet repo seen --path`.
  - Phasing gives every entry a repo, shows it in the proposal, and passes `--repo`.
  - `new-epic.md` asks `create epic <slug>, "<title>", repos <a>, <b>, from <IDs>?`.
- **Status and view:** a `repos` column, joined with commas.

## Commits

1. `rename epic repo to repos with legacy read`: types, validate, `createEpic`, view, status, `epic show` text. Tests: legacy file reads, round trip, `--repo` repeated.
2. `add phase repo`: type, validate, `phase new|set --repo`, check membership. Tests: null default, rejects a repo not in the epic, refuses `set` past `planned`.
3. `link PRs against the phase repo`: `linkPrs`, capture hook path. Tests: secondary-repo PR links to its phase, refused on a primary phase.
4. `add planet epic repo add`
5. `add planet repo path and seen`: registry plus sibling scan. Tests with temp dirs and fake remotes.
6. `go: per-phase repo check and cross-repo stacking`: step 6, step 8, the `add repo` request, `references/pr-feedback.md`, `references/new-epic.md`.
7. `brief templates list every epic repo`: intake, scoping, phase-plan, and retro briefs; intake PR search.
8. `phasing: assign a repo per phase`: a repo per entry, and on a re-cut, add a repo the epic doesn't list yet.
9. Version bump.

## Verification

- `npm test` green.
- Live: from close-ui, run `/planet:go mcp-apps-architecture add repo closeio/closeio`. Run a phasing re-cut that adds a closeio phase. Confirm that phase's repo check stops in close-ui and passes in closeio, and that its PR links to it.

## Decisions

1. The first multi-repo epic is `mcp-apps-architecture`, which already exists with `repo: closeio/close-ui`. It gains `closeio/closeio` through `planet epic repo add`.
2. Epics grow repos over time. A typical one starts FE-only and adds a BE repo later, so nothing asks for paths at epic creation. Two ways add a repo:
   - Router request `add repo <owner/name>` runs `planet epic repo add`, then `planet repo path`, and asks for the path only when that exits 3.
   - A phasing re-cut that proposes a phase in a repo not yet listed names the new repo in the proposal. On approval, it runs `planet epic repo add` before `planet phase new --repo`.
3. A change that needs PRs in both repos becomes two phases, one per repo. Phasing orders them; step 8's cross-repo question covers the dependency.
