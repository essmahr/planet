# Planet Feedback Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retro turns each shipped phase into a written read of blocks, refinements, review feedback, and plan drift with weighed lessons; feedback-review turns recurring lessons and `skill`-tagged rejections into approved edits to the step skills.

**Architecture:** CLI first: per-epic events, a `review` pseudo-epic so hooks capture review proposals under `reviews/`, `pr feedback` and `retro inputs` bundles from `gh`, `retro write` with validated frontmatter, report additions, and four small fixes. Then two hidden skills with templates, router rows for retro and `review feedback`, and one-line edits to implement, proposal, scoping, and phase-plan.

**Tech Stack:** TypeScript on Node 24 (erasable syntax, `.ts` imports, `node --test`), `yaml` runtime dep, `gh` CLI, Markdown skills, harness `test/skills.test.ts`.

**Spec:** docs/superpowers/specs/2026-09-10-planet-feedback-loop-design.md

## Global Constraints

- Store writes only through the CLI; every write commits to the store repo with `<epic>: <message>`; review writes commit as `review: <message>`.
- The pseudo-epic slug `review` maps `proposals`, `feedback`, `prompts`, `notes` to `<home>/reviews/...`; `planet epic new review` is refused; `planet status` never lists it.
- Events file: `epics/<slug>/feedback/events.jsonl`, one JSON object per line: `{ts, phase, kind, text, sha, session}`; kinds exactly `blocked`, `implemented`, `reviewed`.
- Retro file: `epics/<slug>/retros/NN-<slug>.md` (NN two-digit phase id, slug the phase slug), frontmatter `phase`, `prs`, `implemented_sha`, `head_sha`, `lessons: [{text, skill, steer}]`, `written`. `steer` is `true|false`; `skill` is one of `planet-intake`, `planet-scoping`, `planet-phasing`, `planet-phase-plan`, `planet-implement`, `not-planet`.
- Review record: `<home>/reviews/<YYYY-MM-DD>.md`, suffix `-2`, `-3` on a second approval the same day.
- Prompt `kind` is `implementation` when the marker step is `implement`, else `planning`.
- `FEEDBACK_TAGS` gains `skill`.
- Return lines, exact: retro `retro done for phase <N>`; feedback-review `feedback review done, <branch>` or `feedback review done, nothing recurs`; aborts `<step> aborted: <message>`.
- Skill body budgets (harness, not raised beyond these): `go` 1,200; `planet-implement` 750; `planet-retro` 900; `planet-feedback-review` 900; `planet-scoping` 1,500; `planet-phase-plan` 1,500. Hidden skills: `user-invocable: false`, no `disable-model-invocation`, description starts "Only invoked by", no `<>`, strict-yaml frontmatter. Every `planet <verb>` in a body is a real command; every `references/<file>.md` named exists under that skill; no "prior art"; no personal names; no em-dashes.
- TDD for CLI tasks: failing test first, run it, implement, run it.
- Commit messages lowercase imperative, no prefix, no trailing period. Run `npm test && npm run typecheck && claude plugin validate .` before each commit (one pre-existing plugin warning is fine). Never touch `.claude-plugin/marketplace.json`.

---

### Task 1: Events

**Files:**
- Create: `cli/lib/events.ts`
- Modify: `cli/lib/store.ts:10-25` (add `events` path), `cli/commands/phase.ts` (add `event` subcommand), `cli/planet.ts:42` (usage line)
- Test: `test/events.test.ts` (create)

**Interfaces:**
- Produces: `EVENT_KINDS`, `EventKind`, `PlanetEvent {ts, phase, kind, text, sha, session}`, `appendEvent(home, epic, input: {phase, kind, text?, sha?, session}, now): PlanetEvent`, `listEvents(home, epic, phase?): PlanetEvent[]`; CLI `planet phase event <epic> <id> <kind> [text] [--sha <sha>]`.

- [ ] **Step 1: Write the failing test `test/events.test.ts`**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { NOW, SESSION, ctx, run, tmpHome } from "./helpers.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { appendEvent, listEvents } from "../cli/lib/events.ts";
import { newPhases } from "../cli/lib/phase.ts";
import { paths } from "../cli/lib/store.ts";

function setup(): string {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }, { slug: "b", title: "B" }]);
  return home;
}

test("appendEvent writes one json line and listEvents filters by phase", () => {
  const home = setup();
  appendEvent(home, "e", { phase: 1, kind: "blocked", text: "commit 2: file gone", session: SESSION }, NOW);
  appendEvent(home, "e", { phase: 1, kind: "implemented", sha: "abc1234", session: SESSION }, NOW);
  appendEvent(home, "e", { phase: 2, kind: "implemented", sha: "def5678", session: SESSION }, NOW);
  const lines = readFileSync(paths.events(home, "e"), "utf8").trim().split("\n");
  assert.equal(lines.length, 3);
  assert.deepEqual(JSON.parse(lines[0]), { ts: NOW, phase: 1, kind: "blocked", text: "commit 2: file gone", sha: null, session: SESSION });
  assert.equal(listEvents(home, "e").length, 3);
  assert.deepEqual(listEvents(home, "e", 1).map((e) => e.kind), ["blocked", "implemented"]);
  assert.deepEqual(listEvents(home, "e", 3), []);
});

test("listEvents on an epic without events returns empty", () => {
  const home = setup();
  assert.deepEqual(listEvents(home, "e"), []);
  assert.equal(existsSync(paths.events(home, "e")), false);
});

