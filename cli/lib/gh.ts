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

export interface PrReview {
  id: string;
  author: string;
  state: string;
  body: string;
  created_at: string;
  url: string;
}

export interface PrComment {
  id: string;
  author: string;
  path: string;
  line: number | null;
  body: string;
  resolved: boolean;
  created_at: string;
  url: string;
}

export interface PrConversationComment {
  id: string;
  author: string;
  body: string;
  created_at: string;
  url: string;
}

export interface PrCheck {
  name: string;
  state: string;
  url: string;
}

export interface PrFeedback {
  url: string;
  state: PrState;
  author: string;
  head_ref: string;
  head_sha: string;
  reviews: PrReview[];
  comments: PrComment[];
  conversation: PrConversationComment[];
  failed_checks: PrCheck[];
}

export interface Gh {
  prStates(urls: string[]): Promise<PrInfo[]>;
  prFiles(url: string): Promise<PrFile[]>;
  prFeedback(url: string, opts?: { timeoutMs?: number }): Promise<PrFeedback>;
}

export class GhUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GhUnavailable";
  }
}

/** Turns a failed `gh` invocation into either a GhUnavailable (missing binary, timeout, auth/network trouble) or a plain Error carrying the command's stderr. */
export function classifyGhError(err: unknown): Error {
  const e = err as NodeJS.ErrnoException & { stderr?: string; killed?: boolean; signal?: string | null };
  const stderr = (e.stderr ?? "").trim();
  if (e.code === "ENOENT") return new GhUnavailable("gh is not installed");
  if (e.killed === true || e.signal === "SIGTERM") return new GhUnavailable("gh timed out");
  if (/not logged in|authentication|could not resolve host|network is unreachable|connection refused/i.test(stderr)) {
    return new GhUnavailable(stderr.split("\n")[0]);
  }
  return new Error(stderr || e.message);
}

async function gh(args: string[], timeoutMs = 10_000): Promise<string> {
  try {
    const { stdout } = await execFileAsync("gh", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: timeoutMs });
    return stdout;
  } catch (err) {
    throw classifyGhError(err);
  }
}

interface GraphqlPr {
  url: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  mergedAt: string | null;
}

export type GraphqlContext =
  | { name: string; conclusion: string | null; detailsUrl: string | null }
  | { context: string; state: string; targetUrl: string | null };

export interface GraphqlFeedback {
  state: "OPEN" | "MERGED" | "CLOSED";
  author: { login: string } | null;
  headRefName: string;
  headRefOid: string;
  reviews: { nodes: { id: string; url: string; createdAt: string; author: { login: string } | null; state: string; body: string }[] };
  reviewThreads: { nodes: { isResolved: boolean; comments: { nodes: { id: string; url: string; createdAt: string; author: { login: string } | null; path: string; line: number | null; body: string }[] } }[] };
  comments: { nodes: { id: string; url: string; createdAt: string; author: { login: string } | null; body: string }[] };
  commits: { nodes: { commit: { statusCheckRollup: { contexts: { nodes: GraphqlContext[] } } | null } }[] };
}

const PASSING_OR_PENDING = new Set(["SUCCESS", "NEUTRAL", "SKIPPED", "PENDING", "EXPECTED", "QUEUED", "IN_PROGRESS"]);

/** Turns a null review author (a deleted or otherwise inaccessible GitHub account) into "unknown". */
export function reviewAuthor(author: { login: string } | null): string {
  return author?.login ?? "unknown";
}

/** Maps the GraphQL check-run/status-context union to PrCheck and keeps only the ones that failed.
 *
 * A CheckRun with a null conclusion is still running, so it's mapped to state "PENDING" here and
 * then excluded below along with StatusContext states that mean pending or passing, not failed.
 */
export function failedChecks(contexts: GraphqlContext[]): PrCheck[] {
  return contexts
    .map((c) => ("conclusion" in c ? { name: c.name, state: c.conclusion ?? "PENDING", url: c.detailsUrl ?? "" } : { name: c.context, state: c.state, url: c.targetUrl ?? "" }))
    .filter((c) => !PASSING_OR_PENDING.has(c.state));
}

export function parseFeedback(url: string, pr: GraphqlFeedback): PrFeedback {
  const reviews = pr.reviews.nodes.map((r) => ({ id: r.id, author: reviewAuthor(r.author), state: r.state, body: r.body, created_at: r.createdAt, url: r.url }));
  const comments = pr.reviewThreads.nodes.flatMap((t) =>
    t.comments.nodes.map((c) => ({ id: c.id, author: reviewAuthor(c.author), path: c.path, line: c.line, body: c.body, resolved: t.isResolved, created_at: c.createdAt, url: c.url })),
  );
  const conversation = pr.comments.nodes.map((c) => ({ id: c.id, author: reviewAuthor(c.author), body: c.body, created_at: c.createdAt, url: c.url }));
  const contexts = pr.commits.nodes[0]?.commit.statusCheckRollup?.contexts.nodes ?? [];
  return {
    url,
    state: pr.state.toLowerCase() as PrState,
    author: reviewAuthor(pr.author),
    head_ref: pr.headRefName,
    head_sha: pr.headRefOid,
    reviews,
    comments,
    conversation,
    failed_checks: failedChecks(contexts),
  };
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
          if (!pr) return;
          out.push({ url: u, state: pr.state.toLowerCase() as PrState, merged_at: pr.mergedAt });
        });
      }
      return out;
    },
    async prFiles(url) {
      const raw = JSON.parse(await gh(["pr", "view", url, "--json", "files"])) as { files: PrFile[] };
      return raw.files.map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions }));
    },
    async prFeedback(url, opts) {
      const query = `query { resource(url: ${JSON.stringify(url)}) { ... on PullRequest {
        state author { login } headRefName headRefOid
        reviews(last: 50) { nodes { id url createdAt author { login } state body } }
        reviewThreads(last: 100) { nodes { isResolved comments(first: 50) { nodes { id url createdAt author { login } path line body } } } }
        comments(last: 100) { nodes { id url createdAt author { login } body } }
        commits(last: 1) { nodes { commit { statusCheckRollup { contexts(last: 100) { nodes {
          ... on CheckRun { name conclusion detailsUrl }
          ... on StatusContext { context state targetUrl } } } } } } }
      } } }`;
      const raw = JSON.parse(await gh(["api", "graphql", "-f", `query=${query}`], opts?.timeoutMs)) as { data: { resource: GraphqlFeedback | null } };
      const pr = raw.data.resource;
      if (!pr) throw new Error(`no pull request at ${url}`);
      return parseFeedback(url, pr);
    },
  };
}
