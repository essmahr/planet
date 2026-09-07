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

async function gh(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("gh", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 10_000 });
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
  };
}
