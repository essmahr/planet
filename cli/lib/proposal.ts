import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Proposal, ProposalMeta, Step, Tag } from "../schema/types.ts";
import { validateProposalMeta } from "../schema/validate.ts";
import type { Parsed } from "./args.ts";
import type { Ctx } from "./context.ts";
import { NotFound } from "./epic.ts";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.ts";
import { writeBody } from "./phase.ts";
import { REVIEW, paths } from "./store.ts";

export function proposalFileName(id: number, step: string): string {
  return `${String(id).padStart(3, "0")}-${step}.md`;
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
    .filter((f) => /^\d{3,}-[a-z-]+\.md$/.test(f))
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

/** True when two plan texts match apart from line endings and surrounding whitespace. */
export function sameText(a: string, b: string): boolean {
  const normalize = (text: string) => text.replace(/\r\n/g, "\n").trim();
  return normalize(a) === normalize(b);
}

export function markApproved(home: string, epic: string, id: number): Proposal {
  const proposal = readProposal(home, epic, id);
  proposal.meta.outcome = "approved";
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

export type Destination = { kind: "plan" } | { kind: "milestones" } | { kind: "none" } | { kind: "phase"; id: number } | { kind: "review" };

export function parseDestination(text: string): Destination {
  if (text === "plan") return { kind: "plan" };
  if (text === "milestones") return { kind: "milestones" };
  if (text === "none") return { kind: "none" };
  if (text === "review") return { kind: "review" };
  const m = /^phase:(\d+)$/.exec(text);
  if (!m) throw new Error("--to must be plan, milestones, none, phase:<n>, or review");
  return { kind: "phase", id: Number(m[1]) };
}

export function assertPhasingApproval(home: string, epic: string, id: number): void {
  const proposal = readProposal(home, epic, id);
  if (latestProposalId(home, epic) !== id) throw new Error(`proposal ${id} is not the latest proposal`);
  if (proposal.meta.step !== "phasing") throw new Error(`proposal ${id} is not a phasing proposal`);
  if (proposal.meta.outcome !== "approved") throw new Error(`proposal ${id} is not approved`);
}

const MILESTONES_HEADING_RE = /^## Milestones[ \t]*$/m;
const LEGACY_PHASES_HEADING_RE = /^## Phases[ \t]*$/m;
const NEXT_SECTION_RE = /^## /m;

const ENTRY_HEADING_RE = /^### (\d+)\. .*$/gm;
const ENTRY_SLUG_RE = /\(([a-z0-9-]+)\)[ \t]*$/;
const COLLAPSED_ENTRY_RE = /^### (\d+)\. .*\(([a-z0-9-]+)\): unchanged[ \t]*\n*/gm;

function milestoneEntries(section: string): Map<number, string> {
  const headings = [...section.matchAll(ENTRY_HEADING_RE)];
  const entries = new Map<number, string>();
  headings.forEach((heading, i) => {
    const end = headings[i + 1]?.index ?? section.length;
    entries.set(Number(heading[1]), section.slice(heading.index, end).trimEnd());
  });
  return entries;
}

function sliceMilestonesSection(body: string): string {
  const at = body.search(MILESTONES_HEADING_RE);
  if (at === -1) throw new Error("a milestones proposal must have a '## Milestones' heading");
  const rest = body.slice(at);
  const next = rest.slice(1).search(NEXT_SECTION_RE);
  const section = next === -1 ? rest : rest.slice(0, next + 1);
  return `${section.trimEnd()}\n`;
}

/**
 * Swaps each collapsed entry in a proposed Milestones section for the full entry plan.md has.
 *
 * A collapsed entry is a lone heading ending in `: unchanged`, like `### 3. Move (move): unchanged`.
 * A re-cut proposal uses them for the milestones it keeps, so the user only reads the new ones.
 */
export function expandCollapsedEntries(home: string, epic: string, section: string): string {
  if (!section.match(COLLAPSED_ENTRY_RE)) return section;
  const file = paths.plan(home, epic);
  if (!existsSync(file)) throw new Error("no plan.md to put a Milestones section in; approve scoping first");
  const plan = readFileSync(file, "utf8");
  const at = plan.search(MILESTONES_HEADING_RE);
  const existing = milestoneEntries(at === -1 ? "" : plan.slice(at));
  const expanded = section.replace(COLLAPSED_ENTRY_RE, (_line, number: string, slug: string) => {
    const entry = existing.get(Number(number));
    if (!entry) throw new Error(`plan.md has no entry ${number} to fill the collapsed one; write the entry in full`);
    const existingSlug = ENTRY_SLUG_RE.exec(entry.split("\n")[0])?.[1];
    if (existingSlug !== slug) throw new Error(`entry ${number} in plan.md is (${existingSlug}), not (${slug}); write the entry in full`);
    return `${entry}\n\n`;
  });
  return expanded.replace(/\n+$/, "\n");
}

/**
 * Replaces plan.md's `## Milestones` section (or a legacy `## Phases` one) with `section`.
 *
 * The section is always last in plan.md, so everything from the earlier of the two headings
 * to the end goes. A section with no `### ` entries only removes, so plan.md never keeps an empty heading.
 */
export function writeMilestonesSection(home: string, epic: string, section: string): string {
  const file = paths.plan(home, epic);
  if (!existsSync(file)) throw new Error("no plan.md to put a Milestones section in; approve scoping first");
  const plan = readFileSync(file, "utf8");
  const cuts = [plan.search(LEGACY_PHASES_HEADING_RE), plan.search(MILESTONES_HEADING_RE)].filter((at) => at !== -1);
  const above = (cuts.length ? plan.slice(0, Math.min(...cuts)) : plan).replace(/\s+$/, "");
  if (!/^### /m.test(section)) {
    if (cuts.length) writeFileSync(file, `${above}\n`);
    return file;
  }
  writeFileSync(file, `${above}\n\n${section}`);
  return file;
}

function nextReviewFile(home: string, now: string): string {
  const date = now.slice(0, 10);
  for (let n = 1; ; n += 1) {
    const file = paths.reviewFile(home, date, n);
    if (!existsSync(file)) return file;
  }
}

export function approveTo(home: string, epic: string, id: number, dest: Destination, fromText: string | undefined, now: string): { proposal: Proposal; wrote: string } {
  if (epic === REVIEW && dest.kind !== "review") throw new Error("review proposals only approve --to review");
  if (dest.kind === "review" && epic !== REVIEW) throw new Error("--to review is only for the review pseudo-epic");
  let proposal = readProposal(home, epic, id);
  if (proposal.meta.outcome === "rejected" && fromText === undefined) {
    throw new Error(`proposal ${id} was rejected; pass --from to approve different text`);
  }
  const text = fromText ?? proposal.body;
  const body = text.endsWith("\n") ? text : `${text}\n`;
  const section = dest.kind === "milestones" ? expandCollapsedEntries(home, epic, sliceMilestonesSection(body)) : body;
  if (proposal.meta.outcome !== "approved") proposal = markApproved(home, epic, id);
  if (dest.kind === "milestones") return { proposal, wrote: writeMilestonesSection(home, epic, section) };
  if (dest.kind === "none") return { proposal, wrote: proposal.path };
  if (dest.kind === "plan") {
    const file = paths.plan(home, epic);
    writeFileSync(file, body);
    return { proposal, wrote: file };
  }
  if (dest.kind === "review") {
    mkdirSync(paths.reviews(home), { recursive: true });
    const file = nextReviewFile(home, now);
    writeFileSync(file, body);
    return { proposal, wrote: file };
  }
  const phase = writeBody(home, epic, dest.id, body);
  return { proposal, wrote: phase.path };
}

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

/** Resolves the `--proposal` flag to an id, or undefined when it wasn't passed. */
export function optProposal(ctx: Ctx, epic: string, values: Parsed["values"]): number | undefined {
  const text = values.proposal;
  if (typeof text !== "string") return undefined;
  return resolveProposalId(ctx.home, epic, text);
}