test("planet phase event validates kind and phase, records sha, commits", async () => {
  const home = setup();
  const bad = await run(["phase", "event", "e", "1", "napping"], ctx(home));
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /kind must be one of blocked, implemented, reviewed/);
  const missing = await run(["phase", "event", "e", "9", "blocked", "why"], ctx(home));
  assert.equal(missing.code, 1);
  const ok = await run(["phase", "event", "e", "1", "implemented", "--sha", "abc1234", "--json"], ctx(home));
  assert.equal(ok.code, 0);
  assert.deepEqual(ok.json, { ts: NOW, phase: 1, kind: "implemented", text: null, sha: "abc1234", session: SESSION });
  const text = await run(["phase", "event", "e", "1", "blocked", "commit 2: file gone"], ctx(home));
  assert.equal(text.stdout.trim(), "phase 1 blocked");
  assert.equal(listEvents(home, "e", 1).length, 2);
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `node --test test/events.test.ts 2>&1 | tail -5`
Expected: fails to load `../cli/lib/events.ts`.

- [ ] **Step 3: Add the path in `cli/lib/store.ts`**

After the `notes:` line in `paths`, add:

```ts
  events: (home: string, slug: string) => join(home, "epics", slug, "feedback", "events.jsonl"),
```

- [ ] **Step 4: Create `cli/lib/events.ts`**

```ts
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { paths } from "./store.ts";

export type EventKind = "blocked" | "implemented" | "reviewed";
export const EVENT_KINDS: readonly EventKind[] = ["blocked", "implemented", "reviewed"];

export interface PlanetEvent {
  ts: string;
  phase: number;
  kind: EventKind;
  text: string | null;
  sha: string | null;
  session: string;
}

export interface NewEventInput {
  phase: number;
  kind: EventKind;
  text?: string | null;
  sha?: string | null;
  session: string;
}

export function appendEvent(home: string, epic: string, input: NewEventInput, now: string): PlanetEvent {
  const event: PlanetEvent = { ts: now, phase: input.phase, kind: input.kind, text: input.text ?? null, sha: input.sha ?? null, session: input.session };
  mkdirSync(paths.feedback(home, epic), { recursive: true });
  appendFileSync(paths.events(home, epic), `${JSON.stringify(event)}\n`);
  return event;
}

export function listEvents(home: string, epic: string, phase?: number): PlanetEvent[] {
  const file = paths.events(home, epic);
  if (!existsSync(file)) return [];
  const all = readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as PlanetEvent);
  if (phase === undefined) return all;
  return all.filter((e) => e.phase === phase);
}
```

- [ ] **Step 5: Add the `event` subcommand in `cli/commands/phase.ts`**

Read the file first for its imports (`need`, `needInt`, `optString`, `parse`, `readPhase`, `commit`, `sessionIdFrom`); add what is missing. Add this function and a `case "event": return phaseEvent(rest, ctx);` in the dispatcher, and extend the usage error to include `event`:

```ts
async function phaseEvent(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { sha: { type: "string" }, session: { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const kind = need(positionals, 2, "event kind");
  if (!(EVENT_KINDS as readonly string[]).includes(kind)) throw new Error(`kind must be one of ${EVENT_KINDS.join(", ")}`);
  readPhase(ctx.home, epic, id);
  const session = sessionIdFrom(ctx.env, optString(values, "session"));
  const event = appendEvent(ctx.home, epic, { phase: id, kind: kind as EventKind, text: positionals[3] ?? null, sha: optString(values, "sha") ?? null, session }, ctx.now());
  commit(ctx.home, `${epic}: phase ${id} ${kind}`);
  return { json: event, text: `phase ${id} ${kind}` };
}
```

Imports to add: `import { EVENT_KINDS, appendEvent } from "../lib/events.ts"; import type { EventKind } from "../lib/events.ts"; import { sessionIdFrom } from "../lib/session.ts";`

- [ ] **Step 6: Usage line in `cli/planet.ts`**

Replace `  phase new|write|set|drop` with `  phase new|write|set|drop|event`.

- [ ] **Step 7: Run tests, commit**

Run: `npm test && npm run typecheck && claude plugin validate .`

```bash
git add cli/lib/events.ts cli/lib/store.ts cli/commands/phase.ts cli/planet.ts test/events.test.ts
git commit -m "record phase events"
```

---

### Task 2: Small fixes: step with phase, prompt kind, proposal reject, skill tag

**Files:**
- Modify: `cli/schema/types.ts:77-79`, `cli/lib/session.ts:43-49`, `cli/commands/session.ts:26-33`, `cli/commands/capture.ts:79`, `cli/commands/proposal.ts` (add `reject`), `cli/planet.ts` usage
- Test: `test/cli-structure.test.ts`, `test/capture.test.ts`, `test/proposal.test.ts` or a new `test/proposal-reject.test.ts`

**Interfaces:**
- Produces: `setSessionStep(home, id, step, phase?: number | null)`; CLI `planet session step <step> [--phase N]`; `planet proposal reject <epic> <id|latest|latest-N> [--feedback <text>]`; `Tag` includes `"skill"`.

- [ ] **Step 1: Failing tests**

In `test/cli-structure.test.ts`, after the `implement` assertions added last branch, add:

```ts
  const withPhase = await run(["session", "step", "phase-plan", "--phase", "2", "--json"], ctx(home));
  assert.equal(withPhase.code, 0);
  assert.deepEqual(readMarker(home, SESSION), { epic: "e", phase: 2, step: "phase-plan", started: NOW });
```

(Check the test's setup creates at least two phases; if it creates one, add a second with `newPhases` or use `--phase 1`.)

In `test/capture.test.ts`, find the prompt test that asserts `kind` and add a case: start a session with `{ phase: 1, step: "phase-plan" }`, send a UserPromptSubmit, and assert the logged line has `kind: "planning"`; then `setSessionStep(home, SESSION, "implement")` and assert the next prompt logs `kind: "implementation"`.

Create `test/proposal-reject.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { NOW, SESSION, ctx, run, tmpHome } from "./helpers.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { createProposal, readProposal } from "../cli/lib/proposal.ts";

test("planet proposal reject marks a pending proposal rejected with feedback", async () => {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  const p = createProposal(home, "e", { step: "scoping", phase: null, session: SESSION, toolUse: null, planFile: null, body: "x" }, NOW);
  const r = await run(["proposal", "reject", "e", "latest", "--feedback", "keep the current plan", "--json"], ctx(home));
  assert.equal(r.code, 0);
  const after = readProposal(home, "e", p.meta.id);
  assert.equal(after.meta.outcome, "rejected");
  assert.equal(after.meta.feedback, "keep the current plan");
  const again = await run(["proposal", "reject", "e", "latest"], ctx(home));
  assert.equal(again.code, 1);
  assert.match(again.stderr, /already rejected/);
});

test("planet proposal tag accepts skill", async () => {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  createProposal(home, "e", { step: "scoping", phase: null, session: SESSION, toolUse: null, planFile: null, body: "x" }, NOW);
  const r = await run(["proposal", "tag", "e", "latest", "skill"], ctx(home));
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), "- proposal 1 · skill");
});
```

- [ ] **Step 2: Run, expect failures**

Run: `node --test test/cli-structure.test.ts test/capture.test.ts test/proposal-reject.test.ts 2>&1 | grep -E '^ℹ (pass|fail)'`

- [ ] **Step 3: Implement**

`cli/schema/types.ts`:

```ts
export type Tag = "scope-cut" | "scope-add" | "reorder" | "wrong-assumption" | "too-granular" | "too-coarse" | "style" | "skill" | "other";

export const FEEDBACK_TAGS: readonly Tag[] = ["scope-cut", "scope-add", "reorder", "wrong-assumption", "too-granular", "too-coarse", "style", "skill", "other"];
```

`cli/lib/session.ts` `setSessionStep`:

```ts
export function setSessionStep(home: string, id: string, step: Step, phase?: number | null): SessionMarker {
  const marker = readMarker(home, id);
  if (!marker) throw new Error("no active planet session; run planet session start first");
  marker.step = step;
  if (phase !== undefined) {
    if (phase !== null) readPhase(home, marker.epic, phase);
    marker.phase = phase;
  }
  writeMarker(home, id, marker);
  return marker;
}
```

`cli/commands/session.ts` `sessionStep`:

```ts
async function sessionStep(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { phase: { type: "string" }, session: { type: "string" } });
  const step = parseStep(need(positionals, 0, "step name"));
  const id = sessionIdFrom(ctx.env, optString(values, "session"));
  const phaseText = optString(values, "phase");
  const phase = phaseText === undefined ? undefined : Number(phaseText);
  if (phase !== undefined && !Number.isInteger(phase)) throw new Error("--phase must be an integer");
  const marker = setSessionStep(ctx.home, id, step, phase);
  commit(ctx.home, `${marker.epic}: session step ${step}`);
  return { json: { session: id, marker }, text: `step ${step}` };
}
```

`cli/commands/capture.ts` line 79:

```ts
    kind: marker.step === "implement" ? "implementation" : "planning",
```

`cli/commands/proposal.ts`, add and wire `if (sub === "reject") return proposalReject(rest, ctx);` and extend the usage string:

```ts
async function proposalReject(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { feedback: { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const idArg = need(positionals, 1, "proposal id");
  const id = resolveProposalId(ctx.home, epic, idArg);
  const current = readProposal(ctx.home, epic, id);
  if (current.meta.outcome !== "pending") throw new Error(`proposal ${id} already ${current.meta.outcome}`);
  const proposal = markRejected(ctx.home, epic, id, optString(values, "feedback") ?? "rejected by hand");
  commit(ctx.home, `${epic}: reject proposal ${id}`);
  return { json: proposal.meta, text: `proposal ${id} rejected` };
}
```

Import `markRejected` from `../lib/proposal.ts`. Usage in `cli/planet.ts`: add `  proposal reject <epic> <id|latest|latest-N> [--feedback <text>]` and change the session line to `  session start|step [--phase <n>]|end`.

- [ ] **Step 4: Run tests, commit**

Run: `npm test && npm run typecheck && claude plugin validate .`

```bash
git add cli/schema/types.ts cli/lib/session.ts cli/commands/session.ts cli/commands/capture.ts cli/commands/proposal.ts cli/planet.ts test/cli-structure.test.ts test/capture.test.ts test/proposal-reject.test.ts
git commit -m "add proposal reject, the skill tag, phase on session step, and prompt kind by step"
```

---

### Task 3: The `review` pseudo-epic

**Files:**
- Modify: `cli/lib/store.ts` (`REVIEW` constant, path special-cases, `reviews` paths), `cli/lib/epic.ts` (`createEpic` refuses slug `review`), `cli/lib/session.ts` (`startReviewSession`), `cli/commands/session.ts` (`review` subcommand), `cli/lib/proposal.ts` (`Destination` gains `review`, `approveTo` takes `now`), `cli/commands/proposal.ts` (pass `ctx.now()`, commit message for review), `cli/commands/capture.ts` (SessionEnd commit already uses marker.epic), `cli/planet.ts` usage
- Test: `test/review-session.test.ts` (create)

**Interfaces:**
- Produces: `REVIEW = "review"`; `paths.reviews(home)`, `paths.reviewFile(home, date, n)`; `startReviewSession(home, id, now): SessionMarker` with `{epic: "review", phase: null, step: "feedback-review", started}`; `parseDestination("review")` → `{kind: "review"}`; `approveTo(home, epic, id, dest, fromText, now)` writing `reviews/<date>.md`; CLI `planet session review`, `planet proposal approve review latest --to review`.

- [ ] **Step 1: Failing test `test/review-session.test.ts`**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NOW, SESSION, ctx, run, tmpHome } from "./helpers.ts";
import { handleHook } from "../cli/commands/capture.ts";
import { REVIEW, paths } from "../cli/lib/store.ts";
import { readMarker } from "../cli/lib/session.ts";
import { listProposals } from "../cli/lib/proposal.ts";

function hook(event: string, extra: Record<string, unknown>): string {
  return JSON.stringify({ hook_event_name: event, session_id: SESSION, transcript_path: "/t", ...extra });
}

test("review paths live under reviews/ and epic new refuses the slug", async () => {
  const home = tmpHome();
  assert.equal(paths.proposals(home, REVIEW), join(home, "reviews", "proposals"));
  assert.equal(paths.prompts(home, REVIEW), join(home, "reviews", "prompts.jsonl"));
  assert.equal(paths.notes(home, REVIEW), join(home, "reviews", "notes.md"));
  const r = await run(["epic", "new", "review", "--title", "R", "--repo", "o/r"], ctx(home));
  assert.equal(r.code, 1);
  assert.match(r.stderr, /reserved/);
});

test("planet session review marks the session and hooks capture under reviews/", async () => {
  const home = tmpHome();
  const r = await run(["session", "review", "--json"], ctx(home));
  assert.equal(r.code, 0);
  assert.deepEqual(readMarker(home, SESSION), { epic: REVIEW, phase: null, step: "feedback-review", started: NOW });
  handleHook(hook("UserPromptSubmit", { user_input: "review the rejections" }), ctx(home));
  assert.ok(existsSync(paths.prompts(home, REVIEW)));
  handleHook(hook("PreToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t1", tool_input: { plan: "# Findings\n" } }), ctx(home));
  const proposals = listProposals(home, REVIEW);
  assert.equal(proposals.length, 1);
  assert.match(proposals[0].path, /reviews\/proposals\/001-feedback-review\.md$/);
  handleHook(hook("PostToolUse", { tool_name: "ExitPlanMode", tool_use_id: "t1", tool_response: { plan: "# Findings\n", filePath: "/p", isAgent: false } }), ctx(home));
  const a = await run(["proposal", "approve", REVIEW, "latest", "--to", "review", "--json"], ctx(home));
  assert.equal(a.code, 0);
  const record = join(home, "reviews", "2026-09-03.md");
  assert.equal(readFileSync(record, "utf8"), "# Findings\n");
  const b = await run(["proposal", "approve", REVIEW, "latest", "--to", "review", "--from", record, "--json"], ctx(home));
  assert.equal(b.code, 0);
  assert.ok(existsSync(join(home, "reviews", "2026-09-03-2.md")));
  const end = await run(["session", "end"], ctx(home));
  assert.equal(end.code, 0);
  assert.equal(readMarker(home, SESSION), null);
  const status = await run(["status", "--no-sync", "--json"], ctx(home));
  assert.deepEqual(status.json, []);
});
```

- [ ] **Step 2: Run, expect failure** (`REVIEW` not exported).

- [ ] **Step 3: Implement**

`cli/lib/store.ts`: add `export const REVIEW = "review";` above `paths`, and a helper plus path changes:

```ts
function epicRoot(home: string, slug: string): string {
  return slug === REVIEW ? join(home, "reviews") : join(home, "epics", slug);
}

