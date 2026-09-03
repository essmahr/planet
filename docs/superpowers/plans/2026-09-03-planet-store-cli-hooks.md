# Planet Store, CLI, and Hooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic half of Planet: the `~/.planet` store, the `planet` CLI that owns every read and write of it, and the Claude Code hooks that capture proposals, feedback, and PR links.

**Architecture:** A TypeScript CLI run directly by Node 24 with no build step. `cli/lib/*` holds pure file operations over the store and never commits. `cli/commands/*` parse arguments, call lib, commit, and return one result object rendered as JSON or text. `planet capture` is the single hook entry, reached through a bash shim that exits before Node starts unless a session marker exists.

**Tech Stack:** Node 24 (native TypeScript type stripping, `node:test`, `node:util` parseArgs), `yaml` 2.x, `gh` CLI, git, bash.

**Spec:** `docs/superpowers/specs/2026-09-03-planet-design.md`. Sections implemented here: Store, CLI, Hooks, Testing, Error handling, and the plugin scaffolding from Repository layout. Skills are follow-on 2 and later.

## Global Constraints

- Node 24 runs `.ts` files directly. Only erasable TypeScript syntax: no `enum`, no parameter properties, no `namespace`. Every relative import names its `.ts` extension. Types are imported with `import type`.
- Runtime dependency: `yaml` only. Dev dependencies: `typescript`, `@types/node`, for `npm run typecheck` only.
- Store path is `PLANET_HOME` when set, else `~/.planet`. Every test uses a temp `PLANET_HOME`.
- `cli/lib/*` never commits. Commands and the capture handler commit after their writes, message `<epic>: <what happened>` in lowercase.
- Every command accepts `--json`. Errors exit non-zero with one line on stderr, or `{"error": "..."}` on stdout under `--json`.
- Hooks always exit 0. Errors go to `~/.planet/hook.log`.
- Commit messages in this repo: lowercase imperative, no prefix, no trailing period.
- Verify with `npm test` and `npm run typecheck` before every commit.

## File Structure

```
planet/
  package.json                    type module, scripts test/typecheck, dep yaml
  tsconfig.json                   noEmit, strict, erasableSyntaxOnly
  .gitignore                      node_modules
  README.md                       human install notes
  .claude-plugin/plugin.json
  hooks/hooks.json                five hook registrations -> bin/planet-hook
  bin/planet                      bash shim: exec node cli/planet.ts "$@"
  bin/planet-hook                 bash shim: exit 0 before Node unless a marker exists
  cli/planet.ts                   entry: --json handling, dispatch, error exit codes
  cli/lib/args.ts                 parseArgs wrapper and accessors
  cli/lib/context.ts              Ctx, CommandResult, Command types
  cli/lib/view.ts                 epic show payload
  cli/lib/store.ts                PLANET_HOME, paths, ensureStore, git, commit
  cli/lib/frontmatter.ts          parse and serialize YAML frontmatter
  cli/lib/epic.ts                 epic.yaml read/write/list/resolve, epic show payload
  cli/lib/phase.ts                phase files: list/read/new/write body/set status
  cli/lib/lifecycle.ts            epic status derived from phases
  cli/lib/link.ts                 PR url validation and linking
  cli/lib/session.ts              session markers
  cli/lib/proposal.ts             proposal snapshots and outcomes
  cli/lib/gh.ts                   Gh interface, real client, GhUnavailable
  cli/lib/sync.ts                 PR state sync and status flips
  cli/lib/table.ts                fixed-width table rendering
  cli/lib/report.ts               feedback aggregation helpers
  cli/schema/types.ts             all shared types and allowed-value lists
  cli/schema/validate.ts          validators producing ValidationError
  cli/commands/epic.ts            epic new|set|show|resolve
  cli/commands/phase.ts           phase new|write|set
  cli/commands/link.ts            link, unlink
  cli/commands/session.ts         session start|step|end
  cli/commands/proposal.ts        proposal approve, propose
  cli/commands/check.ts           check
  cli/commands/sync.ts            sync
  cli/commands/status.ts          status rows and table
  cli/commands/open.ts            open
  cli/commands/pr.ts              pr files
  cli/commands/feedback.ts        feedback report
  cli/commands/capture.ts         hook dispatch
  test/helpers.ts                 tmpHome, ctx, fakeGh
  test/*.test.ts                  one file per lib module and command group
  docs/superpowers/notes/         hook probe findings
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `README.md`, `.claude-plugin/plugin.json`, `bin/planet`, `cli/planet.ts`, `test/smoke.test.ts`

**Interfaces:**
- Produces: `npm test`, `npm run typecheck`, and `bin/planet` runnable. Later tasks replace `cli/planet.ts`.

- [ ] **Step 1: Write package.json and tsconfig.json**

```json
{
  "name": "planet",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Scott's personal epic planning workflow for Claude Code",
  "scripts": {
    "test": "node --test",
    "typecheck": "tsc --noEmit"
  },
  "engines": { "node": ">=24" }
}
```

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "erasableSyntaxOnly": true,
    "verbatimModuleSyntax": true,
    "types": ["node"],
    "skipLibCheck": true
  },
  "include": ["cli", "test"]
}
```

`.gitignore`:

```
node_modules
```

- [ ] **Step 2: Install dependencies**

Run: `npm install yaml@^2.9.0 && npm install -D typescript @types/node`
Expected: `package-lock.json` created, `node_modules/yaml` present.

- [ ] **Step 3: Write the plugin manifest and README**

`.claude-plugin/plugin.json`:

```json
{
  "name": "planet",
  "description": "Epic planning across PRs: status, phased plans, proposal capture, PR sync",
  "version": "0.1.0",
  "author": { "name": "Scott Mahr" }
}
```

`README.md`:

```markdown
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
```

- [ ] **Step 4: Write the bin shim and a placeholder entry**

`bin/planet`:

```bash
#!/usr/bin/env bash
set -euo pipefail
self="${BASH_SOURCE[0]}"
while [ -L "$self" ]; do self="$(readlink "$self")"; done
root="$(cd "$(dirname "$self")/.." && pwd)"
exec node "$root/cli/planet.ts" "$@"
```

`cli/planet.ts`:

```ts
console.log("planet: not implemented yet");
```

Run: `chmod +x bin/planet && bin/planet`
Expected: `planet: not implemented yet`

- [ ] **Step 5: Write a smoke test and run everything**

`test/smoke.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("bin/planet runs under node 24", () => {
  const out = execFileSync("bin/planet", { encoding: "utf8" });
  assert.match(out, /planet/);
});
```

Run: `npm test && npm run typecheck`
Expected: 1 test passes, typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "scaffold plugin, cli entry, and test runner"
```

---

### Task 2: Probe the hook events for plan mode

This settles the two open facts in the spec's Hooks section before any capture code exists. It is throwaway: the probe hook and script are removed at the end of the task, and the findings are committed as notes.

**Files:**
- Create (temporary): `hooks/hooks.json`, `bin/planet-probe`
- Create: `docs/superpowers/notes/2026-09-03-hook-probe.md`

- [ ] **Step 1: Write a probe script that appends every payload to a log**

`bin/planet-probe`:

```bash
#!/usr/bin/env bash
{ printf '=== %s\n' "$(date -u +%FT%TZ)"; cat; printf '\n'; } >> "$HOME/.planet-probe.log"
exit 0
```

Run: `chmod +x bin/planet-probe`

- [ ] **Step 2: Register the probe for every event the capture code will use**

`hooks/hooks.json`:

```json
{
  "description": "TEMPORARY probe, removed at the end of Task 2",
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/bin/planet-probe" }] }
    ],
    "PreToolUse": [
      { "matcher": "ExitPlanMode", "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/bin/planet-probe" }] }
    ],
    "PostToolUse": [
      { "matcher": "ExitPlanMode", "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/bin/planet-probe" }] },
      { "matcher": "Bash", "hooks": [{ "type": "command", "if": "Bash(gh pr create *)", "command": "${CLAUDE_PLUGIN_ROOT}/bin/planet-probe" }] }
    ],
    "PostToolUseFailure": [
      { "matcher": "ExitPlanMode", "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/bin/planet-probe" }] }
    ],
    "PermissionDenied": [
      { "matcher": "ExitPlanMode", "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/bin/planet-probe" }] }
    ]
  }
}
```

- [ ] **Step 3: Exercise plan mode in a scratch session**

Run, from any scratch directory and from the VS Code extension so inline editing is available: `claude --plugin-dir /Users/scottmahr/code/personal/planet`

Then, one at a time, asking Claude to enter plan mode and write a short plan each time:

1. Approve the plan unchanged.
2. Approve after editing one line inline in the plan review.
3. Reject with a typed message.
4. Leave an inline comment and choose to stay in plan mode.
5. Run `gh pr create --help` so the Bash hook fires without creating anything.
6. If Ultraplan is available in this build, run one plan through it and approve it.

- [ ] **Step 4: Read the log and record findings**

Run: `grep -o '"hook_event_name":"[A-Za-z]*"' ~/.planet-probe.log | sort | uniq -c`

Write `docs/superpowers/notes/2026-09-03-hook-probe.md` answering, with the exact payload keys quoted from the log:

- Which event fires for an approved plan, and does `tool_response` contain the approved plan text after a `## Approved Plan:` heading?
- Which event fires for a rejection: PostToolUse with error text, PostToolUseFailure with `tool_error`, or PermissionDenied? Quote the field that holds the message.
- Does approve-with-edits deliver the edited text in `tool_response` while `tool_input.plan` still holds the original?
- Is the prompt field on UserPromptSubmit `user_input`, `prompt`, or both?
- Did the Bash hook fire for `gh pr create --help`, and is `tool_response` a string or an object?
- Did Ultraplan produce ExitPlanMode events? If not, what did it produce?

- [ ] **Step 5: Remove the probe and commit the notes**

```bash
rm bin/planet-probe hooks/hooks.json ~/.planet-probe.log
git add -A
git commit -m "record hook probe findings for plan mode events"
```

If any finding contradicts the capture design in Tasks 16 and 17, edit those tasks now so the implementer sees the corrected shape.

---

### Task 3: Store paths, git init, and commit

**Files:**
- Create: `cli/lib/store.ts`, `test/helpers.ts`, `test/store.test.ts`

**Interfaces:**
- Produces:
  - `planetHome(env?: NodeJS.ProcessEnv): string`
  - `ensureStore(home: string): void` creates `epics/`, `sessions/`, and `git init`s once
  - `git(home: string, args: string[]): string` runs git inside the store
  - `commit(home: string, message: string): boolean` stages everything, commits when dirty, returns whether a commit was made
  - `paths` object with functions `epics(home)`, `epic(home, slug)`, `epicFile`, `plan`, `phases`, `proposals`, `feedback`, `prompts`, `notes`, `retros`, `research`, `sessions(home)`, `session(home, id)`, `hookLog(home)`

- [ ] **Step 1: Write the failing tests**

`test/helpers.ts`:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureStore } from "../cli/lib/store.ts";

export const NOW = "2026-09-03T15:00:00.000Z";
export const SESSION = "sess-1";

export function tmpHome(): string {
  const home = mkdtempSync(join(tmpdir(), "planet-"));
  ensureStore(home);
  return home;
}
```

`test/store.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpHome } from "./helpers.ts";
import { planetHome, git, commit, paths } from "../cli/lib/store.ts";

test("planetHome prefers PLANET_HOME", () => {
  assert.equal(planetHome({ PLANET_HOME: "/x/store" }), "/x/store");
  assert.match(planetHome({}), /\/\.planet$/);
});

test("ensureStore creates the layout and a git repo once", () => {
  const home = tmpHome();
  assert.ok(existsSync(join(home, "epics")));
  assert.ok(existsSync(join(home, "sessions")));
  assert.ok(existsSync(join(home, ".git")));
  assert.equal(git(home, ["rev-parse", "--is-inside-work-tree"]).trim(), "true");
});

test("commit stages and commits only when dirty", () => {
  const home = tmpHome();
  assert.equal(commit(home, "nothing"), false);
  writeFileSync(join(home, "note.txt"), "hi\n");
  assert.equal(commit(home, "add note"), true);
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "add note");
  assert.equal(commit(home, "again"), false);
});

