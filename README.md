# Planet: Turbo Plan Mode for long-running projects

I love Claude's Plan Mode, but I kept running into the same limitations when adding it to my workflow:

* **Plans have no state.** When a plan spanned several phases or PRs, I needed one-off solutions to track progress.
* **Plan files are hard to find.** They sit deep in Claude's filesystem. Reopening or extending a plan meant workarounds, like copying markdown into scratch folders and pasting file paths into prompts.
* **Planning never got better.** I wanted both my planning and Claude's to improve with every project.

Planet is a set of skills for work too big to be shipped at once. It researches a task, helps you brainstorm a solution, splits that work into phases, running each step through Plan Mode for fine-grained control and tuning.

Every time you reject a plan with feedback, Planet remembers. Later plans take that feedback into account, and that feedback is later aggregated back into improving Planet's own skills.

```sh
/planet:go CRM-123                    # start an epic from a Linear ticket
/planet:go                            # what am I working on?
/planet:go next phase of the gql epic # planet infers and takes the next step
```

## Features

### Shaping & scoping

Start an **epic** from a Linear ticket, a PR, a doc, or a few sentences. Planet researches it, brainstorms, talks through the approach with you, and cuts it into **phases**: small, shippable PRs. Each step is plan mode. I love plan mode.

Phases have a dependency order size budget, and can be re-cut if they get too big or when new information comes to light.

### Implementation

Each phase then gets its _own_ plan, where you refine technical decisions, a commit-by-commit breakdown, and verification steps. Once you approve it, Planet implements it and opens a PR.

### Status tracking

Plans and their status live in `~/.planet`, one directory per epic, where you can read them. PR state syncs from GitHub, so merging a PR ships its phase.

```
EPIC               STATUS  PHASES  CURRENT            OPEN PRS  REVIEW
gql-migration      active  2/5     3 rewrite-queries  1         -
security-settings  active  1/3     2 sso-cleanup      0         retro pending
```

### Retros & self-improvement loop

When a phase ships, Planet compares the plan to what shipped, including every fix you made _after_ Claude finished. It proposes lessons, and the next phase plan reads them. Run `/planet:go review feedback` from this repo to turn lessons that recur across epics into edits to the skills themselves.

## Skills

You call two skills. The router calls the rest.

| Skill | What it does |
| --- | --- |
| `/planet:go` | The router: status, open or start an epic, run the next step. |
| `/planet:plan` | A one-off, one-PR plan. No epic, nothing saved. |
| `planet-intake` | Research and a problem statement. |
| `planet-scoping` | Goals, non-goals, and an approach. |
| `planet-phasing` | Cuts the epic into phases. |
| `planet-phase-plan` | A commit-by-commit plan for one phase. |
| `planet-implement` | Builds the phase and opens a PR. |
| `planet-retro` | Plan vs. shipped, and lessons. |
| `planet-feedback-review` | Turns recurring lessons into skill edits. |
| `planet-proposal` | Runs each draft through Plan Mode. |

Plan Mode on its own is untouched: Planet records nothing unless a session started with `/planet:go`.

## Is this Ralph Wiggum?

Mostly? It's Ralph Wiggum with a babysitter. Ralph plans all up front and then loops without you. Planet is for those who want a bit more human-in-the-loop while planning and executing (_and_ those who want some planning skills that learn from their own mistakes 😃).

## Requirements

Node 24, git, and `gh` authenticated. Linear MCP for ticket sources if that's your jam.

## Develop

```
claude --plugin-dir /path/to/planet
```

Run `/reload-plugins` after editing. `bin/` is on the Bash tool's PATH while the plugin is loaded.

```
npm test
npm run typecheck
```

## Thanks

Planet is indebted to [superpowers](https://github.com/obra/superpowers). I used it to write these skills, and it inspired several of them. `planet-implement` borrows from executing-plans, test-driven-development, and verification-before-completion. `planet-scoping` takes the place of brainstorming.