export const paths = {
  epics: (home: string) => join(home, "epics"),
  epic: (home: string, slug: string) => join(home, "epics", slug),
  epicFile: (home: string, slug: string) => join(home, "epics", slug, "epic.yaml"),
  plan: (home: string, slug: string) => join(home, "epics", slug, "plan.md"),
  phases: (home: string, slug: string) => join(home, "epics", slug, "phases"),
  proposals: (home: string, slug: string) => join(epicRoot(home, slug), "proposals"),
  feedback: (home: string, slug: string) => (slug === REVIEW ? join(home, "reviews") : join(home, "epics", slug, "feedback")),
  prompts: (home: string, slug: string) => join(paths.feedback(home, slug), "prompts.jsonl"),
  notes: (home: string, slug: string) => join(paths.feedback(home, slug), "notes.md"),
  events: (home: string, slug: string) => join(home, "epics", slug, "feedback", "events.jsonl"),
  retros: (home: string, slug: string) => join(home, "epics", slug, "retros"),
  research: (home: string, slug: string) => join(home, "epics", slug, "research"),
  reviews: (home: string) => join(home, "reviews"),
  reviewFile: (home: string, date: string, n: number) => join(home, "reviews", n === 1 ? `${date}.md` : `${date}-${n}.md`),
  sessions: (home: string) => join(home, "sessions"),
  session: (home: string, id: string) => join(home, "sessions", id),
  hookLog: (home: string) => join(home, "hook.log"),
};
```

(`paths` referencing itself inside arrow functions is fine at call time. If typecheck complains about the self-reference, define `feedback` as a standalone `function feedbackDir(home, slug)` and use it in all three.)

`cli/lib/epic.ts` `createEpic`: at the top, `if (input.slug === REVIEW) throw new Error(\`'${REVIEW}' is reserved for feedback reviews\`);` with `import { REVIEW } from "./store.ts"`.

`cli/lib/session.ts`:

```ts
export function startReviewSession(home: string, id: string, now: string): SessionMarker {
  const marker: SessionMarker = { epic: REVIEW, phase: null, step: "feedback-review", started: now };
  writeMarker(home, id, marker);
  return marker;
}
```

`cli/commands/session.ts`: add `case "review": return sessionReview(rest, ctx);` and:

```ts
async function sessionReview(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { values } = parse(args, { session: { type: "string" } });
  const id = sessionIdFrom(ctx.env, optString(values, "session"));
  const marker = startReviewSession(ctx.home, id, ctx.now());
  mkdirSync(paths.reviews(ctx.home), { recursive: true });
  commit(ctx.home, "review: start session");
  return { json: { session: id, marker }, text: `review session ${id}` };
}
```

Usage: `session start|step [--phase <n>]|review|end`.

`cli/lib/proposal.ts`:

```ts
export type Destination = { kind: "plan" } | { kind: "phase"; id: number } | { kind: "review" };

export function parseDestination(text: string): Destination {
  if (text === "plan") return { kind: "plan" };
  if (text === "review") return { kind: "review" };
  const m = /^phase:(\d+)$/.exec(text);
  if (!m) throw new Error("--to must be plan, phase:<n>, or review");
  return { kind: "phase", id: Number(m[1]) };
}

function nextReviewFile(home: string, now: string): string {
  const date = now.slice(0, 10);
  for (let n = 1; ; n += 1) {
    const file = paths.reviewFile(home, date, n);
    if (!existsSync(file)) return file;
  }
}

export function approveTo(home: string, epic: string, id: number, dest: Destination, fromText: string | undefined, now: string): { proposal: Proposal; wrote: string } {
  let proposal = readProposal(home, epic, id);
  if (proposal.meta.outcome === "rejected" && fromText === undefined) {
    throw new Error(`proposal ${id} was rejected; pass --from to approve different text`);
  }
  const text = fromText ?? approvedText(proposal);
  if (proposal.meta.outcome !== "approved" || fromText !== undefined) proposal = markApproved(home, epic, id, text);
  const body = text.endsWith("\n") ? text : `${text}\n`;
  if (dest.kind === "plan") {
    const file = paths.plan(home, epic);
    writeFileSync(file, body);
    return { proposal, wrote: file };
  }
  if (dest.kind === "review") {
    if (epic !== REVIEW) throw new Error("--to review is only for the review pseudo-epic");
    mkdirSync(paths.reviews(home), { recursive: true });
    const file = nextReviewFile(home, now);
    writeFileSync(file, body);
    return { proposal, wrote: file };
  }
  const phase = writeBody(home, epic, dest.id, body);
  return { proposal, wrote: phase.path };
}
```

Import `REVIEW` from `./store.ts`. Update every `approveTo` caller: `cli/commands/proposal.ts` passes `ctx.now()`; tests in `test/proposal.test.ts` pass `NOW`. In `proposalApprove`, skip `readEpic`/`writeEpic` when `epic === REVIEW`, and set `where` to `"review"` for that destination.

- [ ] **Step 4: Run tests, commit**

Run: `npm test && npm run typecheck && claude plugin validate .`

```bash
git add cli/lib/store.ts cli/lib/epic.ts cli/lib/session.ts cli/commands/session.ts cli/lib/proposal.ts cli/commands/proposal.ts cli/planet.ts test/review-session.test.ts test/proposal.test.ts
git commit -m "add the review pseudo-epic for feedback review sessions"
```

---

### Task 4: `gh` PR feedback and `planet pr feedback`

**Files:**
- Modify: `cli/lib/gh.ts` (`PrFeedback` types, `Gh.prFeedback`, real implementation), `test/helpers.ts` (`fakeGh` feedback map), `cli/commands/pr.ts` (`feedback` subcommand; export `phasePrFiles`), `cli/planet.ts` usage
- Test: `test/pr-feedback.test.ts` (create)

**Interfaces:**
- Produces: `PrFeedback {url, head_sha, reviews: PrReview[], comments: PrComment[], failed_checks: PrCheck[]}` with `PrReview {author, state, body}`, `PrComment {author, path, line, body, resolved}`, `PrCheck {name, state, url}`; `Gh.prFeedback(url): Promise<PrFeedback>`; `phasePrFiles(ctx, epic, id): Promise<{source, prs, files}>`; CLI `planet pr feedback <epic> <phase>`.

- [ ] **Step 1: Failing test `test/pr-feedback.test.ts`**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { NOW, ctx, fakeGh, run, tmpHome } from "./helpers.ts";
import type { PrFeedback } from "../cli/lib/gh.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { linkPrs } from "../cli/lib/link.ts";
import { newPhases } from "../cli/lib/phase.ts";

const PR = "https://github.com/o/r/pull/7";
const FEEDBACK: PrFeedback = {
  url: PR,
  head_sha: "head777",
  reviews: [{ author: "ana", state: "CHANGES_REQUESTED", body: "rename the hook" }],
  comments: [{ author: "ana", path: "src/a.ts", line: 12, body: "useThing reads better", resolved: true }],
  failed_checks: [{ name: "typecheck", state: "FAILURE", url: "https://ci/1" }],
};

test("planet pr feedback aggregates reviews, comments, and failed checks per linked pr", async () => {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  linkPrs(home, "e", 1, [PR], NOW);
  const gh = fakeGh({}, {}, false, undefined, { [PR]: FEEDBACK });
  const r = await run(["pr", "feedback", "e", "1", "--json"], ctx(home, { gh }));
  assert.equal(r.code, 0);
  assert.deepEqual(r.json, { phase: 1, prs: [FEEDBACK] });
  assert.deepEqual(gh.calls.filter((c) => c.startsWith("prFeedback")), [`prFeedback:${PR}`]);
  const text = await run(["pr", "feedback", "e", "1"], ctx(home, { gh }));
  assert.match(text.stdout, /CHANGES_REQUESTED/);
  assert.match(text.stdout, /src\/a\.ts:12/);
  assert.match(text.stdout, /typecheck/);
});

test("planet pr feedback with no linked prs says so", async () => {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  const r = await run(["pr", "feedback", "e", "1"], ctx(home));
  assert.equal(r.code, 0);
  assert.equal(r.stdout.trim(), "no linked prs");
});
```

- [ ] **Step 2: Run, expect failure** (`fakeGh` has no fifth argument; `pr feedback` unknown).

- [ ] **Step 3: Implement `cli/lib/gh.ts`**

Add types and the interface method:

```ts
export interface PrReview { author: string; state: string; body: string; }
export interface PrComment { author: string; path: string; line: number | null; body: string; resolved: boolean; }
export interface PrCheck { name: string; state: string; url: string; }
export interface PrFeedback { url: string; head_sha: string; reviews: PrReview[]; comments: PrComment[]; failed_checks: PrCheck[]; }

export interface Gh {
  prStates(urls: string[]): Promise<PrInfo[]>;
  prFiles(url: string): Promise<PrFile[]>;
  prFeedback(url: string): Promise<PrFeedback>;
}
```

Real implementation, one GraphQL query per PR (add to the `realGh()` object):

```ts
    async prFeedback(url) {
      const query = `query { resource(url: ${JSON.stringify(url)}) { ... on PullRequest {
        headRefOid
        reviews(last: 50) { nodes { author { login } state body } }
        reviewThreads(last: 100) { nodes { isResolved comments(first: 50) { nodes { author { login } path line body } } } }
        commits(last: 1) { nodes { commit { statusCheckRollup { contexts(last: 100) { nodes {
          ... on CheckRun { name conclusion detailsUrl }
          ... on StatusContext { context state targetUrl } } } } } } }
      } } }`;
      const raw = JSON.parse(await gh(["api", "graphql", "-f", `query=${query}`])) as { data: { resource: GraphqlFeedback | null } };
      const pr = raw.data.resource;
      if (!pr) throw new Error(`no pull request at ${url}`);
      const reviews = pr.reviews.nodes.map((r) => ({ author: r.author?.login ?? "unknown", state: r.state, body: r.body }));
      const comments = pr.reviewThreads.nodes.flatMap((t) => t.comments.nodes.map((c) => ({ author: c.author?.login ?? "unknown", path: c.path, line: c.line, body: c.body, resolved: t.isResolved })));
      const contexts = pr.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? [];
      const failed_checks = contexts
        .map((c) => ("conclusion" in c ? { name: c.name, state: c.conclusion ?? "PENDING", url: c.detailsUrl ?? "" } : { name: c.context, state: c.state, url: c.targetUrl ?? "" }))
        .filter((c) => c.state !== "SUCCESS" && c.state !== "NEUTRAL" && c.state !== "SKIPPED");
      return { url, head_sha: pr.headRefOid, reviews, comments, failed_checks };
    },
```

With the response shape:

```ts
interface GraphqlFeedback {
  headRefOid: string;
  reviews: { nodes: { author: { login: string } | null; state: string; body: string }[] };
  reviewThreads: { nodes: { isResolved: boolean; comments: { nodes: { author: { login: string } | null; path: string; line: number | null; body: string }[] } }[] };
  commits: { nodes: { commit: { statusCheckRollup: { contexts: { nodes: ({ name: string; conclusion: string | null; detailsUrl: string | null } | { context: string; state: string; targetUrl: string | null })[] } } | null } }[] };
}
```

- [ ] **Step 4: `test/helpers.ts` `fakeGh`**

Add a fifth parameter `feedback: Record<string, PrFeedback> = {}` and the method:

```ts
    async prFeedback(url) {
      calls.push(`prFeedback:${url}`);
      if (unavailable) throw new GhUnavailable("offline");
      const f = feedback[url];
      if (!f) throw new Error(`no feedback stub for ${url}`);
      return f;
    },
```

Import `PrFeedback` from `../cli/lib/gh.ts`.

- [ ] **Step 5: `cli/commands/pr.ts`**

Extract the files loop into an exported helper and add the subcommand:

```ts
export async function phasePrFiles(ctx: Ctx, epic: string, id: number): Promise<{ source: "merged" | "all"; prs: string[]; files: PrFile[] }> {
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
  return { source, prs: urls, files: [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path)) };
}