test("paths compose under the epic directory", () => {
  assert.equal(paths.epicFile("/h", "gql"), "/h/epics/gql/epic.yaml");
  assert.equal(paths.prompts("/h", "gql"), "/h/epics/gql/feedback/prompts.jsonl");
  assert.equal(paths.session("/h", "s1"), "/h/sessions/s1");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/store.test.ts`
Expected: FAIL, cannot find module `cli/lib/store.ts`.

- [ ] **Step 3: Implement store.ts**

```ts
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

export function planetHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.PLANET_HOME ?? join(homedir(), ".planet");
}

export const paths = {
  epics: (home: string) => join(home, "epics"),
  epic: (home: string, slug: string) => join(home, "epics", slug),
  epicFile: (home: string, slug: string) => join(home, "epics", slug, "epic.yaml"),
  plan: (home: string, slug: string) => join(home, "epics", slug, "plan.md"),
  phases: (home: string, slug: string) => join(home, "epics", slug, "phases"),
  proposals: (home: string, slug: string) => join(home, "epics", slug, "proposals"),
  feedback: (home: string, slug: string) => join(home, "epics", slug, "feedback"),
  prompts: (home: string, slug: string) => join(home, "epics", slug, "feedback", "prompts.jsonl"),
  notes: (home: string, slug: string) => join(home, "epics", slug, "feedback", "notes.md"),
  retros: (home: string, slug: string) => join(home, "epics", slug, "retros"),
  research: (home: string, slug: string) => join(home, "epics", slug, "research"),
  sessions: (home: string) => join(home, "sessions"),
  session: (home: string, id: string) => join(home, "sessions", id),
  hookLog: (home: string) => join(home, "hook.log"),
};

export function git(home: string, args: string[]): string {
  return execFileSync(
    "git",
    ["-C", home, "-c", "user.name=planet", "-c", "user.email=planet@local", ...args],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

export function ensureStore(home: string): void {
  mkdirSync(paths.epics(home), { recursive: true });
  mkdirSync(paths.sessions(home), { recursive: true });
  if (!existsSync(join(home, ".git"))) git(home, ["init", "-q"]);
}

export function commit(home: string, message: string): boolean {
  git(home, ["add", "-A"]);
  if (git(home, ["status", "--porcelain"]).trim() === "") return false;
  git(home, ["commit", "-q", "-m", message]);
  return true;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/store.test.ts && npm run typecheck`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "add store paths, git init, and commit helper"
```

---

### Task 4: Frontmatter parse and serialize

**Files:**
- Create: `cli/lib/frontmatter.ts`, `test/frontmatter.test.ts`

**Interfaces:**
- Produces:
  - `interface Document { data: Record<string, unknown>; body: string }`
  - `parseFrontmatter(text: string): Document`
  - `serializeFrontmatter(data: Record<string, unknown>, body: string): string`

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter, serializeFrontmatter } from "../cli/lib/frontmatter.ts";

test("parses frontmatter and body", () => {
  const doc = parseFrontmatter("---\nid: 1\nslug: a\n---\nBody line\n");
  assert.deepEqual(doc.data, { id: 1, slug: "a" });
  assert.equal(doc.body, "Body line\n");
});

test("no frontmatter means empty data", () => {
  assert.deepEqual(parseFrontmatter("just text"), { data: {}, body: "just text" });
});

test("frontmatter with no body", () => {
  assert.deepEqual(parseFrontmatter("---\nid: 1\n---"), { data: { id: 1 }, body: "" });
  assert.deepEqual(parseFrontmatter("---\nid: 1\n---\n"), { data: { id: 1 }, body: "" });
});

test("round trips through serialize", () => {
  const text = serializeFrontmatter({ id: 2, prs: [] }, "Hello\n");
  assert.equal(text, "---\nid: 2\nprs: []\n---\nHello\n");
  assert.deepEqual(parseFrontmatter(text), { data: { id: 2, prs: [] }, body: "Hello\n" });
});

test("rejects unterminated frontmatter", () => {
  assert.throws(() => parseFrontmatter("---\nid: 1\n"), /unterminated/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/frontmatter.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement frontmatter.ts**

```ts
import { parse, stringify } from "yaml";

export interface Document {
  data: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(text: string): Document {
  if (!text.startsWith("---\n")) return { data: {}, body: text };
  const close = text.indexOf("\n---", 3);
  if (close === -1) throw new Error("unterminated frontmatter");
  const afterClose = close + 4;
  if (afterClose < text.length && text[afterClose] !== "\n") throw new Error("unterminated frontmatter");
  const raw: unknown = parse(text.slice(4, close + 1)) ?? {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("frontmatter must be a mapping");
  const body = afterClose >= text.length ? "" : text.slice(afterClose + 1);
  return { data: raw as Record<string, unknown>, body };
}

export function serializeFrontmatter(data: Record<string, unknown>, body: string): string {
  return `---\n${stringify(data)}---\n${body}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/frontmatter.test.ts && npm run typecheck`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "add frontmatter parser"
```

---

### Task 5: Schema types and validators

**Files:**
- Create: `cli/schema/types.ts`, `cli/schema/validate.ts`, `test/validate.test.ts`

**Interfaces:**
- Produces, in `types.ts`:
  - `type EpicStatus = "planning" | "active" | "paused" | "shipped" | "abandoned"`
  - `type PhaseStatus = "draft" | "planned" | "in-progress" | "shipped" | "reviewed"`
  - `type PrState = "open" | "merged" | "closed"`
  - `type Step = "intake" | "scoping" | "phasing" | "phase-plan" | "retro" | "feedback-review"`
  - `type Outcome = "pending" | "approved" | "rejected"`
  - `const EPIC_STATUSES, PHASE_STATUSES, PR_STATES, STEPS, OUTCOMES` readonly arrays
  - `interface PrRef { url: string; state: PrState; merged_at: string | null }`
  - `interface Epic { slug; title; repo; status: EpicStatus; linear: string[]; created; updated; synced_at: string | null; shipped_at: string | null; sessions: string[] }`
  - `interface PhaseMeta { id: number; slug; title; status: PhaseStatus; linear: string[]; prs: PrRef[]; shipped_at: string | null }`
  - `interface Phase { meta: PhaseMeta; body: string; path: string }`
  - `interface ProposalMeta { id: number; step: Step | "unknown"; phase: number | null; session: string; tool_use: string | null; plan_file: string | null; created: string; outcome: Outcome; edited: boolean; feedback: string | null }`
  - `interface Proposal { meta: ProposalMeta; body: string; path: string }`
  - `interface SessionMarker { epic: string; phase: number | null; step: Step | null; started: string }`
- Produces, in `validate.ts`:
  - `class ValidationError extends Error { file: string }`
  - `SLUG_RE`, `REPO_RE`, `assertSlug(value: string, what: string): void`
  - `validateEpic(v: unknown, file: string): Epic`, `validatePhaseMeta`, `validateProposalMeta`, `validateMarker`

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEpic, validatePhaseMeta, validateProposalMeta, validateMarker, ValidationError, assertSlug } from "../cli/schema/validate.ts";

const epic = {
  slug: "gql-migration", title: "GQL migration", repo: "closeio/close-ui", status: "planning",
  linear: ["CRM-123"], created: "2026-09-03T15:02:00Z", updated: "2026-09-03T15:02:00Z",
  synced_at: null, shipped_at: null, sessions: [],
};

test("validateEpic accepts a full epic and fills defaults", () => {
  const e = validateEpic(epic, "epic.yaml");
  assert.equal(e.slug, "gql-migration");
  assert.deepEqual(validateEpic({ ...epic, linear: undefined, sessions: undefined }, "f").linear, []);
});

test("validateEpic rejects bad status, slug, and repo", () => {
  assert.throws(() => validateEpic({ ...epic, status: "done" }, "f"), ValidationError);
  assert.throws(() => validateEpic({ ...epic, slug: "GQL Migration" }, "f"), /kebab-case/);
  assert.throws(() => validateEpic({ ...epic, repo: "close-ui" }, "f"), /owner\/name/);
});

test("validatePhaseMeta validates nested prs", () => {
  const meta = validatePhaseMeta({
    id: 1, slug: "codegen", title: "Codegen", status: "in-progress", linear: [],
    prs: [{ url: "https://github.com/closeio/close-ui/pull/1", state: "open", merged_at: null }], shipped_at: null,
  }, "01-codegen.md");
  assert.equal(meta.prs[0].state, "open");
  assert.throws(() => validatePhaseMeta({ id: "1", slug: "a", title: "A", status: "draft" }, "f"), /id must be an integer/);
  assert.throws(() => validatePhaseMeta({ id: 1, slug: "a", title: "A", status: "draft", prs: [{ url: "u", state: "nope" }] }, "f"), /state must be one of/);
});

test("validateProposalMeta allows the unknown step and defaults outcome fields", () => {
  const p = validateProposalMeta({ id: 3, step: "unknown", phase: null, session: "s", created: "t" }, "f");
  assert.equal(p.outcome, "pending");
  assert.equal(p.edited, false);
  assert.equal(p.feedback, null);
  assert.equal(p.tool_use, null);
  assert.throws(() => validateProposalMeta({ id: 3, step: "dreaming", phase: null, session: "s", created: "t" }, "f"), /step must be one of/);
});

test("validateMarker", () => {
  assert.deepEqual(validateMarker({ epic: "gql", phase: null, step: null, started: "t" }, "f"), { epic: "gql", phase: null, step: null, started: "t" });
  assert.throws(() => validateMarker({ epic: "gql", phase: 1, step: "nap", started: "t" }, "f"), /step must be one of/);
});

test("assertSlug", () => {
  assertSlug("ok-slug-2", "slug");
  assert.throws(() => assertSlug("Bad_Slug", "slug"), /kebab-case/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/validate.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement types.ts**

```ts
export type EpicStatus = "planning" | "active" | "paused" | "shipped" | "abandoned";
export type PhaseStatus = "draft" | "planned" | "in-progress" | "shipped" | "reviewed";
export type PrState = "open" | "merged" | "closed";
export type Step = "intake" | "scoping" | "phasing" | "phase-plan" | "retro" | "feedback-review";
export type Outcome = "pending" | "approved" | "rejected";

export const EPIC_STATUSES: readonly EpicStatus[] = ["planning", "active", "paused", "shipped", "abandoned"];
export const PHASE_STATUSES: readonly PhaseStatus[] = ["draft", "planned", "in-progress", "shipped", "reviewed"];
export const PR_STATES: readonly PrState[] = ["open", "merged", "closed"];
export const STEPS: readonly Step[] = ["intake", "scoping", "phasing", "phase-plan", "retro", "feedback-review"];
export const OUTCOMES: readonly Outcome[] = ["pending", "approved", "rejected"];

export interface PrRef {
  url: string;
  state: PrState;
  merged_at: string | null;
}

export interface Epic {
  slug: string;
  title: string;
  repo: string;
  status: EpicStatus;
  linear: string[];
  created: string;
  updated: string;
  synced_at: string | null;
  shipped_at: string | null;
  sessions: string[];
}

export interface PhaseMeta {
  id: number;
  slug: string;
  title: string;
  status: PhaseStatus;
  linear: string[];
  prs: PrRef[];
  shipped_at: string | null;
}

export interface Phase {
  meta: PhaseMeta;
  body: string;
  path: string;
}

export interface ProposalMeta {
  id: number;
  step: Step | "unknown";
  phase: number | null;
  session: string;
  tool_use: string | null;
  plan_file: string | null;
  created: string;
  outcome: Outcome;
  edited: boolean;
  feedback: string | null;
}

export interface Proposal {
  meta: ProposalMeta;
  body: string;
  path: string;
}

export interface SessionMarker {
  epic: string;
  phase: number | null;
  step: Step | null;
  started: string;
}
```

- [ ] **Step 4: Implement validate.ts**

```ts
import type { Epic, PhaseMeta, PrRef, ProposalMeta, SessionMarker } from "./types.ts";
import { EPIC_STATUSES, OUTCOMES, PHASE_STATUSES, PR_STATES, STEPS } from "./types.ts";

export class ValidationError extends Error {
  file: string;
  constructor(file: string, message: string) {
    super(`${file}: ${message}`);
    this.name = "ValidationError";
    this.file = file;
  }
}

type Obj = Record<string, unknown>;

export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
export const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

export function assertSlug(value: string, what: string): void {
  if (SLUG_RE.test(value)) return;
  throw new ValidationError(what, `'${value}' must be kebab-case: lowercase letters, digits, hyphens`);
}

function obj(v: unknown, file: string): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new ValidationError(file, "expected a mapping");
  return v as Obj;
}

function str(o: Obj, key: string, file: string): string {
  const v = o[key];
  if (typeof v !== "string" || v === "") throw new ValidationError(file, `${key} must be a non-empty string`);
  return v;
}

function nullableStr(o: Obj, key: string, file: string): string | null {
  const v = o[key];
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw new ValidationError(file, `${key} must be a string or null`);
  return v;
}

function int(o: Obj, key: string, file: string): number {
  const v = o[key];
  if (typeof v !== "number" || !Number.isInteger(v)) throw new ValidationError(file, `${key} must be an integer`);
  return v;
}

function nullableInt(o: Obj, key: string, file: string): number | null {
  const v = o[key];
  if (v === null || v === undefined) return null;
  return int(o, key, file);
}

function bool(o: Obj, key: string, file: string, fallback: boolean): boolean {
  const v = o[key];
  if (v === undefined) return fallback;
  if (typeof v !== "boolean") throw new ValidationError(file, `${key} must be a boolean`);
  return v;
}

function strList(o: Obj, key: string, file: string): string[] {
  const v = o[key] ?? [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new ValidationError(file, `${key} must be a list of strings`);
  return v as string[];
}

function oneOf<T extends string>(o: Obj, key: string, file: string, allowed: readonly T[]): T {
  const v = o[key];
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) {
    throw new ValidationError(file, `${key} must be one of ${allowed.join(", ")}`);
  }
  return v as T;
}

export function validateEpic(v: unknown, file: string): Epic {
  const o = obj(v, file);
  const slug = str(o, "slug", file);
  assertSlug(slug, file);
  const repo = str(o, "repo", file);
  if (!REPO_RE.test(repo)) throw new ValidationError(file, "repo must be owner/name");
  return {
    slug,
    title: str(o, "title", file),
    repo,
    status: oneOf(o, "status", file, EPIC_STATUSES),
    linear: strList(o, "linear", file),
    created: str(o, "created", file),
    updated: str(o, "updated", file),
    synced_at: nullableStr(o, "synced_at", file),
    shipped_at: nullableStr(o, "shipped_at", file),
    sessions: strList(o, "sessions", file),
  };
}

function validatePr(v: unknown, file: string): PrRef {
  const o = obj(v, file);
  return { url: str(o, "url", file), state: oneOf(o, "state", file, PR_STATES), merged_at: nullableStr(o, "merged_at", file) };
}

export function validatePhaseMeta(v: unknown, file: string): PhaseMeta {
  const o = obj(v, file);
  const prs = o.prs ?? [];
  if (!Array.isArray(prs)) throw new ValidationError(file, "prs must be a list");
  const slug = str(o, "slug", file);
  assertSlug(slug, file);
  return {
    id: int(o, "id", file),
    slug,
    title: str(o, "title", file),
    status: oneOf(o, "status", file, PHASE_STATUSES),
    linear: strList(o, "linear", file),
    prs: prs.map((p) => validatePr(p, file)),
    shipped_at: nullableStr(o, "shipped_at", file),
  };
}

export function validateProposalMeta(v: unknown, file: string): ProposalMeta {
  const o = obj(v, file);
  const step = o.step === "unknown" ? "unknown" : oneOf(o, "step", file, STEPS);
  return {
    id: int(o, "id", file),
    step,
    phase: nullableInt(o, "phase", file),
    session: str(o, "session", file),
    tool_use: nullableStr(o, "tool_use", file),
    plan_file: nullableStr(o, "plan_file", file),
    created: str(o, "created", file),
    outcome: o.outcome === undefined ? "pending" : oneOf(o, "outcome", file, OUTCOMES),
    edited: bool(o, "edited", file, false),
    feedback: nullableStr(o, "feedback", file),
  };
}

export function validateMarker(v: unknown, file: string): SessionMarker {
  const o = obj(v, file);
  return {
    epic: str(o, "epic", file),
    phase: nullableInt(o, "phase", file),
    step: o.step === null || o.step === undefined ? null : oneOf(o, "step", file, STEPS),
    started: str(o, "started", file),
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/validate.test.ts && npm run typecheck`
Expected: 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "add store schema types and validators"
```

---

### Task 6: Epic read, write, list, resolve

**Files:**
- Create: `cli/lib/epic.ts`, `test/epic.test.ts`

**Interfaces:**
- Consumes: `paths` from store.ts, `validateEpic`, `assertSlug`, `REPO_RE`, `ValidationError` from validate.ts
- Produces:
  - `class NotFound extends Error`
  - `interface NewEpicInput { slug: string; title: string; repo: string; linear?: string[] }`
  - `readEpic(home: string, slug: string): Epic` throws `NotFound`
  - `writeEpic(home: string, epic: Epic): void`
  - `createEpic(home: string, input: NewEpicInput, now: string): Epic` creates `phases/`, `proposals/`, `feedback/`, `retros/`, `research/`
  - `listEpics(home: string): Epic[]` sorted by slug
  - `LINEAR_ID_RE`
  - `resolveEpics(epics: Epic[], text: string, phasesOf: (slug: string) => PhaseMeta[]): Epic[]`

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NOW, tmpHome } from "./helpers.ts";
import { createEpic, listEpics, readEpic, resolveEpics, writeEpic, NotFound } from "../cli/lib/epic.ts";
import type { PhaseMeta } from "../cli/schema/types.ts";

const input = { slug: "gql-migration", title: "GQL migration", repo: "closeio/close-ui", linear: ["CRM-123"] };

test("createEpic writes epic.yaml and the directory layout", () => {
  const home = tmpHome();
  const epic = createEpic(home, input, NOW);
  assert.equal(epic.status, "planning");
  assert.equal(epic.created, NOW);
  for (const d of ["phases", "proposals", "feedback", "retros", "research"]) {
    assert.ok(existsSync(join(home, "epics", "gql-migration", d)), d);
  }
  assert.ok(!existsSync(join(home, "epics", "gql-migration", "plan.md")), "plan.md is not created");
  assert.deepEqual(readEpic(home, "gql-migration"), epic);
});

test("createEpic rejects duplicates and bad input", () => {
  const home = tmpHome();
  createEpic(home, input, NOW);
  assert.throws(() => createEpic(home, input, NOW), /already exists/);
  assert.throws(() => createEpic(home, { ...input, slug: "Bad Slug" }, NOW), /kebab-case/);
  assert.throws(() => createEpic(home, { ...input, slug: "x", repo: "nope" }, NOW), /owner\/name/);
});

test("readEpic throws NotFound; writeEpic round trips", () => {
  const home = tmpHome();
  assert.throws(() => readEpic(home, "missing"), NotFound);
  const epic = createEpic(home, input, NOW);
  epic.status = "paused";
  writeEpic(home, epic);
  assert.equal(readEpic(home, "gql-migration").status, "paused");
});

test("listEpics sorts by slug", () => {
  const home = tmpHome();
  createEpic(home, { ...input, slug: "zeta" }, NOW);
  createEpic(home, { ...input, slug: "alpha" }, NOW);
  assert.deepEqual(listEpics(home).map((e) => e.slug), ["alpha", "zeta"]);
});

test("resolveEpics: exact slug, then substring, then linear id", () => {
  const home = tmpHome();
  const a = createEpic(home, { slug: "gql-migration", title: "GQL migration", repo: "o/r", linear: ["CRM-1"] }, NOW);
  const b = createEpic(home, { slug: "gql-cleanup", title: "Remove REST", repo: "o/r" }, NOW);
  const phasesOf = (slug: string): PhaseMeta[] => slug === "gql-cleanup"
    ? [{ id: 1, slug: "p", title: "P", status: "draft", linear: ["CRM-99"], prs: [], shipped_at: null }]
    : [];
  assert.deepEqual(resolveEpics([a, b], "gql-cleanup", phasesOf).map((e) => e.slug), ["gql-cleanup"]);
  assert.deepEqual(resolveEpics([a, b], "GQL", phasesOf).map((e) => e.slug), ["gql-migration", "gql-cleanup"]);
  assert.deepEqual(resolveEpics([a, b], "rest", phasesOf).map((e) => e.slug), ["gql-cleanup"]);
  assert.deepEqual(resolveEpics([a, b], "crm-1", phasesOf).map((e) => e.slug), ["gql-migration"]);
  assert.deepEqual(resolveEpics([a, b], "https://linear.app/close/issue/CRM-99/thing", phasesOf).map((e) => e.slug), ["gql-cleanup"]);
  assert.deepEqual(resolveEpics([a, b], "nothing here", phasesOf), []);
  assert.deepEqual(resolveEpics([a, b], "   ", phasesOf), []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/epic.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement epic.ts**

```ts
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { parse, stringify } from "yaml";
import type { Epic, PhaseMeta } from "../schema/types.ts";
import { REPO_RE, ValidationError, assertSlug, validateEpic } from "../schema/validate.ts";
import { paths } from "./store.ts";

export class NotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFound";
  }
}

export interface NewEpicInput {
  slug: string;
  title: string;
  repo: string;
  linear?: string[];
}

export function readEpic(home: string, slug: string): Epic {
  const file = paths.epicFile(home, slug);
  if (!existsSync(file)) throw new NotFound(`no epic '${slug}'`);
  return validateEpic(parse(readFileSync(file, "utf8")), file);
}

export function writeEpic(home: string, epic: Epic): void {
  writeFileSync(paths.epicFile(home, epic.slug), stringify({ ...epic }));
}

export function createEpic(home: string, input: NewEpicInput, now: string): Epic {
  assertSlug(input.slug, "epic slug");
  if (!REPO_RE.test(input.repo)) throw new ValidationError("epic", "repo must be owner/name");
  if (existsSync(paths.epic(home, input.slug))) throw new Error(`epic '${input.slug}' already exists`);
  for (const dir of [paths.phases, paths.proposals, paths.feedback, paths.retros, paths.research]) {
    mkdirSync(dir(home, input.slug), { recursive: true });
  }
  const epic: Epic = {
    slug: input.slug,
    title: input.title,
    repo: input.repo,
    status: "planning",
    linear: input.linear ?? [],
    created: now,
    updated: now,
    synced_at: null,
    shipped_at: null,
    sessions: [],
  };
  writeEpic(home, epic);
  return epic;
}

export function listEpics(home: string): Epic[] {
  const root = paths.epics(home);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(paths.epicFile(home, d.name)))
    .map((d) => readEpic(home, d.name))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export const LINEAR_ID_RE = /\b([A-Za-z]{2,10}-\d+)\b/;

export function resolveEpics(epics: Epic[], text: string, phasesOf: (slug: string) => PhaseMeta[]): Epic[] {
  const q = text.trim().toLowerCase();
  if (!q) return [];
  const exact = epics.filter((e) => e.slug === q);
  if (exact.length) return exact;
  const partial = epics.filter((e) => e.slug.includes(q) || e.title.toLowerCase().includes(q));
  if (partial.length) return partial;
  const m = LINEAR_ID_RE.exec(text);
  if (!m) return [];
  const id = m[1].toUpperCase();
  const has = (ids: string[]) => ids.some((x) => x.toUpperCase() === id);
  return epics.filter((e) => has(e.linear) || phasesOf(e.slug).some((p) => has(p.linear)));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/epic.test.ts && npm run typecheck`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "add epic read, write, list, and resolve"
```

---

### Task 7: Phase files and epic lifecycle

**Files:**
- Create: `cli/lib/phase.ts`, `cli/lib/lifecycle.ts`, `test/phase.test.ts`

**Interfaces:**
- Consumes: `parseFrontmatter`, `serializeFrontmatter`, `validatePhaseMeta`, `assertSlug`, `NotFound`, `paths`
- Produces, in `phase.ts`:
  - `interface NewPhaseInput { slug: string; title: string; linear?: string[] }`
  - `phaseFileName(id: number, slug: string): string` → `01-slug.md`
  - `readPhaseFile(path: string): Phase`
  - `listPhases(home: string, epic: string): Phase[]` sorted by id
  - `readPhase(home: string, epic: string, id: number): Phase` throws `NotFound`
  - `writePhase(phase: Phase): void`
  - `newPhases(home: string, epic: string, inputs: NewPhaseInput[]): Phase[]` assigns consecutive ids after the current max
  - `writeBody(home: string, epic: string, id: number, body: string): Phase`
  - `setPhaseStatus(home: string, epic: string, id: number, status: "planned" | "reviewed"): Phase` enforces `planned` from draft or planned, `reviewed` from shipped
  - `setPhaseLinear(home: string, epic: string, id: number, linear: string[]): Phase`
  - `currentPhase(phases: PhaseMeta[]): PhaseMeta | null` first in-progress, else first planned, else first draft
- Produces, in `lifecycle.ts`:
  - `recomputeEpicStatus(epic: Epic, phases: PhaseMeta[], now: string): boolean` planning→active when any phase has a PR, active→shipped when every phase is reviewed. Mutates `epic`, returns whether it changed.

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NOW, tmpHome } from "./helpers.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { currentPhase, listPhases, newPhases, phaseFileName, readPhase, setPhaseStatus, writeBody } from "../cli/lib/phase.ts";
import { recomputeEpicStatus } from "../cli/lib/lifecycle.ts";
import type { PhaseMeta } from "../cli/schema/types.ts";

function epicHome(): string {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  return home;
}

test("newPhases assigns consecutive ids and writes frontmatter with an empty body", () => {
  const home = epicHome();
  const [a, b] = newPhases(home, "e", [{ slug: "codegen", title: "Codegen" }, { slug: "hooks", title: "Hooks", linear: ["CRM-2"] }]);
  assert.equal(a.meta.id, 1);
  assert.equal(b.meta.id, 2);
  assert.equal(phaseFileName(b.meta.id, b.meta.slug), "02-hooks.md");
  assert.match(readFileSync(b.path, "utf8"), /^---\nid: 2\nslug: hooks\n/);
  const [c] = newPhases(home, "e", [{ slug: "cleanup", title: "Cleanup" }]);
  assert.equal(c.meta.id, 3);
  assert.deepEqual(listPhases(home, "e").map((p) => p.meta.slug), ["codegen", "hooks", "cleanup"]);
  assert.throws(() => newPhases(home, "e", [{ slug: "hooks", title: "Dup" }]), /already exists/);
});

test("writeBody keeps frontmatter and ensures a trailing newline", () => {
  const home = epicHome();
  newPhases(home, "e", [{ slug: "codegen", title: "Codegen" }]);
  const p = writeBody(home, "e", 1, "# Plan\n\nDo the thing");
  assert.equal(p.body, "# Plan\n\nDo the thing\n");
  assert.equal(readPhase(home, "e", 1).meta.title, "Codegen");
});

test("setPhaseStatus enforces manual transitions", () => {
  const home = epicHome();
  newPhases(home, "e", [{ slug: "codegen", title: "Codegen" }]);
  assert.equal(setPhaseStatus(home, "e", 1, "planned").meta.status, "planned");
  assert.throws(() => setPhaseStatus(home, "e", 1, "reviewed"), /cannot set phase 1 to reviewed from planned/);
  assert.throws(() => readPhase(home, "e", 9), /no phase 9/);
});

test("currentPhase prefers in-progress, then planned, then draft", () => {
  const mk = (id: number, status: PhaseMeta["status"]): PhaseMeta => ({ id, slug: `p${id}`, title: "", status, linear: [], prs: [], shipped_at: null });
  assert.equal(currentPhase([mk(1, "reviewed"), mk(2, "draft"), mk(3, "planned")])?.id, 3);
  assert.equal(currentPhase([mk(1, "planned"), mk(2, "in-progress")])?.id, 2);
  assert.equal(currentPhase([mk(1, "reviewed")]), null);
});

test("recomputeEpicStatus derives active and shipped", () => {
  const home = epicHome();
  const epic = { slug: "e", title: "E", repo: "o/r", status: "planning" as const, linear: [], created: NOW, updated: NOW, synced_at: null, shipped_at: null, sessions: [] };
  const pr = { url: "https://github.com/o/r/pull/1", state: "open" as const, merged_at: null };
  const phase: PhaseMeta = { id: 1, slug: "a", title: "A", status: "in-progress", linear: [], prs: [pr], shipped_at: null };
  assert.equal(recomputeEpicStatus(epic, [phase], NOW), true);
  assert.equal(epic.status, "active");
  assert.equal(recomputeEpicStatus(epic, [phase], NOW), false);
  assert.equal(recomputeEpicStatus(epic, [{ ...phase, status: "reviewed" }], "2026-10-01T00:00:00Z"), true);
  assert.equal(epic.status, "shipped");
  assert.equal(epic.shipped_at, "2026-10-01T00:00:00Z");
  void home;
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/phase.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement phase.ts**

```ts
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Phase, PhaseMeta, PhaseStatus } from "../schema/types.ts";
import { assertSlug, validatePhaseMeta } from "../schema/validate.ts";
import { NotFound } from "./epic.ts";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.ts";
import { paths } from "./store.ts";

export interface NewPhaseInput {
  slug: string;
  title: string;
  linear?: string[];
}

export function phaseFileName(id: number, slug: string): string {
  return `${String(id).padStart(2, "0")}-${slug}.md`;
}

export function readPhaseFile(path: string): Phase {
  const { data, body } = parseFrontmatter(readFileSync(path, "utf8"));
  return { meta: validatePhaseMeta(data, path), body, path };
}

export function listPhases(home: string, epic: string): Phase[] {
  const dir = paths.phases(home, epic);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{2}-[a-z0-9-]+\.md$/.test(f))
    .map((f) => readPhaseFile(join(dir, f)))
    .sort((a, b) => a.meta.id - b.meta.id);
}

export function readPhase(home: string, epic: string, id: number): Phase {
  const phase = listPhases(home, epic).find((p) => p.meta.id === id);
  if (!phase) throw new NotFound(`no phase ${id} in epic '${epic}'`);
  return phase;
}

export function writePhase(phase: Phase): void {
  writeFileSync(phase.path, serializeFrontmatter({ ...phase.meta }, phase.body));
}

export function newPhases(home: string, epic: string, inputs: NewPhaseInput[]): Phase[] {
  const existing = listPhases(home, epic);
  const taken = new Set(existing.map((p) => p.meta.slug));
  let nextId = existing.reduce((max, p) => Math.max(max, p.meta.id), 0) + 1;
  const dir = paths.phases(home, epic);
  mkdirSync(dir, { recursive: true });
  const created: Phase[] = [];
  for (const input of inputs) {
    assertSlug(input.slug, "phase slug");
    if (taken.has(input.slug)) throw new Error(`phase '${input.slug}' already exists in epic '${epic}'`);
    taken.add(input.slug);
    const meta: PhaseMeta = { id: nextId++, slug: input.slug, title: input.title, status: "draft", linear: input.linear ?? [], prs: [], shipped_at: null };
    const phase: Phase = { meta, body: "", path: join(dir, phaseFileName(meta.id, meta.slug)) };
    writePhase(phase);
    created.push(phase);
  }
  return created;
}

export function writeBody(home: string, epic: string, id: number, body: string): Phase {
  const phase = readPhase(home, epic, id);
  phase.body = body.endsWith("\n") ? body : `${body}\n`;
  writePhase(phase);
  return phase;
}

const MANUAL_TRANSITIONS: Record<"planned" | "reviewed", readonly PhaseStatus[]> = {
  planned: ["draft", "planned"],
  reviewed: ["shipped"],
};

export function setPhaseStatus(home: string, epic: string, id: number, status: "planned" | "reviewed"): Phase {
  const phase = readPhase(home, epic, id);
  if (!MANUAL_TRANSITIONS[status].includes(phase.meta.status)) {
    throw new Error(`cannot set phase ${id} to ${status} from ${phase.meta.status}`);
  }
  phase.meta.status = status;
  writePhase(phase);
  return phase;
}

export function setPhaseLinear(home: string, epic: string, id: number, linear: string[]): Phase {
  const phase = readPhase(home, epic, id);
  phase.meta.linear = linear;
  writePhase(phase);
  return phase;
}

export function currentPhase(phases: PhaseMeta[]): PhaseMeta | null {
  for (const status of ["in-progress", "planned", "draft"] as const) {
    const found = phases.find((p) => p.status === status);
    if (found) return found;
  }
  return null;
}
```

- [ ] **Step 4: Implement lifecycle.ts**

```ts
import type { Epic, PhaseMeta } from "../schema/types.ts";

/** Derives the epic status from its phases. Mutates `epic`, returns true when it changed. */
export function recomputeEpicStatus(epic: Epic, phases: PhaseMeta[], now: string): boolean {
  if (epic.status === "planning" && phases.some((p) => p.prs.length > 0)) {
    epic.status = "active";
    epic.updated = now;
    return true;
  }
  if (epic.status === "active" && phases.length > 0 && phases.every((p) => p.status === "reviewed")) {
    epic.status = "shipped";
    epic.shipped_at = now;
    epic.updated = now;
    return true;
  }
  return false;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/phase.test.ts && npm run typecheck`
Expected: 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "add phase files and epic lifecycle rules"
```

---

### Task 8: PR linking

**Files:**
- Create: `cli/lib/link.ts`, `test/link.test.ts`

**Interfaces:**
- Consumes: `readEpic`, `writeEpic`, `readPhase`, `listPhases`, `writePhase`, `recomputeEpicStatus`
- Produces:
  - `PR_URL_RE` matching `https://github.com/<owner>/<repo>/pull/<n>`, group 1 is `owner/repo`
  - `interface LinkResult { epic: Epic; phase: Phase; added: string[] }`
  - `linkPrs(home: string, epic: string, phaseId: number, urls: string[], now: string): LinkResult`
  - `unlinkPr(home: string, epic: string, phaseId: number, url: string, now: string): LinkResult`

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { NOW, tmpHome } from "./helpers.ts";
import { createEpic, readEpic } from "../cli/lib/epic.ts";
import { newPhases, readPhase } from "../cli/lib/phase.ts";
import { PR_URL_RE, linkPrs, unlinkPr } from "../cli/lib/link.ts";

const PR1 = "https://github.com/closeio/close-ui/pull/1234";
const PR2 = "https://github.com/closeio/close-ui/pull/1240";

function setup(): string {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "closeio/close-ui" }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  return home;
}

test("PR_URL_RE extracts owner/repo and tolerates trailing text", () => {
  const m = PR_URL_RE.exec("Created PR https://github.com/closeio/close-ui/pull/77\n");
  assert.equal(m?.[0], "https://github.com/closeio/close-ui/pull/77");
  assert.equal(m?.[1], "closeio/close-ui");
});

test("linkPrs adds PRs, moves the phase to in-progress and the epic to active", () => {
  const home = setup();
  const r = linkPrs(home, "e", 1, [PR1, PR2], NOW);
  assert.deepEqual(r.added, [PR1, PR2]);
  assert.equal(r.phase.meta.status, "in-progress");
  assert.deepEqual(r.phase.meta.prs[0], { url: PR1, state: "open", merged_at: null });
  assert.equal(readEpic(home, "e").status, "active");
  const again = linkPrs(home, "e", 1, [PR1], NOW);
  assert.deepEqual(again.added, []);
  assert.equal(readPhase(home, "e", 1).meta.prs.length, 2);
});

test("linkPrs rejects urls outside the epic repo or not PR urls", () => {
  const home = setup();
  assert.throws(() => linkPrs(home, "e", 1, ["https://github.com/other/repo/pull/1"], NOW), /not in closeio\/close-ui/);
  assert.throws(() => linkPrs(home, "e", 1, ["https://github.com/closeio/close-ui/issues/1"], NOW), /not a GitHub PR url/);
  assert.equal(readEpic(home, "e").status, "planning");
});

test("unlinkPr removes the PR and returns an in-progress phase with no PRs to planned", () => {
  const home = setup();
  linkPrs(home, "e", 1, [PR1], NOW);
  const r = unlinkPr(home, "e", 1, PR1, NOW);
  assert.deepEqual(r.phase.meta.prs, []);
  assert.equal(r.phase.meta.status, "planned");
  assert.throws(() => unlinkPr(home, "e", 1, PR1, NOW), /not linked/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/link.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement link.ts**

```ts
import type { Epic, Phase } from "../schema/types.ts";
import { readEpic, writeEpic } from "./epic.ts";
import { recomputeEpicStatus } from "./lifecycle.ts";
import { listPhases, readPhase, writePhase } from "./phase.ts";

export const PR_URL_RE = /https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/;

export interface LinkResult {
  epic: Epic;
  phase: Phase;
  added: string[];
}

export function linkPrs(home: string, epicSlug: string, phaseId: number, urls: string[], now: string): LinkResult {
  const epic = readEpic(home, epicSlug);
  const phase = readPhase(home, epicSlug, phaseId);
  const added: string[] = [];
  for (const raw of urls) {
    const m = PR_URL_RE.exec(raw);
    if (!m) throw new Error(`not a GitHub PR url: ${raw}`);
    if (m[1] !== epic.repo) throw new Error(`${raw} is not in ${epic.repo}`);
    const url = m[0];
    if (phase.meta.prs.some((pr) => pr.url === url)) continue;
    phase.meta.prs.push({ url, state: "open", merged_at: null });
    added.push(url);
  }
  if (added.length === 0) return { epic, phase, added };
  if (phase.meta.status === "draft" || phase.meta.status === "planned") phase.meta.status = "in-progress";
  writePhase(phase);
  epic.updated = now;
  recomputeEpicStatus(epic, listPhases(home, epicSlug).map((p) => p.meta), now);
  writeEpic(home, epic);
  return { epic, phase, added };
}

export function unlinkPr(home: string, epicSlug: string, phaseId: number, url: string, now: string): LinkResult {
  const epic = readEpic(home, epicSlug);
  const phase = readPhase(home, epicSlug, phaseId);
  const before = phase.meta.prs.length;
  phase.meta.prs = phase.meta.prs.filter((pr) => pr.url !== url);
  if (phase.meta.prs.length === before) throw new Error(`${url} is not linked to phase ${phaseId}`);
  if (phase.meta.prs.length === 0 && phase.meta.status === "in-progress") phase.meta.status = "planned";
  writePhase(phase);
  epic.updated = now;
  writeEpic(home, epic);
  return { epic, phase, added: [] };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/link.test.ts && npm run typecheck`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "add pr linking"
```

---

### Task 9: Session markers

**Files:**
- Create: `cli/lib/session.ts`, `test/session.test.ts`

**Interfaces:**
- Consumes: `readEpic`, `writeEpic`, `readPhase`, `validateMarker`, `paths`
- Produces:
  - `sessionIdFrom(env: NodeJS.ProcessEnv, override?: string): string` uses `override`, else `CLAUDE_CODE_SESSION_ID`, else throws
  - `readMarker(home: string, id: string): SessionMarker | null`
  - `writeMarker(home: string, id: string, marker: SessionMarker): void` one JSON line
  - `interface StartOptions { phase?: number | null; step?: Step | null }`
  - `startSession(home: string, id: string, epic: string, opts: StartOptions, now: string): SessionMarker` validates the epic and phase exist, appends the id to `epic.sessions` once
  - `setSessionStep(home: string, id: string, step: Step): SessionMarker`
  - `endSession(home: string, id: string): boolean` returns whether a marker existed

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NOW, SESSION, tmpHome } from "./helpers.ts";
import { createEpic, readEpic } from "../cli/lib/epic.ts";
import { newPhases } from "../cli/lib/phase.ts";
import { endSession, readMarker, sessionIdFrom, setSessionStep, startSession } from "../cli/lib/session.ts";
import { paths } from "../cli/lib/store.ts";

function setup(): string {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  return home;
}

test("sessionIdFrom prefers the override, then the env var", () => {
  assert.equal(sessionIdFrom({ CLAUDE_CODE_SESSION_ID: "env" }, "flag"), "flag");
  assert.equal(sessionIdFrom({ CLAUDE_CODE_SESSION_ID: "env" }), "env");
  assert.throws(() => sessionIdFrom({}), /no session id/);
});

test("startSession writes a one-line marker and records the session on the epic", () => {
  const home = setup();
  const marker = startSession(home, SESSION, "e", { phase: 1, step: "phase-plan" }, NOW);
  assert.deepEqual(marker, { epic: "e", phase: 1, step: "phase-plan", started: NOW });
  assert.equal(readFileSync(paths.session(home, SESSION), "utf8").trim().split("\n").length, 1);
  assert.deepEqual(readMarker(home, SESSION), marker);
  assert.deepEqual(readEpic(home, "e").sessions, [SESSION]);
  startSession(home, SESSION, "e", {}, NOW);
  assert.deepEqual(readEpic(home, "e").sessions, [SESSION], "no duplicate session ids");
});

test("startSession validates the epic and phase", () => {
  const home = setup();
  assert.throws(() => startSession(home, SESSION, "nope", {}, NOW), /no epic/);
  assert.throws(() => startSession(home, SESSION, "e", { phase: 4 }, NOW), /no phase 4/);
});

test("setSessionStep and endSession", () => {
  const home = setup();
  assert.throws(() => setSessionStep(home, SESSION, "scoping"), /no active planet session/);
  startSession(home, SESSION, "e", {}, NOW);
  assert.equal(setSessionStep(home, SESSION, "scoping").step, "scoping");
  assert.equal(endSession(home, SESSION), true);
  assert.equal(readMarker(home, SESSION), null);
  assert.equal(endSession(home, SESSION), false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/session.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement session.ts**

```ts
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import type { SessionMarker, Step } from "../schema/types.ts";
import { validateMarker } from "../schema/validate.ts";
import { readEpic, writeEpic } from "./epic.ts";
import { readPhase } from "./phase.ts";
import { paths } from "./store.ts";

export function sessionIdFrom(env: NodeJS.ProcessEnv, override?: string): string {
  const id = override ?? env.CLAUDE_CODE_SESSION_ID;
  if (!id) throw new Error("no session id: set CLAUDE_CODE_SESSION_ID or pass --session");
  return id;
}

export function readMarker(home: string, id: string): SessionMarker | null {
  const file = paths.session(home, id);
  if (!existsSync(file)) return null;
  return validateMarker(JSON.parse(readFileSync(file, "utf8")), file);
}

export function writeMarker(home: string, id: string, marker: SessionMarker): void {
  writeFileSync(paths.session(home, id), `${JSON.stringify(marker)}\n`);
}

export interface StartOptions {
  phase?: number | null;
  step?: Step | null;
}

export function startSession(home: string, id: string, epicSlug: string, opts: StartOptions, now: string): SessionMarker {
  const epic = readEpic(home, epicSlug);
  const phase = opts.phase ?? null;
  if (phase !== null) readPhase(home, epicSlug, phase);
  const marker: SessionMarker = { epic: epicSlug, phase, step: opts.step ?? null, started: now };
  writeMarker(home, id, marker);
  if (!epic.sessions.includes(id)) {
    epic.sessions.push(id);
    epic.updated = now;
    writeEpic(home, epic);
  }
  return marker;
}

export function setSessionStep(home: string, id: string, step: Step): SessionMarker {
  const marker = readMarker(home, id);
  if (!marker) throw new Error("no active planet session; run planet session start first");
  marker.step = step;
  writeMarker(home, id, marker);
  return marker;
}

export function endSession(home: string, id: string): boolean {
  const file = paths.session(home, id);
  if (!existsSync(file)) return false;
  unlinkSync(file);
  return true;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/session.test.ts && npm run typecheck`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "add session markers"
```

---

### Task 10: Proposal snapshots and outcomes

**Files:**
- Create: `cli/lib/proposal.ts`, `test/proposal.test.ts`

**Interfaces:**
- Consumes: frontmatter, `validateProposalMeta`, `writeBody`, `paths`, `NotFound`
- Produces:
  - `proposalFileName(id: number, step: string): string` → `003-phasing.md`
  - `editedPath(path: string): string` → `003-phasing.edited.md`
  - `listProposals(home: string, epic: string): Proposal[]` sorted by id, excludes `.edited.md`
  - `nextProposalId(home: string, epic: string): number`
  - `latestProposalId(home: string, epic: string): number | null`
  - `interface NewProposalInput { step: Step | "unknown"; phase: number | null; session: string; toolUse: string | null; planFile: string | null; body: string }`
  - `createProposal(home: string, epic: string, input: NewProposalInput, now: string): Proposal`
  - `readProposal(home: string, epic: string, id: number): Proposal` throws `NotFound`
  - `findProposalByToolUse(home: string, epic: string, toolUse: string): Proposal | null`
  - `latestPending(home: string, epic: string, session: string): Proposal | null`
  - `markApproved(home: string, epic: string, id: number, approvedText: string): Proposal` writes `.edited.md` and sets `edited` when the text differs after normalizing line endings and trimming
  - `markRejected(home: string, epic: string, id: number, feedback: string): Proposal`
  - `approvedText(proposal: Proposal): string` edited file if present, else the snapshot body
  - `type Destination = { kind: "plan" } | { kind: "phase"; id: number }`
  - `parseDestination(text: string): Destination` accepts `plan` or `phase:<n>`
  - `approveTo(home: string, epic: string, id: number, dest: Destination, fromText?: string): { proposal: Proposal; wrote: string }` marks approved when still pending, then writes the text to `plan.md` or the phase body

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { NOW, SESSION, tmpHome } from "./helpers.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { newPhases, readPhase } from "../cli/lib/phase.ts";
import { approveTo, createProposal, editedPath, findProposalByToolUse, latestPending, latestProposalId, listProposals, markApproved, markRejected, nextProposalId, parseDestination, proposalFileName, readProposal } from "../cli/lib/proposal.ts";
import { paths } from "../cli/lib/store.ts";

const input = { step: "phasing" as const, phase: null, session: SESSION, toolUse: "toolu_1", planFile: "/plans/x.md", body: "# Phases\n\n1. A\n2. B\n" };

function setup(): string {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  return home;
}

test("createProposal numbers snapshots and stores the plan verbatim", () => {
  const home = setup();
  assert.equal(nextProposalId(home, "e"), 1);
  assert.equal(latestProposalId(home, "e"), null);
  const p = createProposal(home, "e", input, NOW);
  assert.equal(proposalFileName(p.meta.id, p.meta.step), "001-phasing.md");
  assert.match(p.path, /001-phasing\.md$/);
  assert.equal(p.body, input.body);
  assert.equal(p.meta.outcome, "pending");
  assert.equal(p.meta.tool_use, "toolu_1");
  const q = createProposal(home, "e", { ...input, step: "unknown", toolUse: null }, NOW);
  assert.equal(q.meta.id, 2);
  assert.equal(latestProposalId(home, "e"), 2);
  assert.deepEqual(listProposals(home, "e").map((x) => x.meta.id), [1, 2]);
  assert.deepEqual(readProposal(home, "e", 1).meta, p.meta);
});

test("findProposalByToolUse and latestPending", () => {
  const home = setup();
  const p1 = createProposal(home, "e", input, NOW);
  const p2 = createProposal(home, "e", { ...input, toolUse: "toolu_2" }, NOW);
  assert.equal(findProposalByToolUse(home, "e", "toolu_2")?.meta.id, p2.meta.id);
  assert.equal(findProposalByToolUse(home, "e", "nope"), null);
  assert.equal(latestPending(home, "e", SESSION)?.meta.id, 2);
  markRejected(home, "e", 2, "no");
  assert.equal(latestPending(home, "e", SESSION)?.meta.id, p1.meta.id);
  assert.equal(latestPending(home, "e", "other-session"), null);
});

test("markApproved records edits only when the text differs", () => {
  const home = setup();
  const p = createProposal(home, "e", input, NOW);
  const same = markApproved(home, "e", p.meta.id, `${input.body}\n`);
  assert.equal(same.meta.outcome, "approved");
  assert.equal(same.meta.edited, false);
  assert.ok(!existsSync(editedPath(same.path)));

  const q = createProposal(home, "e", input, NOW);
  const edited = markApproved(home, "e", q.meta.id, "# Phases\n\n1. B\n2. A\n");
  assert.equal(edited.meta.edited, true);
  assert.equal(readFileSync(editedPath(edited.path), "utf8"), "# Phases\n\n1. B\n2. A\n");
  assert.deepEqual(listProposals(home, "e").map((x) => x.meta.id), [1, 2], "edited file is not a proposal");
});

test("markRejected stores the message verbatim", () => {
  const home = setup();
  const p = createProposal(home, "e", input, NOW);
  const r = markRejected(home, "e", p.meta.id, 'Comments on the plan:\n[Re: "2. B"] should be first');
  assert.equal(r.meta.outcome, "rejected");
  assert.match(r.meta.feedback ?? "", /should be first/);
});

test("parseDestination and approveTo", () => {
  assert.deepEqual(parseDestination("plan"), { kind: "plan" });
  assert.deepEqual(parseDestination("phase:3"), { kind: "phase", id: 3 });
  assert.throws(() => parseDestination("phase:x"), /--to must be plan or phase:<n>/);

  const home = setup();
  const p = createProposal(home, "e", input, NOW);
  markApproved(home, "e", p.meta.id, "# Edited\n");
  const r = approveTo(home, "e", p.meta.id, { kind: "plan" });
  assert.equal(r.wrote, paths.plan(home, "e"));
  assert.equal(readFileSync(paths.plan(home, "e"), "utf8"), "# Edited\n");

  const q = createProposal(home, "e", { ...input, step: "phase-plan", phase: 1 }, NOW);
  const r2 = approveTo(home, "e", q.meta.id, { kind: "phase", id: 1 });
  assert.equal(r2.proposal.meta.outcome, "approved", "pending proposal is approved by approveTo");
  assert.equal(readPhase(home, "e", 1).body, input.body);
  assert.match(r2.wrote, /01-a\.md$/);

  const s = createProposal(home, "e", input, NOW);
  approveTo(home, "e", s.meta.id, { kind: "plan" }, "# From file\n");
  assert.equal(readFileSync(paths.plan(home, "e"), "utf8"), "# From file\n");
  assert.equal(readProposal(home, "e", s.meta.id).meta.edited, true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/proposal.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement proposal.ts**

```ts
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Proposal, ProposalMeta, Step } from "../schema/types.ts";
import { validateProposalMeta } from "../schema/validate.ts";
import { NotFound } from "./epic.ts";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.ts";
import { writeBody } from "./phase.ts";
import { paths } from "./store.ts";

export function proposalFileName(id: number, step: string): string {
  return `${String(id).padStart(3, "0")}-${step}.md`;
}

export function editedPath(path: string): string {
  return path.replace(/\.md$/, ".edited.md");
}

function readProposalFile(path: string): Proposal {
  const { data, body } = parseFrontmatter(readFileSync(path, "utf8"));
  return { meta: validateProposalMeta(data, path), body, path };
}

function writeProposal(proposal: Proposal): void {
  writeFileSync(proposal.path, serializeFrontmatter({ ...proposal.meta }, proposal.body));
}

export function listProposals(home: string, epic: string): Proposal[] {
  const dir = paths.proposals(home, epic);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{3}-[a-z-]+\.md$/.test(f))
    .map((f) => readProposalFile(join(dir, f)))
    .sort((a, b) => a.meta.id - b.meta.id);
}

export function latestProposalId(home: string, epic: string): number | null {
  const all = listProposals(home, epic);
  return all.length ? all[all.length - 1].meta.id : null;
}

export function nextProposalId(home: string, epic: string): number {
  return (latestProposalId(home, epic) ?? 0) + 1;
}

export interface NewProposalInput {
  step: Step | "unknown";
  phase: number | null;
  session: string;
  toolUse: string | null;
  planFile: string | null;
  body: string;
}

export function createProposal(home: string, epic: string, input: NewProposalInput, now: string): Proposal {
  const dir = paths.proposals(home, epic);
  mkdirSync(dir, { recursive: true });
  const meta: ProposalMeta = {
    id: nextProposalId(home, epic),
    step: input.step,
    phase: input.phase,
    session: input.session,
    tool_use: input.toolUse,
    plan_file: input.planFile,
    created: now,
    outcome: "pending",
    edited: false,
    feedback: null,
  };
  const proposal: Proposal = { meta, body: input.body, path: join(dir, proposalFileName(meta.id, meta.step)) };
  writeProposal(proposal);
  return proposal;
}

export function readProposal(home: string, epic: string, id: number): Proposal {
  const found = listProposals(home, epic).find((p) => p.meta.id === id);
  if (!found) throw new NotFound(`no proposal ${id} in epic '${epic}'`);
  return found;
}

export function findProposalByToolUse(home: string, epic: string, toolUse: string): Proposal | null {
  return listProposals(home, epic).find((p) => p.meta.tool_use === toolUse) ?? null;
}

export function latestPending(home: string, epic: string, session: string): Proposal | null {
  const pending = listProposals(home, epic).filter((p) => p.meta.outcome === "pending" && p.meta.session === session);
  return pending.length ? pending[pending.length - 1] : null;
}

function normalize(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

export function markApproved(home: string, epic: string, id: number, approvedText: string): Proposal {
  const proposal = readProposal(home, epic, id);
  const edited = normalize(approvedText) !== normalize(proposal.body);
  if (edited) writeFileSync(editedPath(proposal.path), approvedText.endsWith("\n") ? approvedText : `${approvedText}\n`);
  proposal.meta.outcome = "approved";
  proposal.meta.edited = edited;
  writeProposal(proposal);
  return proposal;
}

export function markRejected(home: string, epic: string, id: number, feedback: string): Proposal {
  const proposal = readProposal(home, epic, id);
  proposal.meta.outcome = "rejected";
  proposal.meta.feedback = feedback;
  writeProposal(proposal);
  return proposal;
}

export function approvedText(proposal: Proposal): string {
  const edited = editedPath(proposal.path);
  return existsSync(edited) ? readFileSync(edited, "utf8") : proposal.body;
}

export type Destination = { kind: "plan" } | { kind: "phase"; id: number };

export function parseDestination(text: string): Destination {
  if (text === "plan") return { kind: "plan" };
  const m = /^phase:(\d+)$/.exec(text);
  if (!m) throw new Error("--to must be plan or phase:<n>");
  return { kind: "phase", id: Number(m[1]) };
}

export function approveTo(home: string, epic: string, id: number, dest: Destination, fromText?: string): { proposal: Proposal; wrote: string } {
  let proposal = readProposal(home, epic, id);
  const text = fromText ?? approvedText(proposal);
  if (proposal.meta.outcome !== "approved" || fromText !== undefined) proposal = markApproved(home, epic, id, text);
  const body = text.endsWith("\n") ? text : `${text}\n`;
  if (dest.kind === "plan") {
    const file = paths.plan(home, epic);
    writeFileSync(file, body);
    return { proposal, wrote: file };
  }
  const phase = writeBody(home, epic, dest.id, body);
  return { proposal, wrote: phase.path };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/proposal.test.ts && npm run typecheck`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "add proposal snapshots and outcomes"
```

---

### Task 11: gh client interface and fake

**Files:**
- Create: `cli/lib/gh.ts`, `cli/lib/context.ts`
- Modify: `test/helpers.ts`

**Interfaces:**
- Produces, in `gh.ts`:
  - `interface PrInfo { url: string; state: PrState; merged_at: string | null }`
  - `interface PrFile { path: string; additions: number; deletions: number }`
  - `interface Gh { prStates(urls: string[]): Promise<PrInfo[]>; prFiles(url: string): Promise<PrFile[]> }`
  - `class GhUnavailable extends Error` thrown when `gh` is missing, unauthenticated, or offline
  - `realGh(): Gh` one GraphQL call per 50 URLs, `gh pr view --json files` for files
- Produces, in `context.ts`:
  - `interface Ctx { home: string; gh: Gh; now: () => string; env: NodeJS.ProcessEnv; stdin: () => string }`
  - `interface CommandResult { json: unknown; text: string; exitCode?: number }`
  - `type Command = (args: string[], ctx: Ctx) => Promise<CommandResult>`
- Produces, in `test/helpers.ts`:
  - `fakeGh(states?: Record<string, PrInfo>, files?: Record<string, PrFile[]>, unavailable?: boolean): Gh & { calls: string[] }`
  - `ctx(home: string, overrides?: Partial<Ctx>): Ctx` with `now` fixed to `NOW` and `CLAUDE_CODE_SESSION_ID` set to `SESSION`

The real client has no unit test. It is exercised in Task 20.

- [ ] **Step 1: Write context.ts**

```ts
import type { Gh } from "./gh.ts";

export interface Ctx {
  home: string;
  gh: Gh;
  now: () => string;
  env: NodeJS.ProcessEnv;
  stdin: () => string;
}

export interface CommandResult {
  json: unknown;
  text: string;
  exitCode?: number;
}

export type Command = (args: string[], ctx: Ctx) => Promise<CommandResult>;
```

- [ ] **Step 2: Write gh.ts**

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PrState } from "../schema/types.ts";

const execFileAsync = promisify(execFile);

export interface PrInfo {
  url: string;
  state: PrState;
  merged_at: string | null;
}

export interface PrFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface Gh {
  prStates(urls: string[]): Promise<PrInfo[]>;
  prFiles(url: string): Promise<PrFile[]>;
}

export class GhUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GhUnavailable";
  }
}

async function gh(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("gh", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string };
    const stderr = (e.stderr ?? "").trim();
    if (e.code === "ENOENT") throw new GhUnavailable("gh is not installed");
    if (/not logged in|authentication|could not resolve host|network is unreachable|connection refused/i.test(stderr)) {
      throw new GhUnavailable(stderr.split("\n")[0]);
    }
    throw new Error(stderr || e.message);
  }
}

interface GraphqlPr {
  url: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  mergedAt: string | null;
}

export function realGh(): Gh {
  return {
    async prStates(urls) {
      const out: PrInfo[] = [];
      for (let i = 0; i < urls.length; i += 50) {
        const chunk = urls.slice(i, i + 50);
        const fields = chunk
          .map((u, j) => `p${j}: resource(url: ${JSON.stringify(u)}) { ... on PullRequest { url state mergedAt } }`)
          .join("\n");
        const raw = JSON.parse(await gh(["api", "graphql", "-f", `query={ ${fields} }`])) as { data: Record<string, GraphqlPr | null> };
        chunk.forEach((u, j) => {
          const pr = raw.data[`p${j}`];
          if (!pr) throw new Error(`PR not found: ${u}`);
          out.push({ url: u, state: pr.state.toLowerCase() as PrState, merged_at: pr.mergedAt });
        });
      }
      return out;
    },
    async prFiles(url) {
      const raw = JSON.parse(await gh(["pr", "view", url, "--json", "files"])) as { files: PrFile[] };
      return raw.files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions }));
    },
  };
}
```

- [ ] **Step 3: Extend test/helpers.ts**

Replace the file with:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Ctx } from "../cli/lib/context.ts";
import type { Gh, PrFile, PrInfo } from "../cli/lib/gh.ts";
import { GhUnavailable } from "../cli/lib/gh.ts";
import { ensureStore } from "../cli/lib/store.ts";

export const NOW = "2026-09-03T15:00:00.000Z";
export const SESSION = "sess-1";

export function tmpHome(): string {
  const home = mkdtempSync(join(tmpdir(), "planet-"));
  ensureStore(home);
  return home;
}

export type FakeGh = Gh & { calls: string[] };

export function fakeGh(states: Record<string, PrInfo> = {}, files: Record<string, PrFile[]> = {}, unavailable = false): FakeGh {
  const calls: string[] = [];
  return {
    calls,
    async prStates(urls) {
      calls.push(`prStates:${urls.length}`);
      if (unavailable) throw new GhUnavailable("offline");
      return urls.map((u) => {
        const info = states[u];
        if (!info) throw new Error(`PR not found: ${u}`);
        return info;
      });
    },
    async prFiles(url) {
      calls.push(`prFiles:${url}`);
      if (unavailable) throw new GhUnavailable("offline");
      return files[url] ?? [];
    },
  };
}

export function ctx(home: string, overrides: Partial<Ctx> = {}): Ctx {
  return {
    home,
    gh: fakeGh(),
    now: () => NOW,
    env: { CLAUDE_CODE_SESSION_ID: SESSION },
    stdin: () => "",
    ...overrides,
  };
}
```

- [ ] **Step 4: Typecheck and run the existing tests**

Run: `npm test && npm run typecheck`
Expected: all earlier tests still pass, typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "add gh client interface and test fakes"
```

---

### Task 12: CLI entry, argument parsing, and epic commands

**Files:**
- Create: `cli/lib/args.ts`, `cli/lib/view.ts`, `cli/commands/epic.ts`, `test/cli-epic.test.ts`
- Modify: `cli/planet.ts` (replace the placeholder), `test/helpers.ts` (add `run`), `test/smoke.test.ts`

**Interfaces:**
- Produces, in `args.ts`:
  - `type OptionSpec = { type: "string" | "boolean"; short?: string; multiple?: boolean }`
  - `interface Parsed { positionals: string[]; values: Record<string, string | boolean | string[] | undefined> }`
  - `parse(args: string[], options: Record<string, OptionSpec>): Parsed` strict parseArgs with positionals allowed
  - `need(positionals: string[], index: number, what: string): string`
  - `needInt(positionals: string[], index: number, what: string): number`
  - `optString(values, name): string | undefined`, `needString(values, name): string`, `optList(values, name): string[]`, `flag(values, name): boolean`
- Produces, in `view.ts`:
  - `interface EpicView { epic: Epic; phases: Array<PhaseMeta & { path: string }>; paths: { dir: string; plan: string | null; retros: string[]; latest_proposal: string | null; prompts: string | null; notes: string | null } }`
  - `epicView(home: string, slug: string): EpicView`
- Produces, in `planet.ts`:
  - `main(argv: string[], ctx: Ctx, out: { stdout(s: string): void; stderr(s: string): void }): Promise<number>`
  - `defaultCtx(): Ctx`
  - `COMMANDS: Record<string, Command>` registry, extended by later tasks
- Produces, in `commands/epic.ts`: `epicCommand: Command` handling `new`, `set`, `show`, `resolve`
- Produces, in `test/helpers.ts`: `run(argv: string[], c: Ctx): Promise<{ code: number; stdout: string; stderr: string; json: unknown }>`

- [ ] **Step 1: Write the failing tests**

`test/cli-epic.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { ctx, run, tmpHome } from "./helpers.ts";
import { readEpic } from "../cli/lib/epic.ts";
import { git } from "../cli/lib/store.ts";
import type { EpicView } from "../cli/lib/view.ts";

test("planet with no command prints usage; unknown command exits 2", async () => {
  const home = tmpHome();
  const usage = await run([], ctx(home));
  assert.equal(usage.code, 0);
  assert.match(usage.stdout, /usage: planet/);
  const bad = await run(["frobnicate"], ctx(home));
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /unknown command 'frobnicate'/);
});

test("epic new creates and commits; errors are one line or json", async () => {
  const home = tmpHome();
  const r = await run(["epic", "new", "gql", "--title", "GQL migration", "--repo", "closeio/close-ui", "--linear", "CRM-1", "--linear", "CRM-2"], ctx(home));
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "created epic gql\n");
  assert.deepEqual(readEpic(home, "gql").linear, ["CRM-1", "CRM-2"]);
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "gql: create epic");

  const dup = await run(["epic", "new", "gql", "--title", "x", "--repo", "o/r"], ctx(home));
  assert.equal(dup.code, 1);
  assert.equal(dup.stderr, "planet: epic 'gql' already exists\n");

  const dupJson = await run(["epic", "new", "gql", "--title", "x", "--repo", "o/r", "--json"], ctx(home));
  assert.equal(dupJson.code, 1);
  assert.deepEqual(dupJson.json, { error: "epic 'gql' already exists" });

  const missing = await run(["epic", "new", "other", "--repo", "o/r"], ctx(home));
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /missing --title/);
});

test("epic set changes status, linear, title with manual transitions only", async () => {
  const home = tmpHome();
  await run(["epic", "new", "gql", "--title", "GQL", "--repo", "o/r"], ctx(home));
  const r = await run(["epic", "set", "gql", "--status", "paused", "--title", "GQL v2", "--json"], ctx(home));
  assert.equal(r.code, 0);
  const epic = readEpic(home, "gql");
  assert.equal(epic.status, "paused");
  assert.equal(epic.title, "GQL v2");
  const bad = await run(["epic", "set", "gql", "--status", "shipped"], ctx(home));
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /--status must be paused, abandoned, or active/);
});

test("epic show returns frontmatter and paths, never bodies", async () => {
  const home = tmpHome();
  await run(["epic", "new", "gql", "--title", "GQL", "--repo", "o/r"], ctx(home));
  const r = await run(["epic", "show", "gql", "--json"], ctx(home));
  const view = r.json as EpicView;
  assert.equal(view.epic.slug, "gql");
  assert.deepEqual(view.phases, []);
  assert.equal(view.paths.plan, null);
  assert.equal(view.paths.latest_proposal, null);
  assert.match(view.paths.dir, /epics\/gql$/);
  assert.equal(JSON.stringify(view).includes('"body"'), false);
});

test("epic resolve returns candidates", async () => {
  const home = tmpHome();
  await run(["epic", "new", "gql-migration", "--title", "GQL migration", "--repo", "o/r"], ctx(home));
  await run(["epic", "new", "gql-cleanup", "--title", "Cleanup", "--repo", "o/r"], ctx(home));
  const one = await run(["epic", "resolve", "clean", "--json"], ctx(home));
  assert.deepEqual((one.json as { candidates: string[] }).candidates, ["gql-cleanup"]);
  const many = await run(["epic", "resolve", "gql"], ctx(home));
  assert.equal(many.stdout, "gql-cleanup\ngql-migration\n");
  const none = await run(["epic", "resolve", "zzz"], ctx(home));
  assert.equal(none.stdout, "no epic matches 'zzz'\n");
});
```

Update `test/smoke.test.ts` so it matches the real usage text:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("bin/planet runs under node 24", () => {
  const out = execFileSync("bin/planet", ["--help"], { encoding: "utf8" });
  assert.match(out, /usage: planet/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/cli-epic.test.ts`
Expected: FAIL, `run` is not exported from helpers.

- [ ] **Step 3: Implement args.ts**

```ts
import { parseArgs } from "node:util";

export type OptionSpec = { type: "string" | "boolean"; short?: string; multiple?: boolean };

export interface Parsed {
  positionals: string[];
  values: Record<string, string | boolean | string[] | undefined>;
}

export function parse(args: string[], options: Record<string, OptionSpec>): Parsed {
  const result = parseArgs({ args, options, allowPositionals: true, strict: true });
  return { positionals: result.positionals, values: result.values as Parsed["values"] };
}

export function need(positionals: string[], index: number, what: string): string {
  const value = positionals[index];
  if (value === undefined) throw new Error(`missing ${what}`);
  return value;
}

export function needInt(positionals: string[], index: number, what: string): number {
  const value = Number(need(positionals, index, what));
  if (!Number.isInteger(value)) throw new Error(`${what} must be an integer`);
  return value;
}

export function optString(values: Parsed["values"], name: string): string | undefined {
  const value = values[name];
  return typeof value === "string" ? value : undefined;
}

export function needString(values: Parsed["values"], name: string): string {
  const value = optString(values, name);
  if (value === undefined) throw new Error(`missing --${name}`);
  return value;
}

export function optList(values: Parsed["values"], name: string): string[] {
  const value = values[name];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
}

export function flag(values: Parsed["values"], name: string): boolean {
  return values[name] === true;
}
```

- [ ] **Step 4: Implement view.ts**

```ts
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Epic, PhaseMeta } from "../schema/types.ts";
import { readEpic } from "./epic.ts";
import { listPhases } from "./phase.ts";
import { listProposals } from "./proposal.ts";
import { paths } from "./store.ts";

export interface EpicView {
  epic: Epic;
  phases: Array<PhaseMeta & { path: string }>;
  paths: {
    dir: string;
    plan: string | null;
    retros: string[];
    latest_proposal: string | null;
    prompts: string | null;
    notes: string | null;
  };
}

function ifExists(path: string): string | null {
  return existsSync(path) ? path : null;
}

export function epicView(home: string, slug: string): EpicView {
  const epic = readEpic(home, slug);
  const phases = listPhases(home, slug);
  const proposals = listProposals(home, slug);
  const retrosDir = paths.retros(home, slug);
  const retros = existsSync(retrosDir)
    ? readdirSync(retrosDir).filter((f) => f.endsWith(".md")).sort().map((f) => join(retrosDir, f))
    : [];
  return {
    epic,
    phases: phases.map((p) => ({ ...p.meta, path: p.path })),
    paths: {
      dir: paths.epic(home, slug),
      plan: ifExists(paths.plan(home, slug)),
      retros,
      latest_proposal: proposals.length ? proposals[proposals.length - 1].path : null,
      prompts: ifExists(paths.prompts(home, slug)),
      notes: ifExists(paths.notes(home, slug)),
    },
  };
}
```

- [ ] **Step 5: Implement commands/epic.ts**

```ts
import type { Command, CommandResult, Ctx } from "../lib/context.ts";
import { need, needString, optList, optString, parse } from "../lib/args.ts";
import { createEpic, listEpics, readEpic, resolveEpics, writeEpic } from "../lib/epic.ts";
import { listPhases } from "../lib/phase.ts";
import { commit } from "../lib/store.ts";
import { epicView } from "../lib/view.ts";

const MANUAL_STATUSES = ["paused", "abandoned", "active"] as const;
type ManualStatus = (typeof MANUAL_STATUSES)[number];

async function epicNew(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, {
    title: { type: "string" },
    repo: { type: "string" },
    linear: { type: "string", multiple: true },
  });
  const slug = need(positionals, 0, "epic slug");
  const epic = createEpic(ctx.home, { slug, title: needString(values, "title"), repo: needString(values, "repo"), linear: optList(values, "linear") }, ctx.now());
  commit(ctx.home, `${slug}: create epic`);
  return { json: epic, text: `created epic ${slug}` };
}

async function epicSet(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, {
    status: { type: "string" },
    title: { type: "string" },
    linear: { type: "string", multiple: true },
  });
  const slug = need(positionals, 0, "epic slug");
  const epic = readEpic(ctx.home, slug);
  const changes: string[] = [];
  const status = optString(values, "status");
  if (status !== undefined) {
    if (!(MANUAL_STATUSES as readonly string[]).includes(status)) throw new Error("--status must be paused, abandoned, or active");
    epic.status = status as ManualStatus;
    changes.push(`status ${status}`);
  }
  const title = optString(values, "title");
  if (title !== undefined) {
    epic.title = title;
    changes.push("title");
  }
  const linear = optList(values, "linear");
  if (linear.length) {
    epic.linear = linear;
    changes.push("linear");
  }
  if (changes.length === 0) throw new Error("nothing to set: pass --status, --title, or --linear");
  epic.updated = ctx.now();
  writeEpic(ctx.home, epic);
  commit(ctx.home, `${slug}: set ${changes.join(", ")}`);
  return { json: epic, text: `updated ${slug}: ${changes.join(", ")}` };
}

async function epicShow(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals } = parse(args, {});
  const view = epicView(ctx.home, need(positionals, 0, "epic slug"));
  const lines = [
    `${view.epic.slug}  ${view.epic.title}  [${view.epic.status}]  ${view.epic.repo}`,
    ...view.phases.map((p) => `  ${String(p.id).padStart(2, "0")} ${p.slug}  ${p.status}  prs=${p.prs.length}`),
    `  plan: ${view.paths.plan ?? "none"}`,
  ];
  return { json: view, text: lines.join("\n") };
}

async function epicResolve(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals } = parse(args, {});
  const text = need(positionals, 0, "text to resolve");
  const matches = resolveEpics(listEpics(ctx.home), text, (slug) => listPhases(ctx.home, slug).map((p) => p.meta));
  const candidates = matches.map((e) => e.slug);
  return {
    json: { query: text, candidates, epics: matches },
    text: candidates.length ? candidates.join("\n") : `no epic matches '${text}'`,
  };
}

export const epicCommand: Command = async (args, ctx) => {
  const [sub, ...rest] = args;
  switch (sub) {
    case "new": return epicNew(rest, ctx);
    case "set": return epicSet(rest, ctx);
    case "show": return epicShow(rest, ctx);
    case "resolve": return epicResolve(rest, ctx);
    default: throw new Error("usage: planet epic new|set|show|resolve");
  }
};
```

- [ ] **Step 6: Replace cli/planet.ts**

```ts
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { Command, Ctx } from "./lib/context.ts";
import { realGh } from "./lib/gh.ts";
import { ensureStore, planetHome } from "./lib/store.ts";
import { epicCommand } from "./commands/epic.ts";

export const COMMANDS: Record<string, Command> = {
  epic: epicCommand,
};

const USAGE = `usage: planet <command> [args] [--json]

commands:
  status [--all] [--no-sync] [--force]
  open <text> [--step <name>]
  epic new|set|show|resolve
  phase new|write|set
  link <epic> <phase> <pr-url>...
  unlink <epic> <phase> <pr-url>
  session start|step|end
  propose <epic> <step> --file <path>
  proposal approve <epic> <id> --to plan|phase:<n>
  sync [epic] [--force]
  pr files <epic> <phase>
  feedback report [epic]
  check
  capture   (hook entry, reads Claude Code json on stdin)
`;

export interface Output {
  stdout(text: string): void;
  stderr(text: string): void;
}

export function defaultCtx(): Ctx {
  return {
    home: planetHome(),
    gh: realGh(),
    now: () => new Date().toISOString(),
    env: process.env,
    stdin: () => readFileSync(0, "utf8"),
  };
}

function withNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

export async function main(argv: string[], ctx: Ctx, out: Output): Promise<number> {
  const json = argv.includes("--json");
  const [name, ...rest] = argv.filter((a) => a !== "--json");
  if (!name || name === "--help" || name === "-h") {
    out.stdout(USAGE);
    return 0;
  }
  const command = COMMANDS[name];
  if (!command) {
    out.stderr(`planet: unknown command '${name}'\n${USAGE}`);
    return 2;
  }
  ensureStore(ctx.home);
  try {
    const result = await command(rest, ctx);
    if (json) out.stdout(`${JSON.stringify(result.json, null, 2)}\n`);
    else if (result.text) out.stdout(withNewline(result.text));
    return result.exitCode ?? 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) out.stdout(`${JSON.stringify({ error: message })}\n`);
    else out.stderr(`planet: ${message}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2), defaultCtx(), {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
  }).then((code) => {
    process.exitCode = code;
  });
}
```

- [ ] **Step 7: Add `run` to test/helpers.ts**

Append:

```ts
import { main } from "../cli/planet.ts";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  json: unknown;
}

export async function run(argv: string[], c: Ctx): Promise<RunResult> {
  let stdout = "";
  let stderr = "";
  const code = await main(argv, c, {
    stdout: (s) => { stdout += s; },
    stderr: (s) => { stderr += s; },
  });
  let json: unknown = null;
  if (argv.includes("--json")) {
    try { json = JSON.parse(stdout); } catch { json = null; }
  }
  return { code, stdout, stderr, json };
}
```

Move the new `import` to the top of the file with the others.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: all pass, including the 5 new tests and the updated smoke test.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "add cli entry, argument parsing, and epic commands"
```

---

### Task 13: Phase, link, session, proposal, and check commands

**Files:**
- Create: `cli/commands/phase.ts`, `cli/commands/link.ts`, `cli/commands/session.ts`, `cli/commands/proposal.ts`, `cli/commands/check.ts`, `test/cli-structure.test.ts`
- Modify: `cli/planet.ts` (register `phase`, `link`, `unlink`, `session`, `propose`, `proposal`, `check`)

**Interfaces:**
- Consumes: everything from Tasks 6 to 12
- Produces: `phaseCommand`, `linkCommand`, `unlinkCommand`, `sessionCommand`, `proposeCommand`, `proposalCommand`, `checkCommand`, each of type `Command`

Argument contracts:

```
planet phase new <epic> <slug> --title <t> [--linear ID...]
planet phase new <epic> --phase <slug>:<title> [--phase <slug>:<title>...]
planet phase write <epic> <id> --body-file <path>
planet phase set <epic> <id> [--status planned|reviewed] [--linear ID...]
planet link <epic> <id> <pr-url>...
planet unlink <epic> <id> <pr-url>
planet session start <epic> [--phase <id>] [--step <name>] [--session <id>]
planet session step <name> [--session <id>]
planet session end [--session <id>]
planet propose <epic> <step> --file <path> [--phase <id>] [--session <id>]
planet proposal approve <epic> <id> --to plan|phase:<n> [--from <path>]
planet check
```

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NOW, SESSION, ctx, run, tmpHome } from "./helpers.ts";
import { readEpic } from "../cli/lib/epic.ts";
import { readPhase } from "../cli/lib/phase.ts";
import { createProposal, readProposal } from "../cli/lib/proposal.ts";
import { readMarker } from "../cli/lib/session.ts";
import { git, paths } from "../cli/lib/store.ts";

const PR = "https://github.com/o/r/pull/5";

async function setup(): Promise<string> {
  const home = tmpHome();
  await run(["epic", "new", "e", "--title", "E", "--repo", "o/r"], ctx(home));
  return home;
}

test("phase new: single and batch forms, one commit for the batch", async () => {
  const home = await setup();
  const one = await run(["phase", "new", "e", "codegen", "--title", "Codegen", "--linear", "CRM-9"], ctx(home));
  assert.equal(one.code, 0);
  assert.deepEqual(readPhase(home, "e", 1).meta.linear, ["CRM-9"]);
  const before = git(home, ["rev-list", "--count", "HEAD"]).trim();
  const batch = await run(["phase", "new", "e", "--phase", "hooks:Write hooks", "--phase", "cleanup:Remove REST: the last bits", "--json"], ctx(home));
  assert.equal(batch.code, 0);
  assert.equal(readPhase(home, "e", 3).meta.title, "Remove REST: the last bits");
  assert.equal(Number(git(home, ["rev-list", "--count", "HEAD"]).trim()), Number(before) + 1);
  const bad = await run(["phase", "new", "e"], ctx(home));
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /pass <slug> --title or --phase slug:title/);
});

test("phase write and set", async () => {
  const home = await setup();
  await run(["phase", "new", "e", "a", "--title", "A"], ctx(home));
  const body = join(home, "body.md");
  writeFileSync(body, "# Detailed plan\n");
  assert.equal((await run(["phase", "write", "e", "1", "--body-file", body], ctx(home))).code, 0);
  assert.equal(readPhase(home, "e", 1).body, "# Detailed plan\n");
  assert.equal((await run(["phase", "set", "e", "1", "--status", "planned"], ctx(home))).code, 0);
  assert.equal(readPhase(home, "e", 1).meta.status, "planned");
  const bad = await run(["phase", "set", "e", "1", "--status", "shipped"], ctx(home));
  assert.match(bad.stderr, /--status must be planned or reviewed/);
});

test("link and unlink", async () => {
  const home = await setup();
  await run(["phase", "new", "e", "a", "--title", "A"], ctx(home));
  const r = await run(["link", "e", "1", PR, "--json"], ctx(home));
  assert.equal(r.code, 0);
  assert.equal(readPhase(home, "e", 1).meta.status, "in-progress");
  assert.equal(readEpic(home, "e").status, "active");
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), `e: link phase 1 to ${PR}`);
  const u = await run(["unlink", "e", "1", PR], ctx(home));
  assert.equal(u.code, 0);
  assert.deepEqual(readPhase(home, "e", 1).meta.prs, []);
});

test("session start, step, end use the env session id or --session", async () => {
  const home = await setup();
  await run(["phase", "new", "e", "a", "--title", "A"], ctx(home));
  const s = await run(["session", "start", "e", "--phase", "1", "--step", "phase-plan", "--json"], ctx(home));
  assert.equal(s.code, 0);
  assert.deepEqual(readMarker(home, SESSION), { epic: "e", phase: 1, step: "phase-plan", started: NOW });
  const badStep = await run(["session", "step", "napping"], ctx(home));
  assert.match(badStep.stderr, /step must be one of/);
  assert.equal((await run(["session", "step", "retro"], ctx(home))).code, 0);
  assert.equal(readMarker(home, SESSION)?.step, "retro");
  const other = await run(["session", "start", "e", "--session", "sess-2"], ctx(home, { env: {} }));
  assert.equal(other.code, 0);
  assert.ok(readMarker(home, "sess-2"));
  const noId = await run(["session", "end"], ctx(home, { env: {} }));
  assert.match(noId.stderr, /no session id/);
  assert.equal((await run(["session", "end"], ctx(home))).code, 0);
  assert.equal(readMarker(home, SESSION), null);
});

test("propose and proposal approve --to", async () => {
  const home = await setup();
  await run(["phase", "new", "e", "a", "--title", "A"], ctx(home));
  const file = join(home, "draft.md");
  writeFileSync(file, "# Draft phase plan\n");
  const p = await run(["propose", "e", "phase-plan", "--file", file, "--phase", "1", "--json"], ctx(home));
  assert.equal(p.code, 0);
  assert.equal(readProposal(home, "e", 1).body, "# Draft phase plan\n");
  const a = await run(["proposal", "approve", "e", "1", "--to", "phase:1"], ctx(home));
  assert.equal(a.code, 0);
  assert.equal(readPhase(home, "e", 1).body, "# Draft phase plan\n");
  assert.equal(readProposal(home, "e", 1).meta.outcome, "approved");
  createProposal(home, "e", { step: "scoping", phase: null, session: SESSION, toolUse: null, planFile: null, body: "# Scope\n" }, NOW);
  const plan = await run(["proposal", "approve", "e", "2", "--to", "plan"], ctx(home));
  assert.equal(plan.code, 0);
  assert.equal(readFileSync(paths.plan(home, "e"), "utf8"), "# Scope\n");
  const bad = await run(["proposal", "approve", "e", "2", "--to", "nowhere"], ctx(home));
  assert.match(bad.stderr, /--to must be plan or phase:<n>/);
});

test("check reports every invalid file and exits 1", async () => {
  const home = await setup();
  await run(["phase", "new", "e", "a", "--title", "A"], ctx(home));
  assert.equal((await run(["check"], ctx(home))).code, 0);
  writeFileSync(join(home, "epics", "e", "phases", "01-a.md"), "---\nid: 1\nslug: a\ntitle: A\nstatus: bogus\n---\n");
  writeFileSync(paths.session(home, "s9"), "{\"epic\": 5}\n");
  const r = await run(["check", "--json"], ctx(home));
  assert.equal(r.code, 1);
  const errors = (r.json as { errors: { file: string; message: string }[] }).errors;
  assert.equal(errors.length, 2);
  assert.match(errors[0].message, /status must be one of/);
  assert.match(errors[1].message, /epic must be a non-empty string/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/cli-structure.test.ts`
Expected: FAIL with `unknown command 'phase'`.

- [ ] **Step 3: Implement commands/phase.ts**

```ts
import { readFileSync } from "node:fs";
import type { Command, CommandResult, Ctx } from "../lib/context.ts";
import { need, needInt, needString, optList, optString, parse } from "../lib/args.ts";
import { readEpic, writeEpic } from "../lib/epic.ts";
import { recomputeEpicStatus } from "../lib/lifecycle.ts";
import { listPhases, newPhases, setPhaseLinear, setPhaseStatus, writeBody } from "../lib/phase.ts";
import type { NewPhaseInput } from "../lib/phase.ts";
import { commit } from "../lib/store.ts";

async function phaseNew(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, {
    title: { type: "string" },
    linear: { type: "string", multiple: true },
    phase: { type: "string", multiple: true },
  });
  const epic = need(positionals, 0, "epic slug");
  const inputs: NewPhaseInput[] = [];
  const slug = positionals[1];
  if (slug !== undefined) inputs.push({ slug, title: needString(values, "title"), linear: optList(values, "linear") });
  for (const pair of optList(values, "phase")) {
    const colon = pair.indexOf(":");
    if (colon <= 0 || colon === pair.length - 1) throw new Error(`--phase must be slug:title, got '${pair}'`);
    inputs.push({ slug: pair.slice(0, colon), title: pair.slice(colon + 1) });
  }
  if (inputs.length === 0) throw new Error("pass <slug> --title or --phase slug:title");
  readEpic(ctx.home, epic);
  const created = newPhases(ctx.home, epic, inputs);
  const epicDoc = readEpic(ctx.home, epic);
  epicDoc.updated = ctx.now();
  writeEpic(ctx.home, epicDoc);
  commit(ctx.home, `${epic}: add phase${created.length > 1 ? "s" : ""} ${created.map((p) => p.meta.slug).join(", ")}`);
  return { json: created.map((p) => p.meta), text: created.map((p) => `created phase ${p.meta.id} ${p.meta.slug}`).join("\n") };
}

async function phaseWrite(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { "body-file": { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const body = readFileSync(needString(values, "body-file"), "utf8");
  const phase = writeBody(ctx.home, epic, id, body);
  commit(ctx.home, `${epic}: write phase ${id} body`);
  return { json: phase.meta, text: `wrote ${phase.path}` };
}

async function phaseSet(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { status: { type: "string" }, linear: { type: "string", multiple: true } });
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const status = optString(values, "status");
  const linear = optList(values, "linear");
  if (status === undefined && linear.length === 0) throw new Error("nothing to set: pass --status or --linear");
  const changes: string[] = [];
  if (status !== undefined) {
    if (status !== "planned" && status !== "reviewed") throw new Error("--status must be planned or reviewed");
    setPhaseStatus(ctx.home, epic, id, status);
    changes.push(`status ${status}`);
  }
  if (linear.length) {
    setPhaseLinear(ctx.home, epic, id, linear);
    changes.push("linear");
  }
  const epicDoc = readEpic(ctx.home, epic);
  epicDoc.updated = ctx.now();
  recomputeEpicStatus(epicDoc, listPhases(ctx.home, epic).map((p) => p.meta), ctx.now());
  writeEpic(ctx.home, epicDoc);
  commit(ctx.home, `${epic}: set phase ${id} ${changes.join(", ")}`);
  const phase = listPhases(ctx.home, epic).find((p) => p.meta.id === id);
  return { json: phase?.meta ?? null, text: `updated phase ${id}: ${changes.join(", ")}` };
}

export const phaseCommand: Command = async (args, ctx) => {
  const [sub, ...rest] = args;
  switch (sub) {
    case "new": return phaseNew(rest, ctx);
    case "write": return phaseWrite(rest, ctx);
    case "set": return phaseSet(rest, ctx);
    default: throw new Error("usage: planet phase new|write|set");
  }
};
```

- [ ] **Step 4: Implement commands/link.ts**

```ts
import type { Command } from "../lib/context.ts";
import { need, needInt, parse } from "../lib/args.ts";
import { linkPrs, unlinkPr } from "../lib/link.ts";
import { commit } from "../lib/store.ts";

export const linkCommand: Command = async (args, ctx) => {
  const { positionals } = parse(args, {});
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const urls = positionals.slice(2);
  if (urls.length === 0) throw new Error("missing pr url");
  const result = linkPrs(ctx.home, epic, id, urls, ctx.now());
  if (result.added.length) commit(ctx.home, `${epic}: link phase ${id} to ${result.added.join(", ")}`);
  return {
    json: { phase: result.phase.meta, epic: result.epic, added: result.added },
    text: result.added.length ? `linked ${result.added.join(", ")} to phase ${id}` : "already linked",
  };
};

export const unlinkCommand: Command = async (args, ctx) => {
  const { positionals } = parse(args, {});
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const url = need(positionals, 2, "pr url");
  const result = unlinkPr(ctx.home, epic, id, url, ctx.now());
  commit(ctx.home, `${epic}: unlink ${url} from phase ${id}`);
  return { json: { phase: result.phase.meta, epic: result.epic }, text: `unlinked ${url} from phase ${id}` };
};
```

- [ ] **Step 5: Implement commands/session.ts**

```ts
import type { Command, CommandResult, Ctx } from "../lib/context.ts";
import { need, optString, parse } from "../lib/args.ts";
import { endSession, sessionIdFrom, setSessionStep, startSession } from "../lib/session.ts";
import { commit } from "../lib/store.ts";
import type { Step } from "../schema/types.ts";
import { STEPS } from "../schema/types.ts";

export function parseStep(value: string): Step {
  if (!(STEPS as readonly string[]).includes(value)) throw new Error(`step must be one of ${STEPS.join(", ")}`);
  return value as Step;
}

async function sessionStart(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { phase: { type: "string" }, step: { type: "string" }, session: { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const id = sessionIdFrom(ctx.env, optString(values, "session"));
  const phaseText = optString(values, "phase");
  const phase = phaseText === undefined ? null : Number(phaseText);
  if (phase !== null && !Number.isInteger(phase)) throw new Error("--phase must be an integer");
  const stepText = optString(values, "step");
  const marker = startSession(ctx.home, id, epic, { phase, step: stepText === undefined ? null : parseStep(stepText) }, ctx.now());
  commit(ctx.home, `${epic}: start session`);
  return { json: { session: id, marker }, text: `session ${id} on ${epic}` };
}

async function sessionStep(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { session: { type: "string" } });
  const step = parseStep(need(positionals, 0, "step name"));
  const id = sessionIdFrom(ctx.env, optString(values, "session"));
  const marker = setSessionStep(ctx.home, id, step);
  commit(ctx.home, `${marker.epic}: session step ${step}`);
  return { json: { session: id, marker }, text: `step ${step}` };
}

async function sessionEnd(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { values } = parse(args, { session: { type: "string" } });
  const id = sessionIdFrom(ctx.env, optString(values, "session"));
  const existed = endSession(ctx.home, id);
  if (existed) commit(ctx.home, `end session ${id}`);
  return { json: { session: id, ended: existed }, text: existed ? "session ended" : "no active session" };
}

export const sessionCommand: Command = async (args, ctx) => {
  const [sub, ...rest] = args;
  switch (sub) {
    case "start": return sessionStart(rest, ctx);
    case "step": return sessionStep(rest, ctx);
    case "end": return sessionEnd(rest, ctx);
    default: throw new Error("usage: planet session start|step|end");
  }
};
```

- [ ] **Step 6: Implement commands/proposal.ts**

```ts
import { readFileSync } from "node:fs";
import type { Command, CommandResult, Ctx } from "../lib/context.ts";
import { need, needInt, needString, optString, parse } from "../lib/args.ts";
import { readEpic, writeEpic } from "../lib/epic.ts";
import { approveTo, createProposal, parseDestination } from "../lib/proposal.ts";
import { sessionIdFrom } from "../lib/session.ts";
import { commit } from "../lib/store.ts";
import { parseStep } from "./session.ts";

export const proposeCommand: Command = async (args, ctx) => {
  const { positionals, values } = parse(args, { file: { type: "string" }, phase: { type: "string" }, session: { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const step = parseStep(need(positionals, 1, "step name"));
  const body = readFileSync(needString(values, "file"), "utf8");
  const phaseText = optString(values, "phase");
  const phase = phaseText === undefined ? null : Number(phaseText);
  if (phase !== null && !Number.isInteger(phase)) throw new Error("--phase must be an integer");
  const session = sessionIdFrom(ctx.env, optString(values, "session"));
  const proposal = createProposal(ctx.home, epic, { step, phase, session, toolUse: null, planFile: null, body }, ctx.now());
  commit(ctx.home, `${epic}: snapshot proposal ${proposal.meta.id}`);
  return { json: proposal.meta, text: `proposal ${proposal.meta.id}` };
};

async function proposalApprove(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { to: { type: "string" }, from: { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "proposal id");
  const dest = parseDestination(needString(values, "to"));
  const from = optString(values, "from");
  const result = approveTo(ctx.home, epic, id, dest, from === undefined ? undefined : readFileSync(from, "utf8"));
  const epicDoc = readEpic(ctx.home, epic);
  epicDoc.updated = ctx.now();
  writeEpic(ctx.home, epicDoc);
  const where = dest.kind === "plan" ? "plan" : `phase ${dest.id}`;
  commit(ctx.home, `${epic}: approve proposal ${id} to ${where}`);
  return { json: { proposal: result.proposal.meta, wrote: result.wrote }, text: `wrote ${result.wrote}` };
}

export const proposalCommand: Command = async (args, ctx) => {
  const [sub, ...rest] = args;
  if (sub === "approve") return proposalApprove(rest, ctx);
  throw new Error("usage: planet proposal approve <epic> <id> --to plan|phase:<n>");
};
```

- [ ] **Step 7: Implement commands/check.ts**

```ts
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Command } from "../lib/context.ts";
import { parseFrontmatter } from "../lib/frontmatter.ts";
import { paths } from "../lib/store.ts";
import { validateEpic, validateMarker, validatePhaseMeta, validateProposalMeta } from "../schema/validate.ts";

interface CheckError {
  file: string;
  message: string;
}

function attempt(errors: CheckError[], file: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    errors.push({ file, message: err instanceof Error ? err.message : String(err) });
  }
}

function listFiles(dir: string, pattern: RegExp): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => pattern.test(f)).sort().map((f) => join(dir, f));
}

export function checkStore(home: string): CheckError[] {
  const errors: CheckError[] = [];
  const epicsDir = paths.epics(home);
  const slugs = existsSync(epicsDir) ? readdirSync(epicsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [];
  for (const slug of slugs) {
    const epicFile = paths.epicFile(home, slug);
    attempt(errors, epicFile, () => validateEpic(parseYaml(readFileSync(epicFile, "utf8")), epicFile));
    for (const file of listFiles(paths.phases(home, slug), /^\d{2}-[a-z0-9-]+\.md$/)) {
      attempt(errors, file, () => validatePhaseMeta(parseFrontmatter(readFileSync(file, "utf8")).data, file));
    }
    for (const file of listFiles(paths.proposals(home, slug), /^\d{3}-[a-z-]+\.md$/)) {
      attempt(errors, file, () => validateProposalMeta(parseFrontmatter(readFileSync(file, "utf8")).data, file));
    }
  }
  for (const file of listFiles(paths.sessions(home), /./)) {
    attempt(errors, file, () => validateMarker(JSON.parse(readFileSync(file, "utf8")), file));
  }
  return errors;
}

export const checkCommand: Command = async (_args, ctx) => {
  const errors = checkStore(ctx.home);
  return {
    json: { ok: errors.length === 0, errors },
    text: errors.length ? errors.map((e) => `${e.file}: ${e.message}`).join("\n") : "store ok",
    exitCode: errors.length ? 1 : 0,
  };
};
```

- [ ] **Step 8: Register the commands in cli/planet.ts**

Replace the `COMMANDS` block:

```ts
import { checkCommand } from "./commands/check.ts";
import { epicCommand } from "./commands/epic.ts";
import { linkCommand, unlinkCommand } from "./commands/link.ts";
import { phaseCommand } from "./commands/phase.ts";
import { proposalCommand, proposeCommand } from "./commands/proposal.ts";
import { sessionCommand } from "./commands/session.ts";

export const COMMANDS: Record<string, Command> = {
  epic: epicCommand,
  phase: phaseCommand,
  link: linkCommand,
  unlink: unlinkCommand,
  session: sessionCommand,
  propose: proposeCommand,
  proposal: proposalCommand,
  check: checkCommand,
};
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: all pass, including the 6 new tests.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "add phase, link, session, proposal, and check commands"
```

---

### Task 14: Sync

**Files:**
- Create: `cli/lib/sync.ts`, `cli/commands/sync.ts`, `test/sync.test.ts`
- Modify: `cli/planet.ts` (register `sync`)

**Interfaces:**
- Consumes: `Gh`, `GhUnavailable`, `PrInfo`, `readEpic`, `writeEpic`, `listEpics`, `listPhases`, `writePhase`, `recomputeEpicStatus`
- Produces, in `sync.ts`:
  - `DEFAULT_MAX_AGE_MS = 5 * 60 * 1000`
  - `interface SyncOptions { force?: boolean; maxAgeMs?: number }`
  - `interface SyncResult { epic: string; skipped: boolean; stale: boolean; changes: string[] }`
  - `syncEpic(home: string, slug: string, gh: Gh, now: string, opts?: SyncOptions): Promise<SyncResult>`
  - `syncAll(home: string, gh: Gh, now: string, opts?: SyncOptions): Promise<SyncResult[]>`
  - `commitSync(home: string, results: SyncResult[]): void` one commit naming the epics that changed
- Produces, in `commands/sync.ts`: `syncCommand: Command` for `sync [epic] [--force]`

Rules: terminal epics (`shipped`, `abandoned`) are skipped. Fresh epics are skipped unless forced. Only PRs with `state: open` are queried. A phase whose PRs are all merged moves from draft, planned, or in-progress to shipped with `shipped_at` set. `GhUnavailable` returns `stale: true` and writes nothing. `synced_at` is written on every non-skipped, non-stale sync.

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { NOW, ctx, fakeGh, run, tmpHome } from "./helpers.ts";
import { createEpic, readEpic } from "../cli/lib/epic.ts";
import { linkPrs } from "../cli/lib/link.ts";
import { newPhases, readPhase, setPhaseStatus } from "../cli/lib/phase.ts";
import { syncEpic } from "../cli/lib/sync.ts";
import { git } from "../cli/lib/store.ts";

const PR1 = "https://github.com/o/r/pull/1";
const PR2 = "https://github.com/o/r/pull/2";
const LATER = "2026-09-03T15:10:00.000Z";

function setup(): string {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }, { slug: "b", title: "B" }]);
  linkPrs(home, "e", 1, [PR1, PR2], NOW);
  return home;
}

test("syncEpic updates pr state and ships the phase when every pr is merged", async () => {
  const home = setup();
  const gh = fakeGh({
    [PR1]: { url: PR1, state: "merged", merged_at: "2026-09-03T15:05:00Z" },
    [PR2]: { url: PR2, state: "open", merged_at: null },
  });
  const first = await syncEpic(home, "e", gh, NOW);
  assert.deepEqual(first.changes, [`phase 1: ${PR1} open -> merged`]);
  assert.equal(readPhase(home, "e", 1).meta.status, "in-progress");
  assert.equal(readEpic(home, "e").synced_at, NOW);

  const gh2 = fakeGh({ [PR2]: { url: PR2, state: "merged", merged_at: "2026-09-03T15:09:00Z" } });
  const second = await syncEpic(home, "e", gh2, LATER, { force: true });
  assert.deepEqual(second.changes, [`phase 1: ${PR2} open -> merged`, "phase 1: shipped"]);
  assert.deepEqual(gh2.calls, ["prStates:1"], "only open prs are queried");
  const phase = readPhase(home, "e", 1);
  assert.equal(phase.meta.status, "shipped");
  assert.equal(phase.meta.shipped_at, LATER);
});

test("syncEpic skips fresh epics unless forced, and skips terminal epics", async () => {
  const home = setup();
  const gh = fakeGh({ [PR1]: { url: PR1, state: "open", merged_at: null }, [PR2]: { url: PR2, state: "open", merged_at: null } });
  await syncEpic(home, "e", gh, NOW);
  const fresh = await syncEpic(home, "e", gh, "2026-09-03T15:02:00.000Z");
  assert.equal(fresh.skipped, true);
  const forced = await syncEpic(home, "e", gh, "2026-09-03T15:02:00.000Z", { force: true });
  assert.equal(forced.skipped, false);
  const aged = await syncEpic(home, "e", gh, "2026-09-03T15:08:00.000Z");
  assert.equal(aged.skipped, false);
  assert.equal(gh.calls.length, 3);
});

test("syncEpic reports stale when gh is unavailable and writes nothing", async () => {
  const home = setup();
  const r = await syncEpic(home, "e", fakeGh({}, {}, true), NOW);
  assert.equal(r.stale, true);
  assert.deepEqual(r.changes, []);
  assert.equal(readEpic(home, "e").synced_at, null);
});

test("closed prs are recorded without changing the phase; epic ships when all phases are reviewed", async () => {
  const home = setup();
  const gh = fakeGh({ [PR1]: { url: PR1, state: "closed", merged_at: null }, [PR2]: { url: PR2, state: "merged", merged_at: NOW } });
  await syncEpic(home, "e", gh, NOW);
  const phase = readPhase(home, "e", 1);
  assert.equal(phase.meta.status, "in-progress");
  assert.equal(phase.meta.prs[0].state, "closed");
});

test("sync command commits once and names changed epics", async () => {
  const home = setup();
  const gh = fakeGh({ [PR1]: { url: PR1, state: "merged", merged_at: NOW }, [PR2]: { url: PR2, state: "merged", merged_at: NOW } });
  const r = await run(["sync", "--json"], ctx(home, { gh }));
  assert.equal(r.code, 0);
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "sync: e");
  const quiet = await run(["sync", "e", "--force"], ctx(home, { gh }));
  assert.equal(quiet.stdout, "e: no changes\n");
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "sync: e", "no commit without changes");
  setPhaseStatus(home, "e", 1, "reviewed");
  void LATER;
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/sync.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement sync.ts**

```ts
import type { PrInfo } from "./gh.ts";
import type { Gh } from "./gh.ts";
import { GhUnavailable } from "./gh.ts";
import { listEpics, readEpic, writeEpic } from "./epic.ts";
import { recomputeEpicStatus } from "./lifecycle.ts";
import { listPhases, writePhase } from "./phase.ts";
import { commit } from "./store.ts";

export const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

export interface SyncOptions {
  force?: boolean;
  maxAgeMs?: number;
}

export interface SyncResult {
  epic: string;
  skipped: boolean;
  stale: boolean;
  changes: string[];
}

export async function syncEpic(home: string, slug: string, gh: Gh, now: string, opts: SyncOptions = {}): Promise<SyncResult> {
  const epic = readEpic(home, slug);
  const result: SyncResult = { epic: slug, skipped: false, stale: false, changes: [] };
  if (epic.status === "shipped" || epic.status === "abandoned") return { ...result, skipped: true };
  const maxAge = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  if (!opts.force && epic.synced_at !== null && Date.parse(now) - Date.parse(epic.synced_at) < maxAge) {
    return { ...result, skipped: true };
  }
  const phases = listPhases(home, slug);
  const openUrls = phases.flatMap((p) => p.meta.prs.filter((pr) => pr.state === "open").map((pr) => pr.url));
  let infos: PrInfo[] = [];
  if (openUrls.length > 0) {
    try {
      infos = await gh.prStates(openUrls);
    } catch (err) {
      if (err instanceof GhUnavailable) return { ...result, stale: true };
      throw err;
    }
  }
  const byUrl = new Map(infos.map((i) => [i.url, i]));
  for (const phase of phases) {
    let changed = false;
    for (const pr of phase.meta.prs) {
      const info = byUrl.get(pr.url);
      if (!info || info.state === pr.state) continue;
      result.changes.push(`phase ${phase.meta.id}: ${pr.url} ${pr.state} -> ${info.state}`);
      pr.state = info.state;
      pr.merged_at = info.merged_at;
      changed = true;
    }
    const allMerged = phase.meta.prs.length > 0 && phase.meta.prs.every((pr) => pr.state === "merged");
    const shippable = phase.meta.status === "draft" || phase.meta.status === "planned" || phase.meta.status === "in-progress";
    if (allMerged && shippable) {
      phase.meta.status = "shipped";
      phase.meta.shipped_at = now;
      result.changes.push(`phase ${phase.meta.id}: shipped`);
      changed = true;
    }
    if (changed) writePhase(phase);
  }
  if (recomputeEpicStatus(epic, phases.map((p) => p.meta), now)) result.changes.push(`epic: ${epic.status}`);
  epic.synced_at = now;
  if (result.changes.length) epic.updated = now;
  writeEpic(home, epic);
  return result;
}

export async function syncAll(home: string, gh: Gh, now: string, opts: SyncOptions = {}): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const epic of listEpics(home)) results.push(await syncEpic(home, epic.slug, gh, now, opts));
  return results;
}

export function commitSync(home: string, results: SyncResult[]): void {
  const changed = results.filter((r) => r.changes.length > 0).map((r) => r.epic);
  if (changed.length === 0) {
    commit(home, "sync");
    return;
  }
  commit(home, `sync: ${changed.join(", ")}`);
}
```

`commit` makes no commit when nothing is dirty. In the test, `ctx.now` is fixed, so a forced re-sync rewrites `synced_at` with the same value and leaves the store clean; that is why the last message stays `sync: e`.

- [ ] **Step 4: Implement commands/sync.ts and register it**

```ts
import type { Command } from "../lib/context.ts";
import { flag, parse } from "../lib/args.ts";
import { commitSync, syncAll, syncEpic } from "../lib/sync.ts";
import type { SyncResult } from "../lib/sync.ts";

export function describeSync(results: SyncResult[]): string {
  return results
    .map((r) => {
      if (r.stale) return `${r.epic}: gh unavailable, state is stale`;
      if (r.skipped) return `${r.epic}: skipped`;
      if (r.changes.length === 0) return `${r.epic}: no changes`;
      return [`${r.epic}:`, ...r.changes.map((c) => `  ${c}`)].join("\n");
    })
    .join("\n");
}

export const syncCommand: Command = async (args, ctx) => {
  const { positionals, values } = parse(args, { force: { type: "boolean" } });
  const opts = { force: flag(values, "force") };
  const results = positionals[0]
    ? [await syncEpic(ctx.home, positionals[0], ctx.gh, ctx.now(), opts)]
    : await syncAll(ctx.home, ctx.gh, ctx.now(), opts);
  commitSync(ctx.home, results);
  return { json: results, text: describeSync(results) };
};
```

Add `sync: syncCommand` to `COMMANDS` in `cli/planet.ts` with its import.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "add pr sync"
```

---

### Task 15: Status and open

**Files:**
- Create: `cli/lib/table.ts`, `cli/commands/status.ts`, `cli/commands/open.ts`, `test/cli-status.test.ts`
- Modify: `cli/planet.ts` (register `status`, `open`)

**Interfaces:**
- Produces, in `table.ts`: `renderTable(headers: string[], rows: string[][]): string`
- Produces, in `commands/status.ts`:
  - `interface StatusRow { slug: string; title: string; repo: string; status: EpicStatus; shipped: number; total: number; current: string | null; open_prs: number; closed_prs: number; unreviewed: number; synced_at: string | null; stale: boolean }`
  - `buildRows(home: string, stale: Set<string>): StatusRow[]`
  - `renderStatus(rows: StatusRow[]): string`
  - `syncForRead(ctx: Ctx, values: Parsed["values"]): Promise<Set<string>>` runs the sync unless `--no-sync`, commits, returns the stale set
  - `statusCommand: Command` for `status [--all] [--no-sync] [--force]`
- Produces, in `commands/open.ts`: `openCommand: Command` for `open <text> [--step <name>] [--no-sync] [--force] [--session <id>]`

`open` JSON on a unique match: `{ match: slug, marker, status: rows, epic: EpicView }`. Otherwise `{ match: null, candidates: string[], status: rows }` with exit code 0.

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { NOW, SESSION, ctx, fakeGh, run, tmpHome } from "./helpers.ts";
import { createEpic, writeEpic, readEpic } from "../cli/lib/epic.ts";
import { linkPrs } from "../cli/lib/link.ts";
import { newPhases } from "../cli/lib/phase.ts";
import { readMarker } from "../cli/lib/session.ts";
import { renderTable } from "../cli/lib/table.ts";
import type { StatusRow } from "../cli/commands/status.ts";

const PR1 = "https://github.com/o/r/pull/1";

function setup(): string {
  const home = tmpHome();
  createEpic(home, { slug: "gql-migration", title: "GQL migration", repo: "o/r", linear: ["CRM-1"] }, NOW);
  newPhases(home, "gql-migration", [{ slug: "a", title: "A" }, { slug: "b", title: "B" }]);
  linkPrs(home, "gql-migration", 1, [PR1], NOW);
  const done = createEpic(home, { slug: "old", title: "Old", repo: "o/r" }, NOW);
  done.status = "shipped";
  writeEpic(home, done);
  return home;
}

test("renderTable pads columns and trims trailing space", () => {
  assert.equal(renderTable(["A", "BB"], [["x", "y"], ["long", ""]]), "A     BB\nx     y\nlong");
});

test("status syncs, hides terminal epics, and renders rows", async () => {
  const home = setup();
  const gh = fakeGh({ [PR1]: { url: PR1, state: "merged", merged_at: NOW } });
  const r = await run(["status", "--json"], ctx(home, { gh }));
  assert.equal(r.code, 0);
  const rows = r.json as StatusRow[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0].slug, "gql-migration");
  assert.equal(rows[0].shipped, 1);
  assert.equal(rows[0].total, 2);
  assert.equal(rows[0].unreviewed, 1);
  assert.equal(rows[0].current, "2 b");
  assert.equal(rows[0].stale, false);
  assert.deepEqual(gh.calls, ["prStates:1"]);

  const all = await run(["status", "--all", "--no-sync"], ctx(home, { gh }));
  assert.match(all.stdout, /^EPIC\s+REPO\s+STATUS\s+PHASES\s+CURRENT\s+OPEN\s+REVIEW\s+SYNCED/);
  assert.match(all.stdout, /\nold\s+o\/r\s+shipped/);
  assert.equal(gh.calls.length, 1, "--no-sync does not call gh");
});

test("status marks stale rows when gh is unavailable", async () => {
  const home = setup();
  const r = await run(["status"], ctx(home, { gh: fakeGh({}, {}, true) }));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /active \(stale\)/);
  assert.match(r.stdout, /never/);
});

test("open with a unique match starts the session and returns the epic view", async () => {
  const home = setup();
  const gh = fakeGh({ [PR1]: { url: PR1, state: "open", merged_at: null } });
  const r = await run(["open", "the GQL thing", "--step", "phase-plan", "--json"], ctx(home, { gh }));
  assert.equal(r.code, 0);
  const json = r.json as { match: string; epic: { epic: { slug: string } }; status: StatusRow[] };
  assert.equal(json.match, "gql-migration");
  assert.equal(json.epic.epic.slug, "gql-migration");
  assert.equal(json.status.length, 1);
  assert.deepEqual(readMarker(home, SESSION), { epic: "gql-migration", phase: null, step: "phase-plan", started: NOW });
  assert.deepEqual(readEpic(home, "gql-migration").sessions, [SESSION]);
});

test("open with zero or many matches sets nothing", async () => {
  const home = setup();
  createEpic(home, { slug: "gql-cleanup", title: "Cleanup", repo: "o/r" }, NOW);
  const gh = fakeGh({ [PR1]: { url: PR1, state: "open", merged_at: null } });
  const many = await run(["open", "gql", "--json"], ctx(home, { gh }));
  assert.deepEqual((many.json as { match: null; candidates: string[] }).candidates, ["gql-cleanup", "gql-migration"]);
  assert.equal(readMarker(home, SESSION), null);
  const none = await run(["open", "zzz"], ctx(home, { gh }));
  assert.equal(none.code, 0);
  assert.equal(none.stdout, "no epic matches 'zzz'\n");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/cli-status.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement table.ts**

```ts
export function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();
  return [line(headers), ...rows.map(line)].join("\n");
}
```

- [ ] **Step 4: Implement commands/status.ts**

```ts
import type { Command, Ctx } from "../lib/context.ts";
import type { Parsed } from "../lib/args.ts";
import { flag, parse } from "../lib/args.ts";
import { listEpics } from "../lib/epic.ts";
import { currentPhase, listPhases } from "../lib/phase.ts";
import { commitSync, syncAll } from "../lib/sync.ts";
import { renderTable } from "../lib/table.ts";
import type { EpicStatus } from "../schema/types.ts";

export interface StatusRow {
  slug: string;
  title: string;
  repo: string;
  status: EpicStatus;
  shipped: number;
  total: number;
  current: string | null;
  open_prs: number;
  closed_prs: number;
  unreviewed: number;
  synced_at: string | null;
  stale: boolean;
}

export function buildRows(home: string, stale: Set<string>): StatusRow[] {
  return listEpics(home).map((epic) => {
    const metas = listPhases(home, epic.slug).map((p) => p.meta);
    const prs = metas.flatMap((m) => m.prs);
    const current = currentPhase(metas);
    return {
      slug: epic.slug,
      title: epic.title,
      repo: epic.repo,
      status: epic.status,
      shipped: metas.filter((m) => m.status === "shipped" || m.status === "reviewed").length,
      total: metas.length,
      current: current ? `${current.id} ${current.slug}` : null,
      open_prs: prs.filter((pr) => pr.state === "open").length,
      closed_prs: prs.filter((pr) => pr.state === "closed").length,
      unreviewed: metas.filter((m) => m.status === "shipped").length,
      synced_at: epic.synced_at,
      stale: stale.has(epic.slug),
    };
  });
}

export function renderStatus(rows: StatusRow[]): string {
  if (rows.length === 0) return "no active epics";
  return renderTable(
    ["EPIC", "REPO", "STATUS", "PHASES", "CURRENT", "OPEN", "REVIEW", "SYNCED"],
    rows.map((r) => [
      r.slug,
      r.repo,
      r.stale ? `${r.status} (stale)` : r.status,
      `${r.shipped}/${r.total}`,
      r.current ?? "-",
      r.closed_prs ? `${r.open_prs} (${r.closed_prs} closed)` : String(r.open_prs),
      r.unreviewed ? String(r.unreviewed) : "-",
      r.synced_at ? r.synced_at.slice(0, 16).replace("T", " ") : "never",
    ]),
  );
}

export async function syncForRead(ctx: Ctx, values: Parsed["values"]): Promise<Set<string>> {
  const stale = new Set<string>();
  if (flag(values, "no-sync")) return stale;
  const results = await syncAll(ctx.home, ctx.gh, ctx.now(), { force: flag(values, "force") });
  for (const r of results) if (r.stale) stale.add(r.epic);
  commitSync(ctx.home, results);
  return stale;
}

export const READ_OPTIONS = {
  "no-sync": { type: "boolean" as const },
  force: { type: "boolean" as const },
};

export const statusCommand: Command = async (args, ctx) => {
  const { values } = parse(args, { ...READ_OPTIONS, all: { type: "boolean" } });
  const stale = await syncForRead(ctx, values);
  let rows = buildRows(ctx.home, stale);
  if (!flag(values, "all")) rows = rows.filter((r) => r.status !== "shipped" && r.status !== "abandoned");
  return { json: rows, text: renderStatus(rows) };
};
```

- [ ] **Step 5: Implement commands/open.ts**

```ts
import type { Command } from "../lib/context.ts";
import { need, optString, parse } from "../lib/args.ts";
import { listEpics, resolveEpics } from "../lib/epic.ts";
import { listPhases } from "../lib/phase.ts";
import { sessionIdFrom, startSession } from "../lib/session.ts";
import { commit } from "../lib/store.ts";
import { epicView } from "../lib/view.ts";
import { parseStep } from "./session.ts";
import { READ_OPTIONS, buildRows, syncForRead } from "./status.ts";

export const openCommand: Command = async (args, ctx) => {
  const { positionals, values } = parse(args, { ...READ_OPTIONS, step: { type: "string" }, session: { type: "string" } });
  const text = need(positionals, 0, "text to resolve");
  const stale = await syncForRead(ctx, values);
  const rows = buildRows(ctx.home, stale).filter((r) => r.status !== "shipped" && r.status !== "abandoned");
  const matches = resolveEpics(listEpics(ctx.home), text, (slug) => listPhases(ctx.home, slug).map((p) => p.meta));
  if (matches.length !== 1) {
    const candidates = matches.map((e) => e.slug);
    return {
      json: { match: null, candidates, status: rows },
      text: candidates.length ? `ambiguous: ${candidates.join(", ")}` : `no epic matches '${text}'`,
    };
  }
  const slug = matches[0].slug;
  const stepText = optString(values, "step");
  const id = sessionIdFrom(ctx.env, optString(values, "session"));
  const marker = startSession(ctx.home, id, slug, { step: stepText === undefined ? null : parseStep(stepText) }, ctx.now());
  commit(ctx.home, `${slug}: start session`);
  return {
    json: { match: slug, marker, status: rows, epic: epicView(ctx.home, slug) },
    text: `opened ${slug}`,
  };
};
```

Register `status: statusCommand` and `open: openCommand` in `cli/planet.ts`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: all pass, including the 5 new tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "add status table and open"
```

---

### Task 16: Aggregate commands: pr files and feedback report

**Files:**
- Create: `cli/lib/report.ts`, `cli/commands/pr.ts`, `cli/commands/feedback.ts`, `test/report.test.ts`
- Modify: `cli/planet.ts` (register `pr`, `feedback`)

**Interfaces:**
- Produces, in `report.ts`:
  - `interface PlanComment { quote: string; comment: string }`
  - `COMMENT_RE`, `parseComments(text: string): PlanComment[]` for `[Re: "quote"] comment` lines
  - `NOTE_RE`, `parseTags(notes: string): Record<string, number>` for `- proposal N · tag` lines
  - `diffFiles(a: string, b: string): string` unified diff with one line of context, hunks only, via `git diff --no-index`
  - `interface StepStats { step: string; proposals: number; approved: number; rejected: number; pending: number; edited: number; proposals_per_approval: number | null }`
  - `interface Rejection { epic: string; id: number; step: string; feedback: string; comments: PlanComment[] }`
  - `interface Edit { epic: string; id: number; step: string; diff: string }`
  - `interface FeedbackReport { epics: string[]; steps: StepStats[]; rejections: Rejection[]; edits: Edit[]; tags: Record<string, number>; prompts: Record<string, number> }`
  - `buildReport(home: string, epics: string[]): FeedbackReport`
- Produces, in `commands/pr.ts`: `prCommand: Command` for `pr files <epic> <phase>`; JSON `{ phase, source: "merged" | "all", prs: string[], files: PrFile[] }` where files are summed per path and sorted by path. Uses merged PRs, or every linked PR when none is merged.
- Produces, in `commands/feedback.ts`: `feedbackCommand: Command` for `feedback report [epic]`

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, writeFileSync } from "node:fs";
import { NOW, SESSION, ctx, fakeGh, run, tmpHome } from "./helpers.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { linkPrs } from "../cli/lib/link.ts";
import { newPhases } from "../cli/lib/phase.ts";
import { createProposal, markApproved, markRejected } from "../cli/lib/proposal.ts";
import { buildReport, parseComments, parseTags } from "../cli/lib/report.ts";
import { paths } from "../cli/lib/store.ts";
import { syncEpic } from "../cli/lib/sync.ts";

const PR1 = "https://github.com/o/r/pull/1";
const PR2 = "https://github.com/o/r/pull/2";

test("parseComments extracts inline plan comments", () => {
  const text = 'User chose to stay in plan mode\n\nComments on the plan:\n[Re: "handleOverrides"] `listHandleOverrides`\n[Re: "two\nlines"] no\n[Re: "x"] keep';
  assert.deepEqual(parseComments(text), [
    { quote: "handleOverrides", comment: "`listHandleOverrides`" },
    { quote: "x", comment: "keep" },
  ]);
  assert.deepEqual(parseComments("plain rejection"), []);
});

test("parseTags counts tags from notes.md", () => {
  assert.deepEqual(parseTags("- proposal 3 · reorder\n- proposal 5 · reorder\n- proposal 6 · scope-cut\nrandom line\n"), { reorder: 2, "scope-cut": 1 });
});

test("buildReport aggregates per step with rejections, edits, tags, and prompts", () => {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  const base = { phase: null, session: SESSION, toolUse: null, planFile: null };
  const p1 = createProposal(home, "e", { ...base, step: "phasing", body: "# A\n1\n2\n" }, NOW);
  markRejected(home, "e", p1.meta.id, 'Comments on the plan:\n[Re: "1"] swap');
  const p2 = createProposal(home, "e", { ...base, step: "phasing", body: "# A\n2\n1\n" }, NOW);
  markApproved(home, "e", p2.meta.id, "# A\n2\n1\n3\n");
  createProposal(home, "e", { ...base, step: "scoping", body: "s" }, NOW);
  writeFileSync(paths.notes(home, "e"), "- proposal 1 · reorder\n");
  appendFileSync(paths.prompts(home, "e"), `${JSON.stringify({ ts: NOW, session: SESSION, kind: "planning", phase: null, proposal: 1, text: "swap them" })}\n`);
  appendFileSync(paths.prompts(home, "e"), `${JSON.stringify({ ts: NOW, session: SESSION, kind: "implementation", phase: 1, proposal: 2, text: "go" })}\n`);

  const report = buildReport(home, ["e"]);
  assert.deepEqual(report.steps, [
    { step: "phasing", proposals: 2, approved: 1, rejected: 1, pending: 0, edited: 1, proposals_per_approval: 2 },
    { step: "scoping", proposals: 1, approved: 0, rejected: 0, pending: 1, edited: 0, proposals_per_approval: null },
  ]);
  assert.equal(report.rejections.length, 1);
  assert.deepEqual(report.rejections[0].comments, [{ quote: "1", comment: "swap" }]);
  assert.equal(report.edits.length, 1);
  assert.match(report.edits[0].diff, /^@@/m);
  assert.match(report.edits[0].diff, /^\+3$/m);
  assert.doesNotMatch(report.edits[0].diff, /^diff --git/m);
  assert.doesNotMatch(report.edits[0].diff, /^-id:/m, "frontmatter is not part of the edit diff");
  assert.deepEqual(report.tags, { reorder: 1 });
  assert.deepEqual(report.prompts, { planning: 1, implementation: 1 });
});

test("pr files sums per path across merged prs", async () => {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  linkPrs(home, "e", 1, [PR1, PR2], NOW);
  const gh = fakeGh(
    { [PR1]: { url: PR1, state: "merged", merged_at: NOW }, [PR2]: { url: PR2, state: "open", merged_at: null } },
    { [PR1]: [{ path: "b.ts", additions: 2, deletions: 1 }, { path: "a.ts", additions: 5, deletions: 0 }], [PR2]: [{ path: "a.ts", additions: 1, deletions: 1 }] },
  );
  await syncEpic(home, "e", gh, NOW);
  const r = await run(["pr", "files", "e", "1", "--json"], ctx(home, { gh }));
  assert.equal(r.code, 0);
  assert.deepEqual(r.json, {
    phase: 1,
    source: "merged",
    prs: [PR1],
    files: [{ path: "a.ts", additions: 5, deletions: 0 }, { path: "b.ts", additions: 2, deletions: 1 }],
  });
  const text = await run(["pr", "files", "e", "1"], ctx(home, { gh }));
  assert.match(text.stdout, /^PATH\s+\+\s+-\n/);
});

test("feedback report command renders a summary", async () => {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  createProposal(home, "e", { step: "intake", phase: null, session: SESSION, toolUse: null, planFile: null, body: "x" }, NOW);
  const r = await run(["feedback", "report", "e"], ctx(home));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /intake\s+1\s+0\s+0\s+1\s+0/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/report.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement report.ts**

```ts
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Proposal } from "../schema/types.ts";
import { listProposals, editedPath } from "./proposal.ts";
import { paths } from "./store.ts";

export interface PlanComment {
  quote: string;
  comment: string;
}

export const COMMENT_RE = /^\[Re: "(.*)"\]\s*(.*)$/;

export function parseComments(text: string): PlanComment[] {
  const out: PlanComment[] = [];
  for (const line of text.split("\n")) {
    const m = COMMENT_RE.exec(line);
    if (m) out.push({ quote: m[1], comment: m[2] });
  }
  return out;
}

export const NOTE_RE = /^-\s*proposal\s+(\d+)\s*·\s*([a-z-]+)/;

export function parseTags(notes: string): Record<string, number> {
  const tags: Record<string, number> = {};
  for (const line of notes.split("\n")) {
    const m = NOTE_RE.exec(line);
    if (m) tags[m[2]] = (tags[m[2]] ?? 0) + 1;
  }
  return tags;
}

/** The snapshot body written to a temp file, so the diff against the edited plan excludes frontmatter. */
function snapshotBodyFile(proposal: Proposal): string {
  const file = join(mkdtempSync(join(tmpdir(), "planet-diff-")), "snapshot.md");
  writeFileSync(file, proposal.body);
  return file;
}

/** Unified diff between two files, hunks only. git exits 1 when the files differ, so the status is ignored. */
export function diffFiles(a: string, b: string): string {
  const result = spawnSync("git", ["diff", "--no-index", "--no-color", "--unified=1", "--", a, b], { encoding: "utf8" });
  const lines = result.stdout.split("\n");
  const first = lines.findIndex((l) => l.startsWith("@@"));
  return first === -1 ? "" : lines.slice(first).join("\n").trimEnd();
}

export interface StepStats {
  step: string;
  proposals: number;
  approved: number;
  rejected: number;
  pending: number;
  edited: number;
  proposals_per_approval: number | null;
}

export interface Rejection {
  epic: string;
  id: number;
  step: string;
  feedback: string;
  comments: PlanComment[];
}

export interface Edit {
  epic: string;
  id: number;
  step: string;
  diff: string;
}

export interface FeedbackReport {
  epics: string[];
  steps: StepStats[];
  rejections: Rejection[];
  edits: Edit[];
  tags: Record<string, number>;
  prompts: Record<string, number>;
}

export function buildReport(home: string, epics: string[]): FeedbackReport {
  const stats = new Map<string, StepStats>();
  const rejections: Rejection[] = [];
  const edits: Edit[] = [];
  const tags: Record<string, number> = {};
  const prompts: Record<string, number> = {};

  for (const epic of epics) {
    for (const p of listProposals(home, epic)) {
      const s = stats.get(p.meta.step) ?? { step: p.meta.step, proposals: 0, approved: 0, rejected: 0, pending: 0, edited: 0, proposals_per_approval: null };
      s.proposals += 1;
      if (p.meta.outcome === "approved") s.approved += 1;
      if (p.meta.outcome === "rejected") s.rejected += 1;
      if (p.meta.outcome === "pending") s.pending += 1;
      if (p.meta.edited) s.edited += 1;
      stats.set(p.meta.step, s);
      if (p.meta.outcome === "rejected") {
        const feedback = p.meta.feedback ?? "";
        rejections.push({ epic, id: p.meta.id, step: p.meta.step, feedback, comments: parseComments(feedback) });
      }
      if (p.meta.edited && existsSync(editedPath(p.path))) {
        edits.push({ epic, id: p.meta.id, step: p.meta.step, diff: diffFiles(snapshotBodyFile(p), editedPath(p.path)) });
      }
    }
    const notes = paths.notes(home, epic);
    if (existsSync(notes)) for (const [tag, n] of Object.entries(parseTags(readFileSync(notes, "utf8")))) tags[tag] = (tags[tag] ?? 0) + n;
    const promptsFile = paths.prompts(home, epic);
    if (existsSync(promptsFile)) {
      for (const line of readFileSync(promptsFile, "utf8").split("\n")) {
        if (!line.trim()) continue;
        const kind = (JSON.parse(line) as { kind?: string }).kind ?? "unknown";
        prompts[kind] = (prompts[kind] ?? 0) + 1;
      }
    }
  }
  for (const s of stats.values()) s.proposals_per_approval = s.approved ? s.proposals / s.approved : null;
  const steps = [...stats.values()].sort((a, b) => a.step.localeCompare(b.step));
  return { epics, steps, rejections, edits, tags, prompts };
}
```

The snapshot file carries frontmatter and the edited file does not, which is why the diff runs against the snapshot body written to a temp file.

- [ ] **Step 4: Implement commands/pr.ts**

```ts
import type { Command } from "../lib/context.ts";
import { need, needInt, parse } from "../lib/args.ts";
import type { PrFile } from "../lib/gh.ts";
import { readPhase } from "../lib/phase.ts";
import { renderTable } from "../lib/table.ts";

export const prCommand: Command = async (args, ctx) => {
  const [sub, ...rest] = args;
  if (sub !== "files") throw new Error("usage: planet pr files <epic> <phase>");
  const { positionals } = parse(rest, {});
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const phase = readPhase(ctx.home, epic, id);
  const merged = phase.meta.prs.filter((pr) => pr.state === "merged").map((pr) => pr.url);
  const source = merged.length ? "merged" : "all";
  const urls = merged.length ? merged : phase.meta.prs.map((pr) => pr.url);
  const byPath = new Map<string, PrFile>();
  for (const url of urls) {
    for (const f of await ctx.gh.prFiles(url)) {
      const cur = byPath.get(f.path) ?? { path: f.path, additions: 0, deletions: 0 };
      cur.additions += f.additions;
      cur.deletions += f.deletions;
      byPath.set(f.path, cur);
    }
  }
  const files = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  return {
    json: { phase: id, source, prs: urls, files },
    text: files.length ? renderTable(["PATH", "+", "-"], files.map((f) => [f.path, String(f.additions), String(f.deletions)])) : "no linked prs",
  };
};
```

- [ ] **Step 5: Implement commands/feedback.ts**

```ts
import type { Command } from "../lib/context.ts";
import { parse } from "../lib/args.ts";
import { listEpics } from "../lib/epic.ts";
import { buildReport } from "../lib/report.ts";
import { renderTable } from "../lib/table.ts";

export const feedbackCommand: Command = async (args, ctx) => {
  const [sub, ...rest] = args;
  if (sub !== "report") throw new Error("usage: planet feedback report [epic]");
  const { positionals } = parse(rest, {});
  const epics = positionals[0] ? [positionals[0]] : listEpics(ctx.home).map((e) => e.slug);
  const report = buildReport(ctx.home, epics);
  const table = renderTable(
    ["STEP", "PROPOSALS", "APPROVED", "REJECTED", "PENDING", "EDITED", "PER APPROVAL"],
    report.steps.map((s) => [s.step, String(s.proposals), String(s.approved), String(s.rejected), String(s.pending), String(s.edited), s.proposals_per_approval === null ? "-" : s.proposals_per_approval.toFixed(1)]),
  );
  const tags = Object.entries(report.tags).map(([t, n]) => `${t}=${n}`).join(" ") || "none";
  const prompts = Object.entries(report.prompts).map(([k, n]) => `${k}=${n}`).join(" ") || "none";
  return {
    json: report,
    text: `${table}\n\nrejections: ${report.rejections.length}  edits: ${report.edits.length}\ntags: ${tags}\nprompts: ${prompts}`,
  };
};
```

Register `pr: prCommand` and `feedback: feedbackCommand` in `cli/planet.ts`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: all pass, including the 5 new tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "add pr files and feedback report"
```

---

### Task 17: Capture: prompts and plan-mode proposals

**Files:**
- Create: `cli/commands/capture.ts`, `test/capture.test.ts`
- Modify: `cli/planet.ts` (register `capture`)

**Interfaces:**
- Consumes: `readMarker`, `createProposal`, `findProposalByToolUse`, `latestPending`, `latestProposalId`, `markApproved`, `markRejected`, `commit`, `paths`
- Produces:
  - `interface HookInput { hook_event_name: string; session_id: string; agent_id?: string; tool_name?: string; tool_use_id?: string; tool_input?: Record<string, unknown>; tool_response?: unknown; tool_error?: unknown; user_input?: string; prompt?: string }`
  - `responseText(value: unknown): string` flattens string, array, or object payloads
  - `APPROVED_RE`, `APPROVED_PLAN_HEADING`, `approvedPlanText(response: string, fallback: string): string`
  - `handleHook(raw: string, ctx: Ctx): string[]` returns a list of actions taken, for tests and the hook log
  - `captureCommand: Command` never throws, always exit code 0, appends errors to `hook.log`

Event handling:

| Event | Condition | Action |
|---|---|---|
| any | no marker for `session_id` | nothing |
| UserPromptSubmit | | append `{ts, session, kind, phase, proposal, text}` to `prompts.jsonl`; `kind` is `implementation` when the marker has a phase |
| PreToolUse | `tool_name` ExitPlanMode, no `agent_id` | create proposal from `tool_input.plan`, step from marker, `tool_use` and `plan_file` recorded |
| PostToolUse | ExitPlanMode | find by `tool_use_id`, else latest pending for the session. Approved when `tool_response` matches `APPROVED_RE`: `markApproved` with the text after `## Approved Plan:`. Otherwise `markRejected` with the response verbatim |
| PostToolUseFailure, PermissionDenied | ExitPlanMode | `markRejected` with `tool_error` verbatim, or "rejected without a message" |
| PostToolUse | Bash | Task 18 |

Every write commits with `<epic>: capture prompt`, `<epic>: snapshot proposal N`, `<epic>: approve proposal N [with edits]`, or `<epic>: reject proposal N`.

- [ ] **Step 1: Write the failing tests**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { NOW, SESSION, ctx, run, tmpHome } from "./helpers.ts";
import { handleHook, responseText, approvedPlanText } from "../cli/commands/capture.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { newPhases } from "../cli/lib/phase.ts";
import { editedPath, readProposal } from "../cli/lib/proposal.ts";
import { startSession } from "../cli/lib/session.ts";
import { git, paths } from "../cli/lib/store.ts";

const PLAN = "# Phase 1\n\nDo A then B.\n";

function hook(event: string, extra: Record<string, unknown>): string {
  return JSON.stringify({ hook_event_name: event, session_id: SESSION, transcript_path: "/t", cwd: "/c", permission_mode: "plan", ...extra });
}

function approvedResponse(plan: string): string {
  return `User has approved your plan. You can now start coding. Start with updating your todo list if applicable\n\nYour plan has been saved to: /plans/x.md\nYou can refer back to it if needed during implementation.\n\n## Approved Plan:\n${plan}`;
}

function setup(phase: number | null = null): string {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  startSession(home, SESSION, "e", { phase, step: "phase-plan" }, NOW);
  return home;
}

test("responseText flattens strings, arrays, and objects", () => {
  assert.equal(responseText("x"), "x");
  assert.equal(responseText([{ type: "text", text: "a" }, { type: "text", text: "b" }]), "a\nb");
  assert.equal(responseText({ stdout: "out", stderr: "err" }), "out\nerr");
  assert.equal(responseText({ weird: 1 }), '{"weird":1}');
  assert.equal(responseText(null), "");
});

test("approvedPlanText slices after the heading and falls back", () => {
  assert.equal(approvedPlanText(approvedResponse(PLAN), "fb"), PLAN);
  assert.equal(approvedPlanText("no heading", "fb"), "fb");
});

test("no marker means no action", () => {
  const home = tmpHome();
  assert.deepEqual(handleHook(hook("UserPromptSubmit", { user_input: "hi" }), ctx(home)), ["no marker"]);
});

test("UserPromptSubmit appends a prompt line with the latest proposal id", () => {
  const home = setup();
  handleHook(hook("UserPromptSubmit", { user_input: "first" }), ctx(home));
  handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t1", tool_input: { plan: PLAN, planFilePath: "/plans/x.md" } }), ctx(home));
  handleHook(hook("UserPromptSubmit", { prompt: "second via legacy field" }), ctx(home));
  const lines = readFileSync(paths.prompts(home, "e"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(lines[0], { ts: NOW, session: SESSION, kind: "planning", phase: null, proposal: null, text: "first" });
  assert.equal(lines[1].proposal, 1);
  assert.equal(lines[1].text, "second via legacy field");
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "e: capture prompt");
});

test("kind is implementation when the marker has a phase", () => {
  const home = setup(1);
  handleHook(hook("UserPromptSubmit", { user_input: "build it" }), ctx(home));
  assert.equal(JSON.parse(readFileSync(paths.prompts(home, "e"), "utf8")).kind, "implementation");
});

test("PreToolUse snapshots the plan; PostToolUse approval without edits", () => {
  const home = setup();
  const pre = handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t1", tool_input: { plan: PLAN, planFilePath: "/plans/x.md" } }), ctx(home));
  assert.deepEqual(pre, ["proposal 1 created"]);
  const p = readProposal(home, "e", 1);
  assert.equal(p.body, PLAN);
  assert.equal(p.meta.step, "phase-plan");
  assert.equal(p.meta.tool_use, "t1");
  assert.equal(p.meta.plan_file, "/plans/x.md");
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "e: snapshot proposal 1");

  const post = handleHook(hook("PostToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t1", tool_input: { plan: PLAN }, tool_response: approvedResponse(PLAN) }), ctx(home));
  assert.deepEqual(post, ["proposal 1 approved"]);
  const approved = readProposal(home, "e", 1);
  assert.equal(approved.meta.outcome, "approved");
  assert.equal(approved.meta.edited, false);
  assert.ok(!existsSync(editedPath(approved.path)));
});

test("PostToolUse approval with inline edits stores the edited plan", () => {
  const home = setup();
  handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t2", tool_input: { plan: PLAN } }), ctx(home));
  const edited = "# Phase 1\n\nDo B then A.\n";
  handleHook(hook("PostToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t2", tool_input: { plan: PLAN }, tool_response: approvedResponse(edited) }), ctx(home));
  const p = readProposal(home, "e", 1);
  assert.equal(p.meta.edited, true);
  assert.equal(readFileSync(editedPath(p.path), "utf8"), edited);
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "e: approve proposal 1 with edits");
});

test("rejections through PostToolUse text, PostToolUseFailure, and PermissionDenied", () => {
  const home = setup();
  handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t3", tool_input: { plan: PLAN } }), ctx(home));
  const comments = 'User chose to stay in plan mode and continue planning\n\nComments on the plan:\n[Re: "Do A then B"] other order';
  assert.deepEqual(handleHook(hook("PostToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t3", tool_input: { plan: PLAN }, tool_response: comments }), ctx(home)), ["proposal 1 rejected"]);
  assert.equal(readProposal(home, "e", 1).meta.feedback, comments);
  assert.deepEqual(handleHook(hook("PostToolUseFailure", { tool_name: "ExitPlanMode", tool_use_id: "t3", tool_input: { plan: PLAN }, tool_error: comments }), ctx(home)), ["proposal 1 already rejected"]);

  handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t4", tool_input: { plan: PLAN } }), ctx(home));
  assert.deepEqual(handleHook(hook("PermissionDenied", { tool_name: "ExitPlanMode", tool_use_id: "t4", tool_input: { plan: PLAN } }), ctx(home)), ["proposal 2 rejected"]);
  assert.equal(readProposal(home, "e", 2).meta.feedback, "rejected without a message");

  handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t5", tool_input: { plan: PLAN } }), ctx(home));
  assert.deepEqual(handleHook(hook("PostToolUse", { tool_name: "ExitPlanMode", tool_input: { plan: PLAN }, tool_response: "The user doesn't want to proceed. the user said:\nno" }), ctx(home)), ["proposal 3 rejected"], "falls back to latest pending without tool_use_id");
});

test("subagent plan events are ignored", () => {
  const home = setup();
  assert.deepEqual(handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", agent_id: "agent-1", tool_use_id: "t9", tool_input: { plan: PLAN } }), ctx(home)), ["subagent plan ignored"]);
});

test("capture command never fails: bad json is logged and exit code is 0", async () => {
  const home = setup();
  const r = await run(["capture"], ctx(home, { stdin: () => "not json" }));
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "");
  assert.match(readFileSync(paths.hookLog(home), "utf8"), /Unexpected token|not valid JSON/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/capture.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement commands/capture.ts**

```ts
import { appendFileSync, mkdirSync } from "node:fs";
import type { Command, Ctx } from "../lib/context.ts";
import type { SessionMarker } from "../schema/types.ts";
import { createProposal, findProposalByToolUse, latestPending, latestProposalId, markApproved, markRejected } from "../lib/proposal.ts";
import { readMarker } from "../lib/session.ts";
import { commit, paths } from "../lib/store.ts";

export interface HookInput {
  hook_event_name: string;
  session_id: string;
  agent_id?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
  tool_error?: unknown;
  user_input?: string;
  prompt?: string;
}

const TEXT_KEYS = ["text", "stdout", "stderr", "output", "content", "error", "message"];

export function responseText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(responseText).filter(Boolean).join("\n");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const parts = TEXT_KEYS.map((k) => record[k]).filter((v): v is string => typeof v === "string" && v !== "");
    return parts.length ? parts.join("\n") : JSON.stringify(value);
  }
  return String(value);
}

export const APPROVED_RE = /^User has approved your plan/m;
export const APPROVED_PLAN_HEADING = "## Approved Plan:\n";

export function approvedPlanText(response: string, fallback: string): string {
  const at = response.indexOf(APPROVED_PLAN_HEADING);
  if (at === -1) return fallback;
  return response.slice(at + APPROVED_PLAN_HEADING.length);
}

function onPrompt(input: HookInput, marker: SessionMarker, ctx: Ctx): string[] {
  const text = input.user_input ?? input.prompt ?? "";
  if (!text) return ["empty prompt"];
  const line = {
    ts: ctx.now(),
    session: input.session_id,
    kind: marker.phase === null ? "planning" : "implementation",
    phase: marker.phase,
    proposal: latestProposalId(ctx.home, marker.epic),
    text,
  };
  mkdirSync(paths.feedback(ctx.home, marker.epic), { recursive: true });
  appendFileSync(paths.prompts(ctx.home, marker.epic), `${JSON.stringify(line)}\n`);
  commit(ctx.home, `${marker.epic}: capture prompt`);
  return ["prompt captured"];
}

function onPlanProposed(input: HookInput, marker: SessionMarker, ctx: Ctx): string[] {
  if (input.agent_id) return ["subagent plan ignored"];
  const plan = input.tool_input?.plan;
  if (typeof plan !== "string") return ["no plan text"];
  const planFile = typeof input.tool_input?.planFilePath === "string" ? input.tool_input.planFilePath : null;
  const proposal = createProposal(
    ctx.home,
    marker.epic,
    { step: marker.step ?? "unknown", phase: marker.phase, session: input.session_id, toolUse: input.tool_use_id ?? null, planFile, body: plan },
    ctx.now(),
  );
  commit(ctx.home, `${marker.epic}: snapshot proposal ${proposal.meta.id}`);
  return [`proposal ${proposal.meta.id} created`];
}

function onPlanResult(input: HookInput, marker: SessionMarker, ctx: Ctx, text: string): string[] {
  if (input.agent_id) return ["subagent plan ignored"];
  const byId = input.tool_use_id ? findProposalByToolUse(ctx.home, marker.epic, input.tool_use_id) : null;
  const proposal = byId ?? latestPending(ctx.home, marker.epic, input.session_id);
  if (!proposal) return ["no pending proposal"];
  if (proposal.meta.outcome !== "pending") return [`proposal ${proposal.meta.id} already ${proposal.meta.outcome}`];
  if (APPROVED_RE.test(text)) {
    const approved = markApproved(ctx.home, marker.epic, proposal.meta.id, approvedPlanText(text, proposal.body));
    const suffix = approved.meta.edited ? " with edits" : "";
    commit(ctx.home, `${marker.epic}: approve proposal ${proposal.meta.id}${suffix}`);
    return [`proposal ${proposal.meta.id} approved${approved.meta.edited ? " (edited)" : ""}`];
  }
  markRejected(ctx.home, marker.epic, proposal.meta.id, text);
  commit(ctx.home, `${marker.epic}: reject proposal ${proposal.meta.id}`);
  return [`proposal ${proposal.meta.id} rejected`];
}

export function handleHook(raw: string, ctx: Ctx): string[] {
  const input = JSON.parse(raw) as HookInput;
  const marker = readMarker(ctx.home, input.session_id);
  if (!marker) return ["no marker"];
  switch (input.hook_event_name) {
    case "UserPromptSubmit":
      return onPrompt(input, marker, ctx);
    case "PreToolUse":
      return input.tool_name === "ExitPlanMode" ? onPlanProposed(input, marker, ctx) : ["ignored"];
    case "PostToolUse":
      if (input.tool_name === "ExitPlanMode") return onPlanResult(input, marker, ctx, responseText(input.tool_response));
      return ["ignored"];
    case "PostToolUseFailure":
    case "PermissionDenied":
      if (input.tool_name !== "ExitPlanMode") return ["ignored"];
      return onPlanResult(input, marker, ctx, responseText(input.tool_error) || "rejected without a message");
    default:
      return ["ignored"];
  }
}

export const captureCommand: Command = async (_args, ctx) => {
  try {
    const actions = handleHook(ctx.stdin(), ctx);
    return { json: { actions }, text: "" };
  } catch (err) {
    const message = err instanceof Error ? err.stack ?? err.message : String(err);
    try {
      appendFileSync(paths.hookLog(ctx.home), `${ctx.now()} ${message}\n`);
    } catch {
      // the log itself is best effort
    }
    return { json: { error: message }, text: "", exitCode: 0 };
  }
};
```

Register `capture: captureCommand` in `cli/planet.ts`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: all pass, including the 10 new tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "capture prompts and plan-mode proposals from hooks"
```

---

### Task 18: Capture: link PRs from `gh pr create`

**Files:**
- Modify: `cli/commands/capture.ts`, `test/capture.test.ts`

**Interfaces:**
- Consumes: `linkPrs`, `PR_URL_RE`
- Produces: `GH_PR_CREATE_RE`; the `PostToolUse` + `Bash` branch of `handleHook`

- [ ] **Step 1: Add the failing tests**

Append to `test/capture.test.ts`:

```ts
import { readPhase } from "../cli/lib/phase.ts";

const PR = "https://github.com/o/r/pull/12";

test("gh pr create output links the PR to the session phase", () => {
  const home = setup(1);
  const actions = handleHook(hook("PostToolUse", {
    tool_name: "Bash",
    tool_input: { command: "gh pr create --title x --body y" },
    tool_response: `Creating pull request for feat in o/r\n\n${PR}\n`,
  }), ctx(home));
  assert.deepEqual(actions, [`linked ${PR} to phase 1`]);
  const phase = readPhase(home, "e", 1);
  assert.equal(phase.meta.status, "in-progress");
  assert.equal(phase.meta.prs[0].url, PR);
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), `e: link phase 1 to ${PR}`);
  assert.deepEqual(handleHook(hook("PostToolUse", { tool_name: "Bash", tool_input: { command: "gh pr create" }, tool_response: { stdout: PR, stderr: "" } }), ctx(home)), ["already linked"]);
});

test("gh pr create is ignored without a phase, without a url, or for other commands", () => {
  const home = setup();
  assert.deepEqual(handleHook(hook("PostToolUse", { tool_name: "Bash", tool_input: { command: "gh pr create" }, tool_response: PR }), ctx(home)), ["no phase in session; not linking"]);
  const withPhase = setup(1);
  assert.deepEqual(handleHook(hook("PostToolUse", { tool_name: "Bash", tool_input: { command: "gh pr create" }, tool_response: "error: not authenticated" }), ctx(withPhase)), ["no PR url in output"]);
  assert.deepEqual(handleHook(hook("PostToolUse", { tool_name: "Bash", tool_input: { command: "gh pr view 12" }, tool_response: PR }), ctx(withPhase)), ["ignored"]);
});

test("a PR from another repo is logged, not linked, and the hook still exits 0", async () => {
  const home = setup(1);
  const raw = hook("PostToolUse", { tool_name: "Bash", tool_input: { command: "gh pr create" }, tool_response: "https://github.com/other/repo/pull/1" });
  const r = await run(["capture"], ctx(home, { stdin: () => raw }));
  assert.equal(r.code, 0);
  assert.match(readFileSync(paths.hookLog(home), "utf8"), /is not in o\/r/);
  assert.deepEqual(readPhase(home, "e", 1).meta.prs, []);
});
```

Move the `import` line to the top of the file with the others.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/capture.test.ts`
Expected: the three new tests FAIL with `["ignored"]` instead of the expected actions.

- [ ] **Step 3: Add the Bash branch**

In `cli/commands/capture.ts`, add the imports and handler:

```ts
import { PR_URL_RE, linkPrs } from "../lib/link.ts";

export const GH_PR_CREATE_RE = /\bgh\s+pr\s+create\b/;

function onBash(input: HookInput, marker: SessionMarker, ctx: Ctx): string[] {
  const command = typeof input.tool_input?.command === "string" ? input.tool_input.command : "";
  if (!GH_PR_CREATE_RE.test(command)) return ["ignored"];
  if (marker.phase === null) return ["no phase in session; not linking"];
  const match = PR_URL_RE.exec(responseText(input.tool_response));
  if (!match) return ["no PR url in output"];
  const url = match[0];
  const result = linkPrs(ctx.home, marker.epic, marker.phase, [url], ctx.now());
  if (result.added.length === 0) return ["already linked"];
  commit(ctx.home, `${marker.epic}: link phase ${marker.phase} to ${url}`);
  return [`linked ${url} to phase ${marker.phase}`];
}
```

And change the `PostToolUse` case in `handleHook`:

```ts
    case "PostToolUse":
      if (input.tool_name === "ExitPlanMode") return onPlanResult(input, marker, ctx, responseText(input.tool_response));
      if (input.tool_name === "Bash") return onBash(input, marker, ctx);
      return ["ignored"];
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "link prs from gh pr create through the bash hook"
```

---

### Task 19: Hook shim, hooks.json, and end-to-end hook test

**Files:**
- Create: `bin/planet-hook`, `hooks/hooks.json`, `test/hook-e2e.test.ts`

**Interfaces:**
- Produces: `bin/planet-hook` reads the event JSON from stdin, exits 0 before starting Node unless `$PLANET_HOME/sessions/<session_id>` exists, else pipes the JSON to `planet capture`. Always exits 0.

- [ ] **Step 1: Write the failing end-to-end test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { NOW, tmpHome } from "./helpers.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { startSession } from "../cli/lib/session.ts";
import { paths } from "../cli/lib/store.ts";

function fire(home: string, payload: Record<string, unknown>) {
  return spawnSync("bin/planet-hook", { input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env, PLANET_HOME: home } });
}

test("planet-hook exits 0 and writes nothing without a marker", () => {
  const home = tmpHome();
  const r = fire(home, { hook_event_name: "UserPromptSubmit", session_id: "nobody", user_input: "hi" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
  assert.ok(!existsSync(paths.hookLog(home)));
});

test("planet-hook captures a prompt when the session has a marker", () => {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  startSession(home, "sess-e2e", "e", {}, NOW);
  const r = fire(home, { hook_event_name: "UserPromptSubmit", session_id: "sess-e2e", user_input: "hello from the hook" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "", "stdout would be injected into Claude's context");
  assert.match(readFileSync(paths.prompts(home, "e"), "utf8"), /hello from the hook/);
});

test("planet-hook exits 0 on garbage input", () => {
  const home = tmpHome();
  const r = spawnSync("bin/planet-hook", { input: "{{{", encoding: "utf8", env: { ...process.env, PLANET_HOME: home } });
  assert.equal(r.status, 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/hook-e2e.test.ts`
Expected: FAIL, `bin/planet-hook` not found.

- [ ] **Step 3: Write bin/planet-hook**

```bash
#!/usr/bin/env bash
# Hook entry for Claude Code. Exits before starting Node unless this session has a Planet marker.
input="$(cat)"
sid="$(printf '%s' "$input" | grep -o '"session_id": *"[^"]*"' | head -1 | sed 's/.*: *"\(.*\)"/\1/')"
home="${PLANET_HOME:-$HOME/.planet}"
if [ -z "$sid" ] || [ ! -f "$home/sessions/$sid" ]; then
  exit 0
fi
self="${BASH_SOURCE[0]}"
while [ -L "$self" ]; do self="$(readlink "$self")"; done
root="$(cd "$(dirname "$self")/.." && pwd)"
printf '%s' "$input" | node "$root/cli/planet.ts" capture >/dev/null 2>>"$home/hook.log" || true
exit 0
```

Run: `chmod +x bin/planet-hook`

- [ ] **Step 4: Write hooks/hooks.json**

```json
{
  "description": "Planet: capture prompts, plan-mode proposals, and PR links for the active epic",
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/bin/planet-hook", "timeout": 10 }] }
    ],
    "PreToolUse": [
      { "matcher": "ExitPlanMode", "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/bin/planet-hook", "timeout": 10 }] }
    ],
    "PostToolUse": [
      { "matcher": "ExitPlanMode", "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/bin/planet-hook", "timeout": 10 }] },
      { "matcher": "Bash", "hooks": [{ "type": "command", "if": "Bash(gh pr create *)", "command": "${CLAUDE_PLUGIN_ROOT}/bin/planet-hook", "timeout": 10 }] }
    ],
    "PostToolUseFailure": [
      { "matcher": "ExitPlanMode", "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/bin/planet-hook", "timeout": 10 }] }
    ],
    "PermissionDenied": [
      { "matcher": "ExitPlanMode", "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/bin/planet-hook", "timeout": 10 }] }
    ]
  }
}
```

If the Task 2 probe showed that `if` and `matcher` cannot be combined, drop the `matcher` on the Bash entry and keep `if`.

- [ ] **Step 5: Run the tests and validate the plugin**

Run: `npm test && npm run typecheck && claude plugin validate .`
Expected: all tests pass; validation prints `Validation passed`.

Run: `time (echo '{"session_id":"none"}' | bin/planet-hook)`
Expected: well under 50ms. This is the cost every non-Planet Bash call and prompt pays.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "add hook shim and hooks.json"
```

---

### Task 20: Live verification in Claude Code

Manual. Confirms the CLI, hooks, and `gh` client work end to end. Nothing is committed to this repo except the notes; the probe epic is removed from the store at the end.

- [ ] **Step 1: Load the plugin and create a probe epic**

From the VS Code extension, in any scratch directory: `claude --plugin-dir /Users/scottmahr/code/personal/planet`

In that session ask Claude to run, verbatim:

```bash
planet epic new probe --title "Planet probe" --repo <owner/repo you can open a PR against>
planet phase new probe a --title "Probe phase"
planet session start probe --phase 1 --step phase-plan
planet status
```

Expected: `planet` resolves through the plugin `bin/` on PATH. `status` shows one row, `probe`, phases `0/1`, current `1 a`.

- [ ] **Step 2: Approve a plan with an inline edit**

Ask Claude to enter plan mode and write a three-line plan. In the review, edit one line inline, then approve. Then ask Claude to run:

```bash
planet epic show probe --json
cat ~/.planet/epics/probe/proposals/001-phase-plan.md
ls ~/.planet/epics/probe/proposals/
```

Expected: frontmatter shows `outcome: approved`, `edited: true`, `tool_use` set, `plan_file` set; `001-phase-plan.edited.md` exists and contains your edit.

- [ ] **Step 3: Reject a plan two ways**

Repeat plan mode. Reject once with a typed message, and once by leaving an inline comment and staying in plan mode. Then:

```bash
grep -A2 '^outcome' ~/.planet/epics/probe/proposals/00*.md
```

Expected: proposals 2 and 3 are `rejected` with `feedback` holding the message and the `[Re: "..."]` comment respectively.

- [ ] **Step 4: Confirm prompt capture**

```bash
cat ~/.planet/epics/probe/feedback/prompts.jsonl
```

Expected: one line per prompt you typed, `kind: implementation` since the marker has a phase, `proposal` advancing as snapshots were taken.

- [ ] **Step 5: Confirm PR auto-link and sync**

In the repo named in Step 1, on a throwaway branch with one trivial commit, ask Claude to run `gh pr create --draft --title "planet probe" --body "throwaway"`. Then:

```bash
planet epic show probe --json
gh pr close <url> --delete-branch
planet sync probe --force
planet status --all
```

Expected: the phase shows the PR as `open` and status `in-progress` right after creation. After the close and forced sync, the PR entry is `closed`, the phase stays `in-progress`, and status shows `0 (1 closed)` in the OPEN column.

- [ ] **Step 6: Confirm terminal use**

In a plain terminal: `PATH="$HOME/code/personal/planet/bin:$PATH" planet status`
Expected: the same table.

- [ ] **Step 7: Record and clean up**

Append the outcomes, including anything that differed from the expectations above, to `docs/superpowers/notes/2026-09-03-hook-probe.md`. Then:

```bash
planet session end
rm -rf ~/.planet/epics/probe
git -C ~/.planet add -A && git -C ~/.planet commit -qm "remove probe epic"
planet check
git add docs && git commit -m "record live verification results"
```

Fix any defect found as its own commit before this one.

---

## Notes for follow-on 2 (router and planet-proposal skills)

Facts learned while writing this plan that the skill specs need:

- Plugin skills are namespaced by plugin name. A skill folder `skills/planet/` in a plugin named `planet` is invoked as `/planet:planet`. Pick the router skill folder name with that in mind, for example `skills/open/` giving `/planet:open`, or accept `/planet:planet`.
- The plugin's `bin/` is on the Bash tool's PATH while the plugin is enabled, so skills can call `planet ...` directly. `${CLAUDE_PLUGIN_ROOT}/bin/planet` also works and is what hooks.json uses.
- The session id in Bash is `CLAUDE_CODE_SESSION_ID`. `planet open` and `planet session start` read it; skills never need to pass it.
- `planet open` returns `match: null` with `candidates` and the status rows on ambiguity. The router's confirmation question builds from that payload.
- Hooks fire for subagent tool calls with the same `session_id` and an `agent_id`. The capture code ignores subagent plan events, but a subagent running `gh pr create` in a session with a phase marker will link the PR. That is the intended behavior.
- Three details differ from the spec text and are updated there in the same commit as this plan: proposal frontmatter gains `tool_use` and `plan_file`; `planet proposal approve --from` defaults to the captured approved text rather than the session's plan file, because the hook already holds the approved version; the session marker is one JSON line rather than free text.
- The proposal snapshot is taken from `tool_input.plan` at PreToolUse. The approved text comes from `tool_response` after `## Approved Plan:`. `planet-proposal` therefore never writes snapshots itself; it only runs `planet proposal approve --to` after approval.
