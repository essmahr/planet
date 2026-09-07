# Planet Skills: Router, Gate, Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first three Planet skills, `/planet:go`, `planet-proposal`, and `planet-intake`, plus the two CLI verbs they need, so one real epic can be opened and taken through intake end to end.

**Architecture:** Skills are Markdown files under `skills/<name>/SKILL.md` in the plugin, loaded by Claude Code. They call the existing `planet` CLI for every read and write and never touch the store directly. The router gets status through dynamic context injection at load time. The gate wraps native plan mode; the hooks from follow-on 1 record outcomes. Intake keeps research in the main thread except codebase exploration, which one subagent writes to `research/`.

**Tech Stack:** Claude Code skills (frontmatter per the skills reference), the existing TypeScript CLI on Node 24, `node:test`, `yaml`.

**Spec:** `docs/superpowers/specs/2026-09-07-planet-skills-design.md`, with `docs/superpowers/specs/2026-09-03-planet-design.md` as the parent.

## Global Constraints

- Only erasable TypeScript in `cli/` and `test/`: no `enum`, no parameter properties, no `namespace`. Relative imports name `.ts`. Types via `import type`. Runtime dependency `yaml` only.
- Commands commit after writes with `<epic>: <what happened>`; `cli/lib/*` never commits.
- Skill frontmatter: `name` equals the folder; `description` plus `when_to_use` under 1,536 characters, no `<` or `>`; `compatibility` and `metadata.version` present; `allowed-tools` includes `Bash(planet *)`.
- `go` has `disable-model-invocation: true`. `planet-proposal` and `planet-intake` have `user-invocable: false` and a description opening with "Only invoked by".
- Body word budgets, frontmatter excluded: `go` 800, `planet-proposal` 300, `planet-intake` 1,500.
- Skill text never names the user; it says "the user" or "you".
- Tag list, exact: `scope-cut`, `scope-add`, `reorder`, `wrong-assumption`, `too-granular`, `too-coarse`, `style`, `other`.
- Commit messages: lowercase imperative, no prefix, no trailing period.
- `npm test`, `npm run typecheck`, and `claude plugin validate .` before every commit.

## File Structure

```
cli/schema/types.ts                 add FEEDBACK_TAGS and Tag
cli/lib/proposal.ts                 add resolveProposalId, tagProposal
cli/commands/proposal.ts            approve accepts latest/latest-N; new tag subcommand
cli/planet.ts                       USAGE line for proposal tag
test/proposal.test.ts               resolver and tag tests
test/cli-structure.test.ts          command tests
test/skills.test.ts                 skills-as-data checks over skills/*/SKILL.md
skills/go/SKILL.md                  router
skills/planet-proposal/SKILL.md     gate
skills/planet-intake/SKILL.md       intake
skills/planet-intake/references/research-brief.md   subagent brief
skills/planet-intake/references/plan-template.md    plan.md headings
README.md                           skills section
docs/superpowers/notes/2026-09-07-skill-baselines.md   what Claude did without each skill
docs/superpowers/notes/2026-09-07-skills-live.md       live verification results
```

---

### Task 1: Proposal id aliases and `proposal tag`

**Files:**
- Modify: `cli/schema/types.ts`, `cli/lib/proposal.ts`, `cli/commands/proposal.ts`, `cli/planet.ts`
- Test: `test/proposal.test.ts`, `test/cli-structure.test.ts`

**Interfaces:**
- Consumes: `listProposals`, `latestProposalId`, `readProposal` from `cli/lib/proposal.ts`; `paths.notes`; `NOTE_RE` format in `cli/lib/report.ts` is `- proposal <N> · <tag>`.
- Produces:
  - `FEEDBACK_TAGS: readonly Tag[]` and `type Tag` in `types.ts`
  - `resolveProposalId(home: string, epic: string, text: string): number` accepting a positive integer, `latest`, or `latest-N`
  - `tagProposal(home: string, epic: string, id: number, tag: Tag): string` appending the notes line, returning the line written
  - `planet proposal tag <epic> <id> <tag>` command, commit `<epic>: tag proposal <N> <tag>`

- [ ] **Step 1: Write the failing tests**

Append to `test/proposal.test.ts`:

```ts
import { resolveProposalId, tagProposal } from "../cli/lib/proposal.ts";

test("resolveProposalId accepts numbers, latest, and latest-N", () => {
  const home = setup();
  for (let i = 0; i < 3; i += 1) createProposal(home, "e", input, NOW);
  assert.equal(resolveProposalId(home, "e", "2"), 2);
  assert.equal(resolveProposalId(home, "e", "latest"), 3);
  assert.equal(resolveProposalId(home, "e", "latest-1"), 2);
  assert.equal(resolveProposalId(home, "e", "latest-2"), 1);
  assert.throws(() => resolveProposalId(home, "e", "latest-3"), /no proposal 0/);
  assert.throws(() => resolveProposalId(home, "e", "newest"), /proposal id must be a number, latest, or latest-N/);
  const empty = tmpHome();
  createEpic(empty, { slug: "x", title: "X", repo: "o/r" }, NOW);
  assert.throws(() => resolveProposalId(empty, "x", "latest"), /no proposals/);
});

test("tagProposal appends a notes line in the report's format", () => {
  const home = setup();
  createProposal(home, "e", input, NOW);
  assert.equal(tagProposal(home, "e", 1, "reorder"), "- proposal 1 · reorder");
  tagProposal(home, "e", 1, "style");
  assert.equal(readFileSync(paths.notes(home, "e"), "utf8"), "- proposal 1 · reorder\n- proposal 1 · style\n");
  assert.throws(() => tagProposal(home, "e", 9, "style"), /no proposal 9/);
});
```

Merge the new import with the existing import line from `../cli/lib/proposal.ts` in that file, and make sure `readFileSync` and `createEpic` are imported.

Append to `test/cli-structure.test.ts`:

```ts
import { FEEDBACK_TAGS } from "../cli/schema/types.ts";
import { parseTags } from "../cli/lib/report.ts";

test("proposal approve accepts latest; proposal tag validates and commits", async () => {
  const home = await setup();
  await run(["phase", "new", "e", "a", "--title", "A"], ctx(home));
  const file = join(home, "draft.md");
  writeFileSync(file, "# Draft\n");
  await run(["propose", "e", "phase-plan", "--file", file, "--phase", "1"], ctx(home));
  await run(["propose", "e", "phase-plan", "--file", file, "--phase", "1"], ctx(home));
  const approved = await run(["proposal", "approve", "e", "latest", "--to", "phase:1"], ctx(home));
  assert.equal(approved.code, 0);
  assert.equal(readProposal(home, "e", 2).meta.outcome, "approved");
  assert.equal(readProposal(home, "e", 1).meta.outcome, "pending");

  const tagged = await run(["proposal", "tag", "e", "latest-1", "scope-cut", "--json"], ctx(home));
  assert.equal(tagged.code, 0);
  assert.deepEqual(tagged.json, { proposal: 1, tag: "scope-cut", line: "- proposal 1 · scope-cut" });
  assert.equal(git(home, ["log", "-1", "--format=%s"]).trim(), "e: tag proposal 1 scope-cut");
  assert.deepEqual(parseTags(readFileSync(paths.notes(home, "e"), "utf8")), { "scope-cut": 1 });

  const bad = await run(["proposal", "tag", "e", "latest", "meh"], ctx(home));
  assert.equal(bad.code, 1);
  assert.equal(bad.stderr, `planet: tag must be one of ${FEEDBACK_TAGS.join(", ")}\n`);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/proposal.test.ts test/cli-structure.test.ts`
Expected: FAIL, `resolveProposalId` is not exported; `unknown subcommand` or similar for `proposal tag`.

- [ ] **Step 3: Add the tag list to types.ts**

Append to `cli/schema/types.ts`:

```ts
export type Tag = "scope-cut" | "scope-add" | "reorder" | "wrong-assumption" | "too-granular" | "too-coarse" | "style" | "other";

export const FEEDBACK_TAGS: readonly Tag[] = ["scope-cut", "scope-add", "reorder", "wrong-assumption", "too-granular", "too-coarse", "style", "other"];
```

- [ ] **Step 4: Add the resolver and tagger to lib/proposal.ts**

Append:

```ts
const LATEST_RE = /^latest(?:-(\d+))?$/;

/** Turns "3", "latest", or "latest-2" into a proposal id, checking that it exists. */
export function resolveProposalId(home: string, epic: string, text: string): number {
  if (/^\d+$/.test(text)) {
    const id = Number(text);
    readProposal(home, epic, id);
    return id;
  }
  const m = LATEST_RE.exec(text);
  if (!m) throw new Error("proposal id must be a number, latest, or latest-N");
  const latest = latestProposalId(home, epic);
  if (latest === null) throw new Error(`no proposals in epic '${epic}'`);
  const id = latest - Number(m[1] ?? 0);
  readProposal(home, epic, id);
  return id;
}

export function tagProposal(home: string, epic: string, id: number, tag: Tag): string {
  readProposal(home, epic, id);
  const line = `- proposal ${id} · ${tag}`;
  mkdirSync(paths.feedback(home, epic), { recursive: true });
  appendFileSync(paths.notes(home, epic), `${line}\n`);
  return line;
}
```

Add `appendFileSync` to the `node:fs` import and `import type { Tag } from "../schema/types.ts";`. `readProposal` throws `NotFound` with `no proposal <id>`, which the tests match.

- [ ] **Step 5: Update commands/proposal.ts**

Replace `proposalApprove`'s id line and add the tag subcommand:

```ts
import { FEEDBACK_TAGS } from "../schema/types.ts";
import type { Tag } from "../schema/types.ts";
import { approveTo, createProposal, parseDestination, resolveProposalId, tagProposal } from "../lib/proposal.ts";

// in proposalApprove, replace `const id = needInt(positionals, 1, "proposal id");` with:
  const id = resolveProposalId(ctx.home, epic, need(positionals, 1, "proposal id"));

async function proposalTag(args: string[], ctx: Ctx): Promise<CommandResult> {
  const { positionals } = parse(args, {});
  const epic = need(positionals, 0, "epic slug");
  const id = resolveProposalId(ctx.home, epic, need(positionals, 1, "proposal id"));
  const tag = need(positionals, 2, "tag");
  if (!(FEEDBACK_TAGS as readonly string[]).includes(tag)) throw new Error(`tag must be one of ${FEEDBACK_TAGS.join(", ")}`);
  const line = tagProposal(ctx.home, epic, id, tag as Tag);
  commit(ctx.home, `${epic}: tag proposal ${id} ${tag}`);
  return { json: { proposal: id, tag, line }, text: line };
}

export const proposalCommand: Command = async (args, ctx) => {
  const [sub, ...rest] = args;
  if (sub === "approve") return proposalApprove(rest, ctx);
  if (sub === "tag") return proposalTag(rest, ctx);
  throw new Error("usage: planet proposal approve <epic> <id> --to plan|phase:<n> | planet proposal tag <epic> <id> <tag>");
};
```

Remove the now-unused `needInt` import if nothing else uses it. In `cli/planet.ts` USAGE, change the proposal line to:

```
  proposal approve <epic> <id|latest|latest-N> --to plan|phase:<n>
  proposal tag <epic> <id|latest|latest-N> <tag>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "add proposal id aliases and proposal tag"
```

---

### Task 2: Skills-as-data test harness

**Files:**
- Create: `test/skills.test.ts`

**Interfaces:**
- Consumes: `parseFrontmatter` from `cli/lib/frontmatter.ts`.
- Produces: a test that checks every `skills/*/SKILL.md` against the frontmatter and budget rules, and a `REQUIRED_SKILLS` list that later tasks append to. With no `skills/` directory the test passes on an empty set.

- [ ] **Step 1: Write the harness**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "../cli/lib/frontmatter.ts";

const SKILLS_DIR = "skills";
const REQUIRED_SKILLS: string[] = [];
const HIDDEN = new Set(["planet-proposal", "planet-intake"]);
const WORD_BUDGET: Record<string, number> = { go: 800, "planet-proposal": 300, "planet-intake": 1500 };
const DESCRIPTION_CAP = 1536;