async function prFeedback(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals } = parse(args, {});
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const phase = readPhase(ctx.home, epic, id);
  const prs: PrFeedback[] = [];
  for (const pr of phase.meta.prs) prs.push(await ctx.gh.prFeedback(pr.url));
  const lines: string[] = [];
  for (const f of prs) {
    lines.push(`${f.url} head ${f.head_sha}`);
    for (const r of f.reviews) lines.push(`  review ${r.author} ${r.state}${r.body ? `: ${r.body}` : ""}`);
    for (const c of f.comments) lines.push(`  ${c.resolved ? "resolved" : "open"} ${c.path}:${c.line ?? "-"} ${c.author}: ${c.body}`);
    for (const c of f.failed_checks) lines.push(`  check ${c.name} ${c.state} ${c.url}`);
  }
  return { json: { phase: id, prs }, text: prs.length ? lines.join("\n") : "no linked prs" };
}

export const prCommand: Command = async (args, ctx) => {
  const [sub, ...rest] = args;
  if (sub === "feedback") return prFeedback(rest, ctx);
  if (sub !== "files") throw new Error("usage: planet pr files|feedback <epic> <phase>");
  const { positionals } = parse(rest, {});
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const result = await phasePrFiles(ctx, epic, id);
  return {
    json: { phase: id, ...result },
    text: result.files.length ? renderTable(["PATH", "+", "-"], result.files.map((f) => [f.path, String(f.additions), String(f.deletions)])) : "no linked prs",
  };
};
```

Usage line: `  pr files|feedback <epic> <phase>`.

- [ ] **Step 6: Run tests, commit**

```bash
git add cli/lib/gh.ts test/helpers.ts cli/commands/pr.ts cli/planet.ts test/pr-feedback.test.ts
git commit -m "read pr reviews, comments, and failed checks"
```

---

### Task 5: `planet retro inputs` and `planet retro write`

**Files:**
- Create: `cli/lib/retro.ts`, `cli/commands/retro.ts`
- Modify: `cli/planet.ts` (`retro` command, usage), `cli/lib/store.ts` (`retroFile` path)
- Test: `test/retro.test.ts` (create)

**Interfaces:**
- Consumes: `listEvents`, `phasePrFiles`, `ctx.gh.prFeedback`, prompts file.
- Produces: `RetroLesson {text, skill, steer}`, `RETRO_SKILLS`, `RetroMeta {phase, prs, implemented_sha, head_sha, lessons, written}`, `retroFileName(id, slug)`, `writeRetro(home, epic, id, text, now): {path, meta}`, `listRetros(home, epic): {meta, body, path}[]`, `retroInputs(ctx, epic, id): Promise<RetroInputs>`; CLI `planet retro inputs <epic> <phase>`, `planet retro write <epic> <phase> --file <path>`.

`RetroInputs` shape:

```ts
export interface RetroInputs {
  phase: PhaseMeta;
  phase_path: string;
  plan_path: string;
  events: PlanetEvent[];
  implemented_sha: string | null;
  implemented_at: string | null;
  prs: PrFeedback[];
  files: { source: "merged" | "all"; prs: string[]; files: PrFile[] };
  prompts: { ts: string; text: string }[];
}
```

`prompts` are the lines from `prompts.jsonl` with `phase === id` and `ts > implemented_at` (all prompts with `phase === id` when there is no implemented event).

- [ ] **Step 1: Failing test `test/retro.test.ts`**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NOW, SESSION, ctx, fakeGh, run, tmpHome } from "./helpers.ts";
import { createEpic } from "../cli/lib/epic.ts";
import { appendEvent, listEvents } from "../cli/lib/events.ts";
import { linkPrs } from "../cli/lib/link.ts";
import { newPhases, readPhase } from "../cli/lib/phase.ts";
import { listRetros, retroFileName } from "../cli/lib/retro.ts";
import { paths } from "../cli/lib/store.ts";
import type { PrFeedback } from "../cli/lib/gh.ts";

const PR = "https://github.com/o/r/pull/7";
const FEEDBACK: PrFeedback = { url: PR, head_sha: "head777", reviews: [], comments: [], failed_checks: [] };
const LATER = "2026-09-03T16:00:00.000Z";

function setup(): string {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  linkPrs(home, "e", 1, [PR], NOW);
  return home;
}

test("retro inputs bundles events, prs, files, and prompts after the implemented event", async () => {
  const home = setup();
  appendEvent(home, "e", { phase: 1, kind: "blocked", text: "commit 2", session: SESSION }, NOW);
  appendEvent(home, "e", { phase: 1, kind: "implemented", sha: "impl123", session: SESSION }, LATER);
  mkdirSync(paths.feedback(home, "e"), { recursive: true });
  appendFileSync(paths.prompts(home, "e"), `${JSON.stringify({ ts: NOW, session: SESSION, kind: "implementation", phase: 1, proposal: null, text: "before" })}\n`);
  appendFileSync(paths.prompts(home, "e"), `${JSON.stringify({ ts: "2026-09-03T17:00:00.000Z", session: SESSION, kind: "implementation", phase: 1, proposal: null, text: "rename useFoo to useBar" })}\n`);
  appendFileSync(paths.prompts(home, "e"), `${JSON.stringify({ ts: "2026-09-03T17:00:00.000Z", session: SESSION, kind: "planning", phase: null, proposal: null, text: "other" })}\n`);
  const gh = fakeGh({}, { [PR]: [{ path: "src/a.ts", additions: 3, deletions: 1 }] }, false, undefined, { [PR]: FEEDBACK });
  const r = await run(["retro", "inputs", "e", "1", "--json"], ctx(home, { gh }));
  assert.equal(r.code, 0);
  const j = r.json as Record<string, unknown>;
  assert.equal((j.phase as { id: number }).id, 1);
  assert.equal(j.implemented_sha, "impl123");
  assert.equal(j.implemented_at, LATER);
  assert.equal((j.events as unknown[]).length, 2);
  assert.deepEqual(j.prompts, [{ ts: "2026-09-03T17:00:00.000Z", text: "rename useFoo to useBar" }]);
  assert.deepEqual((j.prs as PrFeedback[])[0].head_sha, "head777");
  assert.equal(((j.files as { files: unknown[] }).files).length, 1);
});

test("retro write validates frontmatter, writes the file, appends the reviewed event", async () => {
  const home = setup();
  const draft = join(tmpdir(), `retro-${Date.now()}.md`);
  writeFileSync(draft, ["---", "phase: 1", "lessons:", "  - text: name the test file in the plan", "    skill: planet-phase-plan", "    steer: true", "  - text: one-off rename", "    skill: not-planet", "    steer: false", "---", "# Retro: phase 1", "", "## Blocks", "none", ""].join("\n"));
  const bad = join(tmpdir(), `retro-bad-${Date.now()}.md`);
  writeFileSync(bad, "---\nphase: 1\nlessons:\n  - text: x\n    skill: planet-nope\n    steer: true\n---\nbody\n");
  const rb = await run(["retro", "write", "e", "1", "--file", bad], ctx(home));
  assert.equal(rb.code, 1);
  assert.match(rb.stderr, /skill must be one of/);
  const r = await run(["retro", "write", "e", "1", "--file", draft, "--json"], ctx(home));
  assert.equal(r.code, 0);
  const file = join(paths.retros(home, "e"), retroFileName(1, "a"));
  assert.ok(existsSync(file));
  const text = readFileSync(file, "utf8");
  assert.match(text, /^---\n/);
  assert.match(text, /written: "?2026-09-03T15:00:00.000Z"?/);
  assert.match(text, /prs:\n  - https:\/\/github.com\/o\/r\/pull\/7/);
  const retros = listRetros(home, "e");
  assert.equal(retros.length, 1);
  assert.equal(retros[0].meta.lessons.length, 2);
  assert.equal(retros[0].meta.lessons[0].steer, true);
  assert.deepEqual(listEvents(home, "e", 1).map((e) => e.kind), ["reviewed"]);
  assert.equal(readPhase(home, "e", 1).meta.status, "draft");
});
```

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement `cli/lib/store.ts`**

