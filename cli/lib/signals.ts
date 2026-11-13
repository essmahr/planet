import type { PrFeedback, Reaction } from "./gh.ts";

/** Comment urls named by Feedback trailers on the phase's commits. */
export interface Drafts {
  drafted: string[];
  pushed: string[];
}

export type SignalState = "open" | "drafted" | "pushed";

export interface Signal {
  id: string;
  pr: string;
  kind: "review" | "comment" | "conversation";
  signal: "do" | "weigh";
  state: SignalState;
  author: string;
  path: string | null;
  line: number | null;
  body: string;
  url: string;
  instruction: string | null;
}

export interface PrSignals {
  signals: Signal[];
  orphans: string[];
}

interface Item {
  id: string;
  kind: Signal["kind"];
  author: string;
  path: string | null;
  line: number | null;
  body: string;
  url: string;
  viewer_reactions: Reaction[];
  instruction: string | null;
}

function items(f: PrFeedback): Item[] {
  return [
    ...f.reviews.map((r) => ({ id: r.id, kind: "review" as const, author: r.author, path: null, line: null, body: r.body, url: r.url, viewer_reactions: r.viewer_reactions, instruction: null })),
    ...f.comments.map((c) => ({ id: c.id, kind: "comment" as const, author: c.author, path: c.path, line: c.line, body: c.body, url: c.url, viewer_reactions: c.viewer_reactions, instruction: c.viewer_reply })),
    ...f.conversation.map((c) => ({ id: c.id, kind: "conversation" as const, author: c.author, path: null, line: null, body: c.body, url: c.url, viewer_reactions: c.viewer_reactions, instruction: null })),
  ];
}

function doState(url: string, drafts: Drafts): SignalState {
  if (drafts.pushed.includes(url)) return "pushed";
  if (drafts.drafted.includes(url)) return "drafted";
  return "open";
}

/** Turns the viewer's thumbs up ("do") and eyes ("weigh") reactions on a PR into signals. */
export function prSignals(f: PrFeedback, drafts: Drafts): PrSignals {
  const signals: Signal[] = [];
  const thumbed = new Set<string>();
  for (const item of items(f)) {
    if (item.author === f.viewer) continue;
    const base = { id: item.id, pr: f.url, kind: item.kind, author: item.author, path: item.path, line: item.line, body: item.body, url: item.url };
    if (item.viewer_reactions.includes("THUMBS_UP")) {
      thumbed.add(item.url);
      signals.push({ ...base, signal: "do", state: doState(item.url, drafts), instruction: item.instruction });
    }
    if (item.viewer_reactions.includes("EYES")) {
      signals.push({ ...base, signal: "weigh", state: "open", instruction: null });
    }
  }
  const orphans = [...new Set(drafts.drafted)].filter((url) => !thumbed.has(url));
  return { signals, orphans };
}

/** Sorted keys for the signals that still need attention, plus one per orphaned draft. */
export function openKeys(s: PrSignals): string[] {
  const keys = s.signals.flatMap((sig) => {
    if (sig.signal === "weigh") return [`${sig.id}:weigh`];
    if (sig.state === "drafted") return [];
    return [`${sig.id}:do`];
  });
  return [...keys, ...s.orphans.map((url) => `orphan:${url}`)].sort();
}