function skillDirs(): string[] {
  if (!existsSync(SKILLS_DIR)) return [];
  return readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

test("every required skill exists", () => {
  const present = new Set(skillDirs());
  for (const name of REQUIRED_SKILLS) assert.ok(present.has(name), `missing skills/${name}/SKILL.md`);
});

for (const name of skillDirs()) {
  test(`skills/${name}/SKILL.md follows the conventions`, () => {
    const file = join(SKILLS_DIR, name, "SKILL.md");
    const { data, body } = parseFrontmatter(readFileSync(file, "utf8"));
    assert.equal(data.name, name, "name matches the folder");
    const description = String(data.description ?? "");
    const whenToUse = String(data.when_to_use ?? "");
    assert.ok(description.length > 0, "description present");
    assert.ok(description.length + whenToUse.length <= DESCRIPTION_CAP, "description under the cap");
    assert.doesNotMatch(description + whenToUse, /[<>]/, "no angle brackets in description");
    assert.ok(typeof data.compatibility === "string" && data.compatibility.length > 0, "compatibility present");
    const metadata = data.metadata as Record<string, unknown> | undefined;
    assert.match(String(metadata?.version ?? ""), /^\d+\.\d+\.\d+$/, "metadata.version present");
    assert.match(String(data["allowed-tools"] ?? ""), /Bash\(planet \*\)/, "allowed-tools grants the planet cli");
    if (HIDDEN.has(name)) {
      assert.equal(data["user-invocable"], false, "hidden skill");
      assert.match(description, /^Only invoked by/, "negative trigger first");
    }
    if (name === "go") {
      assert.equal(data["disable-model-invocation"], true, "router is explicit-only");
      assert.match(body, /!`planet status --json`/, "status is injected at load");
      assert.match(body, /\$ARGUMENTS/, "request text is read from arguments");
    }
    assert.doesNotMatch(body, /\bScott\b/, "skill text never names the user");
    const budget = WORD_BUDGET[name];
    if (budget !== undefined) assert.ok(words(body) <= budget, `body has ${words(body)} words, budget ${budget}`);
    for (const heading of ["## Critical rules", "## Steps", "## Troubleshooting"]) {
      assert.ok(body.includes(heading), `${heading} section present`);
    }
  });
}
```

- [ ] **Step 2: Run it**

Run: `node --test test/skills.test.ts`
Expected: 1 test passes (no skills yet).

- [ ] **Step 3: Commit**

```bash
git add test/skills.test.ts
git commit -m "add skills-as-data checks"
```

---

### Task 3: The router skill `/planet:go`

**Files:**
- Create: `skills/go/SKILL.md`, `docs/superpowers/notes/2026-09-07-skill-baselines.md`
- Modify: `test/skills.test.ts` (`REQUIRED_SKILLS` gains `"go"`)

**Interfaces:**
- Consumes: `planet status --json` rows (fields `slug`, `repo`, `status`, `shipped`, `total`, `current`, `open_prs`, `unreviewed`); `planet open "<text>" --json` payload (`match`, `candidates`, `status`, `marker`, `epic` where `epic.epic.repo`, `epic.paths.plan`, `epic.paths.dir`, `epic.phases`); `planet epic new`, `planet session step`, `planet session end`; Linear MCP `get_issue`.
- Produces: the skill file. It invokes `planet:planet-intake` by name with the slug, directory, and prior-art PRs.

- [ ] **Step 1: Baseline, run by the controller before dispatch**

Dispatch one general-purpose subagent, model sonnet, with this prompt and no Planet skill: "You are in a repo with the `planet` CLI on PATH. The user says: `continue the GQL thing`. There are two epics in the store. Show what you would do, step by step, as tool calls." Record in `docs/superpowers/notes/2026-09-07-skill-baselines.md` under `## go` what it got wrong: for example guessing the epic, running `planet epic show` on every epic, or entering plan mode. Two to five bullets. The implementer reads this before writing.

- [ ] **Step 2: Write the skill**

`skills/go/SKILL.md`:

````markdown
---
name: go
description: Planet planning workflow for epics that span several PRs. Shows the status table of active epics, opens an epic by name, Linear ticket, or description, creates a new epic from a ticket, and runs the next planning step. Use for /planet:go, "what am I working on", "continue the GQL epic", "start an epic from CRM-123", "plan the next phase". Not for implementing code or for one-off plans, which use plain plan mode.
argument-hint: [epic, ticket, or what to work on]
disable-model-invocation: true
allowed-tools: Bash(planet *) Bash(gh repo view *)
compatibility: Claude Code with the planet plugin loaded. Node 24, gh authenticated, Linear MCP connected for tickets.
metadata:
  version: 0.1.0
---

# Planet: go

## Critical rules

- Planet owns planning in this session. Do not invoke superpowers brainstorming or writing-plans.
- Never enter plan mode from this skill. Step skills do that through the proposal gate.
- Never read `plan.md` or phase bodies here. The step skill reads what it needs.
- Never guess which epic. Zero or several matches means one confirming question.
- Every write to the store goes through the `planet` CLI. Never edit files under `~/.planet`.

## Status

Status rows, refreshed when this skill loaded:

!`planet status --json`

Request: $ARGUMENTS

## Steps

1. **No request text.** Render the rows as a table with columns EPIC, STATUS, PHASES as `shipped/total`, CURRENT, OPEN PRS, REVIEW. Rows with `unreviewed` above zero get "retro pending" in REVIEW. Ask what to work on. Stop.
2. **Plan mode check.** If this session is in plan mode, say "leave plan mode first, Planet needs to write to its store" and stop.
3. **Resolve.** Run `planet open "<request text>" --json`.
   - `match` is a slug: say `opened <slug>` and go to step 5.
   - `match` is null and `candidates` is not empty: pick the likeliest using the rows, ask `did you mean <slug>?`, wait. On yes run `planet open <slug> --json` and go to step 5.
   - `match` is null and `candidates` is empty: if the request names a Linear ID like CRM-123, a linear.app URL, or asks to start or plan something new, go to step 4. Otherwise ask which epic and stop.
4. **New epic.** When there is a Linear ID, fetch the issue with the Linear MCP `get_issue` tool and take its title. Derive a slug: lowercase, letters, digits, hyphens, at most 40 characters, no leading or trailing hyphen. Run `gh repo view --json nameWithOwner -q .nameWithOwner` for the repo. Ask exactly `create epic <slug>, "<title>", repo <owner/name>, from <ID>?` and wait. On yes run `planet epic new <slug> --title "<title>" --repo <owner/name> --linear <ID>` (omit `--linear` without an ID), then `planet open <slug> --json`. Keep any PR numbers or URLs from the request as prior art for intake.
5. **Choose the step** from the payload, without reading any file. `epic.paths.plan` null means intake. Anything else means the next step is scoping, phasing, phase-plan, or retro, none of which exists yet: say `next step: <name> (not built yet)` and stop. A step named in the request wins.
6. **Repo check.** Run `gh repo view --json nameWithOwner -q .nameWithOwner`. It must equal `epic.epic.repo`. Otherwise say `this directory is <a>; the epic is <b>. Run /planet:go from the epic's repo.` and stop.
7. **Dispatch.** Run `planet session step intake`. Invoke the skill `planet:planet-intake` with three lines: `epic: <slug>`, `dir: <epic.paths.dir>`, `prior art: <PR urls or none>`. When it returns, go to step 5.
8. **Done.** When the user says they are done, run `planet session end`.

## Example

Request `continue the GQL thing`. `planet open` returns `match: "gql-migration"`. Say `opened gql-migration`. The payload has `paths.plan: null`, so the step is intake. `gh repo view` matches `closeio/close-ui`. Run `planet session step intake`, invoke `planet:planet-intake` with the slug, dir, and `prior art: none`.

## Troubleshooting

- Rows show `(stale)` or `synced: never`: `gh` was unavailable. Continue; state is what the store holds.
- `planet open` errors with `no session id`: the Bash tool lacks `CLAUDE_CODE_SESSION_ID`. Report it and stop.
- `planet epic new` errors with `already exists`: the slug is taken. Run `planet open <slug> --json` instead.
- The request names a step that exists but the state does not match, for example `retro` with nothing shipped: say so and stop.
````

- [ ] **Step 3: Register it in the harness and check budgets**

In `test/skills.test.ts` set `const REQUIRED_SKILLS: string[] = ["go"];`.

Run: `npm test && claude plugin validate .`
Expected: the `skills/go/SKILL.md follows the conventions` test passes, including the word budget; validation passes.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "add the planet:go router skill"
```

---

### Task 4: The proposal gate `planet-proposal`

**Files:**
- Create: `skills/planet-proposal/SKILL.md`
- Modify: `test/skills.test.ts` (`REQUIRED_SKILLS` gains `"planet-proposal"`), `docs/superpowers/notes/2026-09-07-skill-baselines.md`

**Interfaces:**
- Consumes: `planet proposal approve <epic> latest --to <dest>`, `planet proposal tag <epic> latest-N <tag>` from Task 1; the hooks from follow-on 1, which snapshot on ExitPlanMode and record approval and rejection.
- Produces: the skill file, invoked by step skills as `planet:planet-proposal` with `epic`, `to`, `step`.

- [ ] **Step 1: Baseline, run by the controller before dispatch**

Subagent prompt, no skill: "You have drafted a planning document for epic `e` in your context and must get the user's approval through Claude Code plan mode, then write it to the epic's plan with the `planet` CLI. Show what you would do." Record under `## planet-proposal` what went wrong: for example researching inside plan mode, running `planet` commands while in plan mode, regenerating the plan after a rejection, or computing proposal ids.

- [ ] **Step 2: Write the skill**

`skills/planet-proposal/SKILL.md`:

````markdown
---
name: planet-proposal
description: Only invoked by Planet step skills, never on its own. Presents a drafted planning document for approval through native plan mode and records the outcome with the planet CLI. Do not use for ordinary plan mode or for any task outside a Planet session.
user-invocable: false
allowed-tools: Bash(planet *)
compatibility: Claude Code with the planet plugin loaded and its hooks active.
metadata:
  version: 0.1.0
---

# Planet: proposal gate

Input from the calling step: `epic` slug, `to` (`plan` or `phase:<n>`), `step` name. The draft is already in your context. This gate does no research and no new reasoning.

## Critical rules

- While in plan mode, write only the plan file. No `planet` commands until the gate resolves.
- On rejection, amend the plan file in place. Never regenerate it.
- Never compute proposal ids. Use `latest` and `latest-N`.

## Steps

1. If not already in plan mode, call EnterPlanMode. Write the draft, unchanged, to the plan file path Claude Code gives you. When re-entering after a rejection, edit that file instead.
2. Call ExitPlanMode.
3. **Approved.** The result says the plan was approved and plan mode has ended. Run `planet proposal approve <epic> latest --to <to>`. Then for each rejection in this cycle, most recent first, run `planet proposal tag <epic> latest-1 <tag>`, then `latest-2`, and so on. Choose each tag from the user's words: scope-cut, scope-add, reorder, wrong-assumption, too-granular, too-coarse, style, other. Return `approved` to the caller.
4. **Rejected.** The result carries the user's message, either typed or as `[Re: "quote"] comment` lines, and plan mode continues. Count the rejection and return the message to the caller. The caller amends the draft and invokes this gate again. The hooks record the rejection.

## Troubleshooting

- The result is neither an approval nor a rejection: report it verbatim and stop.
- `approve` says the proposal was rejected: the hook and the dialog disagree. Report and stop.
- `approve` says there are no proposals: the hooks did not run. The session was started before the plugin loaded, or hooks were reloaded. Report and stop; a fresh session fixes it.
````

- [ ] **Step 3: Register and check**

`REQUIRED_SKILLS` becomes `["go", "planet-proposal"]`.

Run: `npm test && claude plugin validate .`
Expected: pass, body under 300 words.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "add the planet-proposal gate skill"
```

---

### Task 5: The intake skill `planet-intake`

**Files:**
- Create: `skills/planet-intake/SKILL.md`, `skills/planet-intake/references/research-brief.md`, `skills/planet-intake/references/plan-template.md`
- Modify: `test/skills.test.ts` (`REQUIRED_SKILLS` gains `"planet-intake"`), `docs/superpowers/notes/2026-09-07-skill-baselines.md`

**Interfaces:**
- Consumes: the three input lines from the router; Linear MCP `get_issue` and `list_comments`; `gh pr view`, `gh pr list`; the `planet:planet-proposal` gate; `epic.yaml` fields via `planet epic show <slug> --json` (`epic.linear`, `epic.repo`).
- Produces: `research/*.md` files in the epic directory, `plan.md` through the gate, the return line `intake done, next step scoping`.

- [ ] **Step 1: Baseline, run by the controller before dispatch**

Subagent prompt, no skill: "Epic `gql-migration` at `~/.planet/epics/gql-migration` has Linear ticket CRM-123 and no plan.md. Produce the first planning document for it. `planet`, `gh`, and a Linear MCP are available." Record under `## planet-intake` what went wrong: proposing an approach or phases, skipping research files, asking many questions, exploring the codebase in the main thread, writing plan.md directly.

- [ ] **Step 2: Write the references**

`skills/planet-intake/references/research-brief.md`:

````markdown
# Codebase research brief

Send this to one general-purpose subagent. Fill the angle-bracket slots.

```
You are researching a codebase for a planning step. Read only; do not edit source files.

Epic: <slug>. Repo: <owner/name>, checked out in the current directory.
Ticket summary: <two to five sentences from the Linear issue, or the user's brief>.
Prior art: <PR urls or none>.

Answer, with file paths:
1. Which modules own the behavior the ticket touches, and what each does today.
2. What constrains a change here: shared types, tests that pin behavior, feature flags, callers.
3. Prior attempts or related work in the history: `git log --oneline -S <term>` for two or three key terms.
4. Anything the ticket assumes that the code contradicts.

Write your findings to <dir>/research/codebase.md as Markdown with those four headings. Keep it under 600 words; link paths rather than pasting code. Then reply with the file path and at most five lines summarizing what a planner must know. Do not paste the file contents in your reply.
```
````

`skills/planet-intake/references/plan-template.md`:

````markdown
# plan.md v1 headings

```
# <Epic title>

## Problem
What is wrong or missing, for whom, and how it shows up. Two to five sentences.

## Context
- Tickets: <ID> (research/linear-<ID>.md)
- Prior art: <PR urls> (research/prs.md), or none
- Codebase: research/codebase.md, one sentence on what it found

## Constraints
Bullets. Technical, product, and sequencing constraints the research surfaced.

## Open questions for scoping
Bullets. Decisions the approach depends on. Do not answer them here.

## Non-goals
Bullets, only when the ticket or the user made them evident. Otherwise omit the section.
```

Target 300 to 500 words. No approach, no phases, no file-level plan.
````

- [ ] **Step 3: Write the skill**

`skills/planet-intake/SKILL.md`:

````markdown
---
name: planet-intake
description: Only invoked by the Planet router, never on its own. First planning step for a Planet epic with no plan.md yet. Gathers the Linear ticket, named PRs, and codebase context into the epic's research directory, asks only the questions that block a problem statement, and drafts plan.md through the proposal gate. Do not use outside a Planet session.
user-invocable: false
allowed-tools: Bash(planet *) Bash(gh pr view *) Bash(gh pr list *)
compatibility: Claude Code with the planet plugin loaded. gh authenticated. Linear MCP connected when the epic has tickets.
metadata:
  version: 0.1.0
---

# Planet: intake

Input from the router: `epic: <slug>`, `dir: <path>`, `prior art: <PR urls or none>`. Precondition: the epic has no `plan.md`. Output: `plan.md` v1, written through the proposal gate. Intake describes the problem. It never proposes an approach or phases; scoping does that.

## Critical rules

- Research files are written to `<dir>/research/`; nothing else under the epic directory is written by hand. `plan.md` is written only by `planet proposal approve`.
- Codebase exploration goes to one subagent. Do not read source files in this thread beyond what a clarifying question needs.
- Clarifying questions: only what blocks a problem statement, at most three, one at a time, in chat, before entering plan mode.
- The draft is composed in context. The gate writes it.

## Steps

1. **Epic facts.** Run `planet epic show <slug> --json`. Take `epic.linear` and `epic.repo`.
2. **Linear.** For each ID in `epic.linear`, call the Linear MCP `get_issue` tool, then `list_comments` for that issue. Save the title, description, and comments verbatim to `<dir>/research/linear-<ID>.md`. With no IDs, the user's request text is the brief; record it in `<dir>/research/brief.md`.
3. **GitHub.** For each prior-art PR, run `gh pr view <url> --json number,title,body,state,url` and append a section to `<dir>/research/prs.md`. Then decide on one search: run `gh pr list -R <repo> --state all --limit 20 --search "<ID>" --json number,title,url,state` per ticket ID only when no PR was named and the ticket reads as a follow-up or continuation, or the IDs are likely to appear in PR titles. Otherwise skip. Say in one line whether you searched and why. Append any hits to `prs.md`.
4. **Codebase.** Dispatch one general-purpose subagent with the brief in `references/research-brief.md`, slots filled from steps 2 and 3. It writes `<dir>/research/codebase.md` and returns the path and up to five lines. Read the five lines, not the file.
5. **Clarify.** If the ticket and research leave a gap that blocks stating the problem, such as which surface, which users, or whether a described behavior is a bug or intended, ask one question and wait. Repeat at most twice more. A clear ticket gets no questions. Approach and preference questions are deferred to scoping; note them for the Open questions section.
6. **Draft.** Compose `plan.md` v1 in context using `references/plan-template.md`. Link the research files by relative path. 300 to 500 words.
7. **Gate.** Invoke the skill `planet:planet-proposal` with `epic: <slug>`, `to: plan`, `step: intake`. On `approved`, go to step 8. On a rejection message, amend the draft in place to address it, then invoke the gate again.
8. **Return** the line `intake done, next step scoping` to the router.

## Example

Router passes `epic: gql-migration`, `dir: /Users/me/.planet/epics/gql-migration`, `prior art: https://github.com/closeio/close-ui/pull/26772`. Step 2 saves `research/linear-CRM-123.md`. Step 3 saves PR 26772 to `research/prs.md` and skips the search: a PR was named. Step 4 returns "email writes already go through useAutosaveMutation; the lead page thread refetch is the last REST read; tests pin the thread shape in LeadEmailThread.test.tsx". No gap blocks the problem statement, so step 5 asks nothing. Step 6 drafts. Step 7 gates; the user rejects with "leave the analytics page out"; Non-goals gains a line; the gate approves. Step 8 returns.

## Troubleshooting

- Linear MCP not available or the issue is not found: say so once, continue with the request text as the brief, and list the ticket under Open questions.
- `gh` not authenticated: skip step 3, note it in Context, continue.
- The subagent fails or returns nothing: draft from Linear alone and write "not researched" under Context for the codebase line.
- `planet epic show` says no epic: the router did not open one. Return to the router with that message.
- The gate reports the hooks did not run: stop and return that message to the router.
````

- [ ] **Step 4: Register and check**

`REQUIRED_SKILLS` becomes `["go", "planet-proposal", "planet-intake"]`.

Run: `npm test && claude plugin validate .`
Expected: pass, body under 1,500 words.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "add the planet-intake step skill"
```

---

### Task 6: README and plugin description

**Files:**
- Modify: `README.md`, `.claude-plugin/plugin.json`

- [ ] **Step 1: Update the README**

Add after the Requirements section:

```markdown
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
```

Update `.claude-plugin/plugin.json` description to: `Epic planning across PRs: status, epic intake through plan mode, proposal capture, PR sync`. Bump `version` to `0.2.0`.

- [ ] **Step 2: Verify and commit**

Run: `npm test && claude plugin validate .`

```bash
git add -A
git commit -m "document the router and bump the plugin version"
```

---

### Task 7: Live verification

Manual, in a Claude Code session started fresh with `claude --plugin-dir /Users/scottmahr/code/personal/planet` from a repo you can plan against. Record every outcome in `docs/superpowers/notes/2026-09-07-skills-live.md`.

- [ ] **Step 1: Glance.** `/planet:go` with no text. Expected: a table from the injected rows and a question, no tool calls.
- [ ] **Step 2: New epic from a ticket.** `/planet:go <a real Linear ID>`. Expected: the exact confirmation line with slug, title, repo, and ID; on yes, the epic is created and opened, the repo check passes, and intake starts.
- [ ] **Step 3: Intake.** Expected: `research/linear-<ID>.md` written; a one-line note on whether the PR search ran; a subagent writes `research/codebase.md`; at most three questions; then plan mode opens with the draft.
- [ ] **Step 4: Gate.** Reject once with a message, then approve. Expected: `plan.md` exists with the template headings; `planet feedback report <slug>` shows one rejection with your words and one tag; two proposals in `proposals/`.
- [ ] **Step 5: Re-entry.** `/planet:go <slug>`. Expected: `opened <slug>` and `next step: scoping (not built yet)`.
- [ ] **Step 6: Untouched plan mode.** In a second session without `/planet:go`, run any plan and approve it. Expected: nothing new in `~/.planet`.
- [ ] **Step 7: Record, fix, and clean up.** Note deviations, fix each as its own commit, then decide whether to keep the epic. It is a real epic if the ticket was real. Commit the notes: `record skills live verification`.

---

## Self-review notes

- Spec coverage: decisions table → Tasks 3 to 5; CLI additions → Task 1; skills-as-data → Task 2; triggering and live tests → Task 7; error handling → each skill's troubleshooting section; amendments to the design spec were made in the spec commit.
- The `go` skill invokes `planet:planet-intake`, and intake invokes `planet:planet-proposal`; both names match the folders and the plugin namespace.
- `proposal tag` JSON shape `{ proposal, tag, line }` is used identically in Task 1's code and test.