Add to `paths`: `retroFile: (home: string, slug: string, id: number, phaseSlug: string) => join(home, "epics", slug, "retros", \`${String(id).padStart(2, "0")}-${phaseSlug}.md\`),`

- [ ] **Step 4: Create `cli/lib/retro.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PhaseMeta } from "../schema/types.ts";
import type { PlanetEvent } from "./events.ts";
import { listEvents } from "./events.ts";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.ts";
import { readPhase } from "./phase.ts";
import { paths } from "./store.ts";

export const RETRO_SKILLS = ["planet-intake", "planet-scoping", "planet-phasing", "planet-phase-plan", "planet-implement", "not-planet"] as const;
export type RetroSkill = (typeof RETRO_SKILLS)[number];

export interface RetroLesson {
  text: string;
  skill: RetroSkill;
  steer: boolean;
}

export interface RetroMeta {
  phase: number;
  prs: string[];
  implemented_sha: string | null;
  head_sha: string | null;
  lessons: RetroLesson[];
  written: string;
}

export interface Retro {
  meta: RetroMeta;
  body: string;
  path: string;
}

export function retroFileName(id: number, slug: string): string {
  return `${String(id).padStart(2, "0")}-${slug}.md`;
}

function asRecord(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error(`${what} must be a mapping`);
  return v as Record<string, unknown>;
}

export function parseLessons(v: unknown): RetroLesson[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error("lessons must be a list");
  return v.map((item, i) => {
    const o = asRecord(item, `lessons[${i}]`);
    if (typeof o.text !== "string" || o.text.trim() === "") throw new Error(`lessons[${i}].text must be a non-empty string`);
    if (!(RETRO_SKILLS as readonly string[]).includes(String(o.skill))) throw new Error(`lessons[${i}].skill must be one of ${RETRO_SKILLS.join(", ")}`);
    if (typeof o.steer !== "boolean") throw new Error(`lessons[${i}].steer must be true or false`);
    return { text: o.text, skill: o.skill as RetroSkill, steer: o.steer };
  });
}

function latestSha(events: PlanetEvent[], kind: "implemented"): string | null {
  const hits = events.filter((e) => e.kind === kind && e.sha);
  return hits.length ? hits[hits.length - 1].sha : null;
}

/** Writes a retro from a drafted file: the draft's frontmatter must carry `phase` matching `id` and valid `lessons`; everything else is filled from the store. */
export function writeRetro(home: string, epic: string, id: number, draft: string, now: string, headSha: string | null): Retro {
  const phase = readPhase(home, epic, id);
  const { data, body } = parseFrontmatter(draft);
  const o = asRecord(data, "retro frontmatter");
  if (Number(o.phase) !== id) throw new Error(`retro frontmatter phase must be ${id}`);
  const lessons = parseLessons(o.lessons);
  const meta: RetroMeta = {
    phase: id,
    prs: phase.meta.prs.map((p) => p.url),
    implemented_sha: latestSha(listEvents(home, epic, id), "implemented"),
    head_sha: headSha,
    lessons,
    written: now,
  };
  mkdirSync(paths.retros(home, epic), { recursive: true });
  const path = paths.retroFile(home, epic, id, phase.meta.slug);
  writeFileSync(path, serializeFrontmatter({ ...meta }, body));
  return { meta, body, path };
}

export function listRetros(home: string, epic: string): Retro[] {
  const dir = paths.retros(home, epic);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{2}-[a-z0-9-]+\.md$/.test(f))
    .sort()
    .map((f) => {
      const path = join(dir, f);
      const { data, body } = parseFrontmatter(readFileSync(path, "utf8"));
      const o = asRecord(data, path);
      const meta: RetroMeta = {
        phase: Number(o.phase),
        prs: Array.isArray(o.prs) ? o.prs.map(String) : [],
        implemented_sha: typeof o.implemented_sha === "string" ? o.implemented_sha : null,
        head_sha: typeof o.head_sha === "string" ? o.head_sha : null,
        lessons: parseLessons(o.lessons),
        written: String(o.written ?? ""),
      };
      return { meta, body, path };
    });
}

export function phaseMetaFor(home: string, epic: string, id: number): PhaseMeta {
  return readPhase(home, epic, id).meta;
}
```

(Check `serializeFrontmatter`'s signature in `cli/lib/frontmatter.ts`; if it takes `(data: Record<string, unknown>, body: string)`, the call above is right. If it does not serialize nested arrays of objects, use the `yaml` package's `stringify` directly for the frontmatter block: `---\n${stringify(meta)}---\n${body}`.)

- [ ] **Step 5: Create `cli/commands/retro.ts`**

```ts
import { readFileSync } from "node:fs";
import type { Command, CommandResult, Ctx } from "../lib/context.ts";
import { need, needInt, needString, optString, parse } from "../lib/args.ts";
import { appendEvent, listEvents } from "../lib/events.ts";
import type { PrFeedback, PrFile } from "../lib/gh.ts";
import { readPhase } from "../lib/phase.ts";
import { writeRetro } from "../lib/retro.ts";
import { sessionIdFrom } from "../lib/session.ts";
import { commit, paths } from "../lib/store.ts";
import type { PhaseMeta } from "../schema/types.ts";
import { phasePrFiles } from "./pr.ts";
import { existsSync } from "node:fs";

export interface RetroInputs {
  phase: PhaseMeta;
  phase_path: string;
  plan_path: string;
  events: ReturnType<typeof listEvents>;
  implemented_sha: string | null;
  implemented_at: string | null;
  prs: PrFeedback[];
  files: { source: "merged" | "all"; prs: string[]; files: PrFile[] };
  prompts: { ts: string; text: string }[];
}

export async function retroInputs(ctx: Ctx, epic: string, id: number): Promise<RetroInputs> {
  const phase = readPhase(ctx.home, epic, id);
  const events = listEvents(ctx.home, epic, id);
  const implemented = [...events].reverse().find((e) => e.kind === "implemented") ?? null;
  const prs: PrFeedback[] = [];
  for (const pr of phase.meta.prs) prs.push(await ctx.gh.prFeedback(pr.url));
  const files = await phasePrFiles(ctx, epic, id);
  const promptsFile = paths.prompts(ctx.home, epic);
  const prompts = existsSync(promptsFile)
    ? readFileSync(promptsFile, "utf8")
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((l) => JSON.parse(l) as { ts: string; phase: number | null; text: string })
        .filter((p) => p.phase === id && (implemented === null || p.ts > implemented.ts))
        .map((p) => ({ ts: p.ts, text: p.text }))
    : [];
  return {
    phase: phase.meta,
    phase_path: phase.path,
    plan_path: paths.plan(ctx.home, epic),
    events,
    implemented_sha: implemented?.sha ?? null,
    implemented_at: implemented?.ts ?? null,
    prs,
    files,
    prompts,
  };
}

async function inputs(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals } = parse(args, {});
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const bundle = await retroInputs(ctx, epic, id);
  const text = [
    `phase ${id} ${bundle.phase.slug} ${bundle.phase.status} ${bundle.phase.kind}`,
    `implemented ${bundle.implemented_sha ?? "none"}${bundle.implemented_at ? ` at ${bundle.implemented_at}` : ""}`,
    `events ${bundle.events.length}, prs ${bundle.prs.length}, files ${bundle.files.files.length}, prompts after implemented ${bundle.prompts.length}`,
  ].join("\n");
  return { json: bundle, text };
}

async function write(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals, values } = parse(args, { file: { type: "string" }, head: { type: "string" }, session: { type: "string" } });
  const epic = need(positionals, 0, "epic slug");
  const id = needInt(positionals, 1, "phase id");
  const draft = readFileSync(needString(values, "file"), "utf8");
  const retro = writeRetro(ctx.home, epic, id, draft, ctx.now(), optString(values, "head") ?? null);
  const session = sessionIdFrom(ctx.env, optString(values, "session"));
  appendEvent(ctx.home, epic, { phase: id, kind: "reviewed", text: retro.path, session }, ctx.now());
  commit(ctx.home, `${epic}: retro phase ${id}`);
  return { json: { path: retro.path, meta: retro.meta }, text: `wrote ${retro.path}` };
}

export const retroCommand: Command = async (args, ctx) => {
  const [sub, ...rest] = args;
  if (sub === "inputs") return inputs(rest, ctx);
  if (sub === "write") return write(rest, ctx);
  throw new Error("usage: planet retro inputs <epic> <phase> | planet retro write <epic> <phase> --file <path> [--head <sha>]");
};
```

