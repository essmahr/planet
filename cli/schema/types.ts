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

export type Tag = "scope-cut" | "scope-add" | "reorder" | "wrong-assumption" | "too-granular" | "too-coarse" | "style" | "other";

export const FEEDBACK_TAGS: readonly Tag[] = ["scope-cut", "scope-add", "reorder", "wrong-assumption", "too-granular", "too-coarse", "style", "other"];