Register in `cli/planet.ts`: import `retroCommand`, add `retro: retroCommand` to `COMMANDS`, usage lines `  retro inputs <epic> <phase>` and `  retro write <epic> <phase> --file <path> [--head <sha>]`.

- [ ] **Step 6: Run tests, commit**

```bash
git add cli/lib/retro.ts cli/commands/retro.ts cli/lib/store.ts cli/planet.ts test/retro.test.ts
git commit -m "bundle retro inputs and write retros through the cli"
```

---

### Task 6: Report additions

**Files:**
- Modify: `cli/lib/report.ts` (`lessons`, `skill_rejections`, `events`, `reviews`), `cli/commands/feedback.ts` (text lines)
- Test: `test/report.test.ts` (append a test)

**Interfaces:**
- Produces: `FeedbackReport` gains `lessons: {epic, phase, text, skill, steer}[]`, `skill_rejections: Rejection[]`, `events: Record<string, number>`, `reviews: {date, path, groups: string[]}[]`.

- [ ] **Step 1: Failing test, appended to `test/report.test.ts`**

```ts
test("buildReport adds lessons, skill rejections, events, and reviews", () => {
  const home = tmpHome();
  createEpic(home, { slug: "e", title: "E", repo: "o/r" }, NOW);
  newPhases(home, "e", [{ slug: "a", title: "A" }]);
  const base = { phase: null, session: SESSION, toolUse: null, planFile: null };
  const p1 = createProposal(home, "e", { ...base, step: "phase-plan", body: "x" }, NOW);
  markRejected(home, "e", p1.meta.id, "always name the spec file");
  const p2 = createProposal(home, "e", { ...base, step: "phase-plan", body: "y" }, NOW);
  markRejected(home, "e", p2.meta.id, "drop this phase");
  writeFileSync(paths.notes(home, "e"), `- proposal ${p1.meta.id} · skill\n- proposal ${p2.meta.id} · scope-cut\n`);
  appendEvent(home, "e", { phase: 1, kind: "blocked", text: "c2", session: SESSION }, NOW);
  appendEvent(home, "e", { phase: 1, kind: "implemented", sha: "abc", session: SESSION }, NOW);
  writeRetro(home, "e", 1, "---\nphase: 1\nlessons:\n  - text: name the spec file\n    skill: planet-phase-plan\n    steer: true\n---\nbody\n", NOW, "head1");
  mkdirSync(paths.reviews(home), { recursive: true });
  writeFileSync(paths.reviewFile(home, "2026-09-01", 1), "# Findings\n\n## Recurring\n\n### Name the spec file in phase plans\n\ntext\n\n## Appendix\n");
  const report = buildReport(home, ["e"]);
  assert.deepEqual(report.lessons, [{ epic: "e", phase: 1, text: "name the spec file", skill: "planet-phase-plan", steer: true }]);
  assert.deepEqual(report.skill_rejections.map((r) => r.feedback), ["always name the spec file"]);
  assert.deepEqual(report.events, { blocked: 1, implemented: 1 });
  assert.deepEqual(report.reviews, [{ date: "2026-09-01", path: paths.reviewFile(home, "2026-09-01", 1), groups: ["Name the spec file in phase plans"] }]);
});
```

Add the imports the test needs: `mkdirSync` from `node:fs`, `appendEvent` from `../cli/lib/events.ts`, `writeRetro` from `../cli/lib/retro.ts`.

- [ ] **Step 2: Run, expect failure.**

- [ ] **Step 3: Implement in `cli/lib/report.ts`**

Add to the interface and builder:

```ts
export interface LessonRow { epic: string; phase: number; text: string; skill: string; steer: boolean; }
export interface ReviewRow { date: string; path: string; groups: string[]; }

export interface FeedbackReport {
  epics: string[];
  steps: StepStats[];
  rejections: Rejection[];
  edits: Edit[];
  tags: Record<string, number>;
  prompts: Record<string, number>;
  lessons: LessonRow[];
  skill_rejections: Rejection[];
  events: Record<string, number>;
  reviews: ReviewRow[];
}

/** Proposal ids tagged in notes.md, by tag. */
export function tagsByProposal(notes: string): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const line of notes.split("\n")) {
    const m = NOTE_RE.exec(line);
    if (!m) continue;
    const id = Number(m[1]);
    out.set(id, [...(out.get(id) ?? []), m[2]]);
  }
  return out;
}

export function listReviews(home: string): ReviewRow[] {
  const dir = paths.reviews(home);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}(-\d+)?\.md$/.test(f))
    .sort()
    .map((f) => {
      const path = join(dir, f);
      const text = readFileSync(path, "utf8");
      const recurring = text.split(/^## /m).find((s) => s.startsWith("Recurring"));
      const groups = recurring ? [...recurring.matchAll(/^### (.+)$/gm)].map((m) => m[1].trim()) : [];
      return { date: f.slice(0, 10), path, groups };
    });
}
```

In `buildReport`, per epic: read `tagsByProposal(notes)` once, push a rejection into `skill_rejections` when its id has the `skill` tag; count `listEvents(home, epic)` kinds into `events`; map `listRetros(home, epic)` lessons into `lessons`. After the loop, `reviews = listReviews(home)`. Return them all. Import `readdirSync` from `node:fs`, `listEvents` from `./events.ts`, `listRetros` from `./retro.ts`.

`cli/commands/feedback.ts` text: append lines `lessons: <steer-yes count> steer, <total> total`, `skill rejections: <n>`, `events: kind=n ...` or `none`, `reviews: <n>` (`last <date>` when any).

- [ ] **Step 4: Run tests, commit**

```bash
git add cli/lib/report.ts cli/commands/feedback.ts test/report.test.ts
git commit -m "report lessons, skill rejections, events, and past reviews"
```

---

### Task 7: `planet-retro` skill

**Files:**
- Create: `skills/planet-retro/SKILL.md`, `skills/planet-retro/references/retro-template.md`
- Modify: `test/skills.test.ts:9-11` (`REQUIRED_SKILLS`, `HIDDEN`, `WORD_BUDGET` `"planet-retro": 900`)

**Interfaces:**
- Consumes: `planet retro inputs`, `planet retro write --file --head`, `planet phase set --status reviewed`; router lines `epic:`, `dir:`, `phase:`.
- Produces: return lines `retro done for phase <N>`, `re-cut from phase <N>: <why>`, `retro aborted: <message>` (not used; retro has no gate), `phase <N> not shipped`.

- [ ] **Step 1: Harness first**: add the three entries; `npm test` shows `missing skills/planet-retro/SKILL.md`.

- [ ] **Step 2: Create `skills/planet-retro/references/retro-template.md`**

```markdown
# Retro document

Frontmatter is validated by `planet retro write`: `phase` must match, every
lesson has `text`, `skill`, and `steer`. Everything else in the frontmatter is
filled by the CLI.

```
---
phase: <N>
lessons:
  - text: <one sentence, what a skill should do differently>
    skill: planet-phase-plan | planet-implement | planet-scoping | planet-phasing | planet-intake | not-planet
    steer: true | false
---
# Retro: phase <N>, <title>

## Blocks
One paragraph per blocked event: the commit, why, what the re-plan changed.
"none" when there were none.

## Refinements
From `<implemented_sha>` to `<head_sha>`, <files> files, <insertions>+ <deletions>-.

| Category | Count | Example |
|---|---|---|
| naming | | |
| comments | | |
| tests | | |
| structure | | |
| scope | | |
| other | | |

Prompts in the window, each quoted once under the category it drove:
- <category>: "<prompt>"

"no implemented event; refinements not measurable" when the sha is missing.

## Review and CI
Review comments grouped by theme, one line each with the file. Failed checks
with the commit that fixed them. "none" when empty.

## Plan versus shipped
One paragraph: planned files not changed, changed files not planned, commits
added or dropped, each classed plan wrong, discovered, or scope changed.

## Lessons
One line per lesson, matching the frontmatter: text, the skill, steer yes or
no as answered.
```

Under 600 words. A manual phase replaces Refinements, Review and CI, and Plan
versus shipped with `## Outcome`: did Done means hold, what took longer or
differed, in the user's words.
```

- [ ] **Step 3: Create `skills/planet-retro/SKILL.md`**

```markdown
---
name: planet-retro
description: Only invoked by the Planet router, never on its own. Reviews one shipped phase of a Planet epic against what happened during and after implementation, writes the retro with weighed lessons, and marks the phase reviewed. Do not use outside a Planet session.
user-invocable: false
allowed-tools: Bash(planet *), Bash(git diff *), Bash(git log *), Bash(gh pr view *)
compatibility: Claude Code with the planet plugin loaded, run from the epic's repo. gh authenticated.
metadata:
  version: 0.1.0
---

# Planet: retro

Input from the router: `epic: <slug>`, `dir: <path>`, `phase: <N>`. Precondition: the phase is `shipped`. Output: `retros/NN-<slug>.md` written through the CLI, status `reviewed`, and the return line. The next phase-plan reads the retro; this step edits no plan.

## Critical rules

- Read `planet retro inputs`, the phase document, and `plan.md`'s Approach. Read a diff only for the implemented-to-head range and for a file the plan and the PR disagree on. Nothing else from the store or the repo.
- Rank by signal: blocked events, then the refinement window (diff plus prompts), then review and CI feedback, then plan versus shipped, which gets one paragraph.
- Summarize the refinement diff into categories (naming, comments, tests, structure, scope, other) with a count and one example each. Never list hunks.
- At most three candidate lessons, each naming the skill it would change. Ask once which steer the plugin. Record the answer as given; do not argue it.
- The retro is written only by `planet retro write`; status only by `planet phase set`.

## Steps

1. **Inputs.** `planet retro inputs <slug> <N> --json`. Read the phase document (Commits, or the older Changes and Commit sequence) and `plan.md`'s Approach. A phase that is not `shipped`: return `phase <N> not shipped`.
2. **Blocks.** For each `blocked` event: the commit, the why, and what the re-plan changed, read from the proposals for that phase (`planet epic show <slug> --json` lists their paths).
3. **Refinements.** With an implemented sha and a head sha: `git diff --stat <implemented_sha>..<head_sha>`, then the diff; categorize; pair each prompt from the window with the category it drove, quoted once. Without an implemented event, write that refinements were not measurable and go on.
4. **Review and CI.** From the inputs' `prs`: group review comments by theme with their file; list failed checks and the commit that fixed each, from `git log`.
5. **Plan versus shipped.** Compare the phase document's Files (or Changes) and commit subjects against `files` and `git log --format=%s` on the PR range. One paragraph, each difference classed plan wrong, discovered, or scope changed. A cut that was wrong is a hand-up: return `re-cut from phase <N>: <why>` and write nothing.
6. **Lessons.** Up to three. Each: one sentence, the skill it points at, the evidence line. Ask one multi-select question, which of these should steer the plugin; the rest are `steer: false`. Say the retro's five-line summary in the same message.
7. **Write.** Compose from `references/retro-template.md` into a file in the scratch directory; `planet retro write <slug> <N> --file <path> --head <head_sha>`; `planet phase set <slug> <N> --status reviewed`.
8. **Return** `retro done for phase <N>`.

Manual phase: skip steps 3 to 5; ask one question, did Done means hold and what took longer or differed; write it under `## Outcome`.

## Example

Phase 2, `move-subdirs`, one merged PR. Inputs: one `blocked` event at commit 3 (a barrel file the plan did not know about), implemented sha `a1b2c3d`, head `e4f5g6h`, seven prompts after implemented, one review comment, no failed checks. Diff stat: 4 files, 18+ 11-. Categories: naming 2 (`iconPath` to `iconSrc`), tests 1 (a `describe` block split), comments 1 (a docblock cut). Prompts paired: "rename iconPath, it is a URL" under naming. Review: one comment asking for the barrel export order. Plan versus shipped: the barrel file was discovered. Lessons: "phase-plan's sweep should list barrel files the moved modules pass through" (planet-phase-plan), "implement should not add a docblock the plan did not ask for" (planet-implement), "the describe split was taste" (not-planet). The user steers the first two. Write, set reviewed, return `retro done for phase 2`.

## Troubleshooting

- `planet retro inputs` fails on `gh`: write the retro from events, prompts, and the local branch; say review and CI were not read.
- No PR linked to a `pr` phase: say so; Plan versus shipped uses the local branch if it exists, else says unmeasured.
- The implemented sha is not in the local repo: `git fetch` the PR branch (`gh pr view <url> --json headRefName`), then retry the diff once.
- `planet retro write` rejects the frontmatter: fix the lesson entries; each needs text, skill, steer.
- `planet phase set` refuses: the phase is not `shipped`; report its status and stop.
```

- [ ] **Step 4: Run checks**

Run: `npm test && npm run typecheck && claude plugin validate .` and `awk 'f>=2{print} /^---$/{f++}' skills/planet-retro/SKILL.md | wc -w`
Expected: pass; body under 900.

- [ ] **Step 5: Commit**

```bash
git add skills/planet-retro test/skills.test.ts
git commit -m "add the planet-retro step skill"
```

---

### Task 8: `planet-feedback-review` skill

**Files:**
- Create: `skills/planet-feedback-review/SKILL.md`, `skills/planet-feedback-review/references/findings-template.md`
- Modify: `test/skills.test.ts:9-11` (add `"planet-feedback-review"` to `REQUIRED_SKILLS`, `HIDDEN`; budget 900)

**Interfaces:**
- Consumes: `planet feedback report --json`, retros by path from the report, `planet:planet-proposal` with `epic: review`, `to: review`; router line `since: <date or none>`.
- Produces: `feedback review done, <branch>`, `feedback review done, nothing recurs`, `feedback-review aborted: <message>`.

- [ ] **Step 1: Harness first**; expect `missing skills/planet-feedback-review/SKILL.md`.

- [ ] **Step 2: Create `references/findings-template.md`**

```markdown
# Findings document

```
# Feedback review <date>

Since: <last review date or the beginning>. Sources: <N> steer-yes lessons,
<N> skill-tagged rejections, <N> retros, <N> epics.

## Recurring

### <what the group asks for, as a sentence>
Seen <N> times in <phases or epics>:
- "<quote>" (<epic> phase <N> | proposal <id>)
- ...
Skill: `skills/<name>/SKILL.md` <section or step>.
Replace:
> <current text>
With:
> <new text>
Budget: <words before> to <words after> of <budget>.

## Appendix

### Singletons
- <text> (<source>): seen once; steer yes but no recurrence yet.

### Plan-local
- <text> (<source>): about that epic, not the skill.

### Not Planet's to fix
- <text> (<source>): points at <superpowers | CLAUDE.md | the repo>.
```

Under 1,000 words. One `###` per recurring group; the group heading is what
later reviews match against, so keep it stable when the same group recurs.
```

- [ ] **Step 3: Create `skills/planet-feedback-review/SKILL.md`**

```markdown
---
name: planet-feedback-review
description: Only invoked by the Planet router, never on its own. Reads the feedback report and retros across every epic, groups recurring pushback, proposes exact edits to the Planet step skills through plan mode, and applies approved edits on a branch in the plugin repo. Do not use outside a Planet review session.
user-invocable: false
allowed-tools: Bash(planet *), Bash(git *), Bash(npm test)
compatibility: Claude Code with the planet plugin loaded, run from the plugin repo itself.
metadata:
  version: 0.1.0
---

# Planet: feedback-review

Input from the router: `since: <date or none>`. Precondition: the current directory is the plugin repo and `planet session review` has run. Output: a findings document approved through the gate and recorded in the store, edits committed on a branch, and the return line.

## Critical rules

- Read `planet feedback report --json` and the retros it lists. Not raw proposals or prompts; the report carries the rejections verbatim.
- An edit needs recurrence: the same steer-yes lesson or `skill` rejection in two phases or two epics, or one the user named in the request. Everything else goes in the appendix with a count and no edit.
- Every edit is exact replacement text for a named skill file and section. Run `npm test` before each commit; a budget failure is fixed by trimming in that skill and said in the commit body.
- Never commit to `main`. Never edit anything outside `skills/`; pushback about superpowers, CLAUDE.md, or the repo goes under "not Planet's to fix".
- The findings document is written by the gate and recorded by `planet proposal approve review latest --to review`. Nothing else is written to the store.

## Steps

1. **Report.** `planet feedback report --json`. Take `lessons` with `steer: true`, `skill_rejections`, and `reviews`. Drop any lesson or rejection whose group heading already appears in a past review's `groups`. Read each listed retro's Lessons section for the evidence lines.
2. **Group.** Cluster by what they ask for, not by wording. A group recurs when its items span two phases or two epics. Attach every quote with its source.
3. **Draft** from `references/findings-template.md`: one section per recurring group with quotes, count, the skill file and section, current text, replacement text, and the word count effect against the harness budget (count with `awk 'f>=2{print} /^---$/{f++}' skills/<name>/SKILL.md | wc -w`). Then the appendix. No recurring group: skip to step 6 with the second return line.
4. **Gate.** Invoke `planet:planet-proposal` with `epic: review`, `to: review`. On rejection, amend in place and gate again. On `aborted: <message>`, run `planet proposal reject review latest --feedback "<message>"` and return `feedback-review aborted: <message>`.
5. **Apply.** `git checkout -b feedback-review/<date>` from an up-to-date `main`. For each skill file in the approved document, apply its replacements, run `npm test`, commit `<skill>: <group heading, lowercased>`. Leave the branch checked out.
6. **Return** `feedback review done, feedback-review/<date>`, or `feedback review done, nothing recurs`.

## Example

Report: three steer-yes lessons, two `skill` rejections, one past review dated 2026-09-01 with the group "Name the spec file in phase plans". Two lessons and one rejection from different epics all ask phase-plan to state the test file and its describe block before implementation; that group recurs and is not in the past review. One rejection asks implement to stop adding docblocks: seen once, appendix. Draft: one recurring group pointing at `skills/planet-phase-plan/SKILL.md` step 5 with the replacement sentence and "659 to 671 of 1,500". Gate, approve, record. Branch `feedback-review/2026-09-10`, one commit `planet-phase-plan: name the test file and describe block in commits`, `npm test` green. Return `feedback review done, feedback-review/2026-09-10`.

## Troubleshooting

- `planet feedback report` lists no lessons and no skill rejections: return `feedback review done, nothing recurs` without a gate.
- The gate reports the hooks did not run: `planet session review` was not run; return that message to the router.
- `npm test` fails on a budget after an edit: trim the same skill's Example or Troubleshooting until it passes; say so in the commit body.
- `main` is behind the remote: `git pull --ff-only` before branching; if that fails, stop and report.
```

- [ ] **Step 4: Run checks; body under 900.**

- [ ] **Step 5: Commit**

```bash
git add skills/planet-feedback-review test/skills.test.ts
git commit -m "add the planet-feedback-review step skill"
```

---

### Task 9: Router, implement, proposal, scoping, phase-plan edits

**Files:**
- Modify: `skills/go/SKILL.md` (steps 3, 5, 6, 7), `test/skills.test.ts:11` (`go: 1200`, `"planet-implement": 750`), `skills/planet-implement/SKILL.md` (step 7, Blockers), `skills/planet-proposal/SKILL.md` (input line, tags, `to: review`), `skills/planet-intake/SKILL.md`, `skills/planet-scoping/SKILL.md`, `skills/planet-phasing/SKILL.md`, `skills/planet-phase-plan/SKILL.md` (abort lines run `proposal reject`; scoping budget; phase-plan lessons sentence), `skills/planet-scoping/references/plan-v2-template.md:45`

**Interfaces:**
- Consumes: retro return lines (Task 7), feedback-review return lines and `since:` input (Task 8), `planet phase event`, `planet session step --phase`, `planet session review`, `planet proposal reject`.

- [ ] **Step 1: Budgets** in `test/skills.test.ts` line 11: `go: 1200`, `"planet-implement": 750`.

- [ ] **Step 2: Router step 3**

Replace `a step name (\`scoping\`, \`phasing\`, \`phase-plan\`, or \`phase-plan N\` to re-plan phase N),` with `a step name (\`scoping\`, \`phasing\`, \`phase-plan\`, \`phase-plan N\` to re-plan phase N, \`retro N\`), \`work on N\` (run \`planet session start <slug> --phase N\`, say the marker is set, stop), \`review feedback\` (step 10),`.

- [ ] **Step 3: Router step 5**

Replace `Any phase \`draft\`: phase-plan, lowest id first.` with `Any phase \`shipped\`: retro, lowest id first. Any phase \`draft\`: phase-plan, lowest id first.` and delete the sentence `Any phase \`shipped\`, no retro: say \`next step: retro (not built yet); the epic is saved, /planet:go <slug> resumes here\` and stop.`

- [ ] **Step 4: Router step 6**

Replace `before intake, scoping, phase-plan, or implement` with `before intake, scoping, phase-plan, retro, or implement`.

- [ ] **Step 5: Router step 7**

Replace `Run \`planet session step <step>\`.` with `Run \`planet session step <step>\`, adding \`--phase <N>\` for phase-plan and retro.` Replace `phase-plan also gets \`phase: <N>\`, the id step 5 chose or the request named;` with `phase-plan and retro also get \`phase: <N>\`, the id step 5 chose or the request named;`. Add a return-line bullet after the `phase N planned` bullet:

```
   - `retro done for phase N`: run `planet epic show <slug> --json`, go to step 5.
   - `phase N not shipped`: say so, stop.
```

- [ ] **Step 6: Router step 10, new**

After step 9 add:

```
10. **Review feedback.** Only for the request `review feedback`. The directory must be the plugin repo: `git rev-parse --show-toplevel` equals `$CLAUDE_PLUGIN_ROOT`, else say `run /planet:go review feedback from the planet plugin repo` and stop. Run `planet session review`, then `planet feedback report --json` for the last review date, and invoke `planet:planet-feedback-review` with `since: <date or none>`. On either `feedback review done` line: say it, run `planet session end`. On `feedback-review aborted: <why>`: say so, run `planet session end`.
```

Renumber the old step 10 (`Done`) to 11.

- [ ] **Step 7: Count and trim** to ≤ 1,200 if needed; trims only in Troubleshooting and the Example.

- [ ] **Step 8: `skills/planet-implement/SKILL.md`**

Step 7: replace `7. **Return** \`phase <N> implemented, <PR url>\`.` with `7. **Record and return.** \`planet phase event <slug> <N> implemented --sha $(git rev-parse HEAD)\`, then return \`phase <N> implemented, <PR url>\`.`

Blockers: replace `Leave the branch and its commits in place. Return` with `Leave the branch and its commits in place. Run \`planet phase event <slug> <N> blocked "<why>"\`. Return`.

Body ≤ 750.

- [ ] **Step 9: `skills/planet-proposal/SKILL.md`**

Input line: `Input from the calling step: \`epic\` slug (or \`review\` for a feedback review), \`to\` (\`plan\`, \`phase:<n>\`, or \`review\`).` Step 3 tag list: `scope-cut, scope-add, reorder, wrong-assumption, too-granular, too-coarse, style, skill (the user says the skill or Planet should behave differently in general, not this plan), other`. Budget 350; trim the Example if over.

- [ ] **Step 10: Abort lines run `proposal reject`**

In intake, scoping, phasing, phase-plan, the sentence `On \`aborted: <message>\`, return \`<step> aborted: <message>\`.` becomes `On \`aborted: <message>\`, run \`planet proposal reject <slug> latest --feedback "<message>"\`, then return \`<step> aborted: <message>\`.` (four files; keep each skill's own step name).

- [ ] **Step 11: Scoping budget**

`skills/planet-scoping/SKILL.md` step 5: `Under 800 words, not counting that section.` → `About 1,000 words, at most 1,200, not counting that section.` Template line 45: `Under 800 words, not counting a carried \`## Phases\` section.` → `About 1,000 words, at most 1,200, not counting a carried \`## Phases\` section.`

- [ ] **Step 12: Phase-plan reads lessons**

`skills/planet-phase-plan/SKILL.md` step 1, append: `A previous phase's retro with a steer-yes lesson for \`planet-phase-plan\` is applied to this draft, and Context says which.`

- [ ] **Step 13: Run checks, commit in three groups**

```bash
git add skills/go/SKILL.md test/skills.test.ts
git commit -m "route retro before phase-plan and add review feedback and work on"
git add skills/planet-implement/SKILL.md skills/planet-proposal/SKILL.md
git commit -m "record implement events and accept the skill tag and review destination"
git add skills/planet-intake/SKILL.md skills/planet-scoping/SKILL.md skills/planet-phasing/SKILL.md skills/planet-phase-plan/SKILL.md skills/planet-scoping/references/plan-v2-template.md
git commit -m "reject aborted proposals, widen the scoping budget, and apply retro lessons in phase-plan"
```

---

### Task 10: README and version

**Files:**
- Modify: `README.md` Use section, `.claude-plugin/plugin.json` version `0.4.0` to `0.5.0` and description

- [ ] **Step 1:** In the Use section paragraph, replace `Retro
follows.` (check the exact line break in the file) with `When a phase ships, retro runs before the next phase plan and records weighed lessons; \`/planet:go review feedback\` from the plugin repo turns recurring lessons and skill-tagged rejections into approved edits to the skills.`
- [ ] **Step 2:** `plugin.json` version `0.5.0`; description `Epic planning across PRs: intake, scoping, phasing, phase plans through plan mode, implementation to a linked PR, retro, feedback review, PR sync`.
- [ ] **Step 3:** Checks, commit `document retro and feedback review and bump the plugin version`.

---

### Task 11: Live verification

Manual, in fresh `claude --plugin-dir` sessions. Record in `docs/superpowers/notes/2026-09-10-feedback-loop-live.md`.

- [ ] **Step 1: Retro on a pr phase without events.** From close-ui: `/planet:go finish-security-settings-page`. Expected: the router picks retro for phase 1 (shipped), runs `planet session step retro --phase 1`, dispatches retro; inputs show no implemented event; Refinements says not measurable; Review and CI from `pr feedback`; plan versus shipped from `pr files`; up to three lessons and one multi-select; `retros/01-sso-change-confirm-refetch.md` written with frontmatter; phase `reviewed`; router refreshes and picks retro for phase 2.
- [ ] **Step 2: Retro on a manual phase.** Phase 2 (manual): one question, `## Outcome`, lessons, `reviewed`. Router then picks phase-plan for phase 4 (lowest draft) or the planned phase 3 is left alone.
- [ ] **Step 3: Implement records events.** On any epic with a planned phase, Implement: check `feedback/events.jsonl` gains `implemented` with a sha; force a block if convenient and check the `blocked` event.
- [ ] **Step 4: Review feedback.** From the plugin repo: `/planet:go review feedback`. Expected: repo check passes, `planet session review` marker, report read, findings document in plan mode with at least one recurring group (tag two rejections `skill` beforehand if none recur), approval writes `~/.planet/reviews/<date>.md`, branch `feedback-review/<date>` with one commit per skill, `npm test` green, return line, session ended. Run it once more: `nothing recurs`.
- [ ] **Step 5: Record.** Deviations, fixes as their own commits, then `record feedback loop live verification`.

---

## Self-review notes

- Spec coverage: store additions → Tasks 1, 3, 5; CLI changes → Tasks 1 to 6 (phase event T1; retro inputs and write T5; pr feedback T4; report T6; session review and approve --to review T3; proposal reject, session step --phase, prompt kind, skill tag T2); retro skill → T7; feedback-review → T8; router and other skills → T9; README → T10; testing → each task plus T11.
- Deviation from the spec, stated: the review record is the approved findings document as written; the skill does not append an "Applied" section (it cannot write to the store by hand). The branch's git log holds the commit shas. Past-review matching uses the `### ` group headings under `## Recurring`.
- Names: `planet retro inputs`/`write`, `planet pr feedback`, `planet phase event`, `planet session review`, `planet proposal reject`, `--to review` are spelled the same in the CLI tasks, the skills, and the router. Return lines identical between Tasks 7, 8, and 9. Lesson skill names in `RETRO_SKILLS` match the template and the skill text (`not-planet`).
- Budgets: router 1,200, implement 750, retro and feedback-review 900, proposal 350.
