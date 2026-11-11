import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { paths } from "./store.ts";

/** The `owner/name` part of a GitHub remote url, ssh or https, with or without `.git`. */
export function repoFromRemote(url: string): string | null {
  const m = /github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(url.trim());
  return m ? m[1] : null;
}

function gitIn(dir: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

export interface Checkout {
  repo: string;
  path: string;
}

/**
 * The main checkout that `dir` belongs to, and its GitHub repo from `origin`.
 *
 * A linked worktree resolves to its main checkout, so sibling lookups and the
 * registry never point into a short-lived worktree.
 */
export function checkoutOf(dir: string): Checkout | null {
  const common = gitIn(dir, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (!common) return null;
  const path = dirname(common);
  const remote = gitIn(path, ["remote", "get-url", "origin"]);
  const repo = remote ? repoFromRemote(remote) : null;
  return repo ? { repo, path } : null;
}

function readRegistry(home: string): Record<string, string> {
  const file = paths.repos(home);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeRegistry(home: string, registry: Record<string, string>): void {
  const file = paths.repos(home);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(registry, null, 2)}\n`);
}

/** Records the checkout at `dir` in the machine-local registry. */
export function recordCheckout(home: string, dir: string): Checkout {
  const checkout = checkoutOf(resolve(dir));
  if (!checkout) throw new Error(`${dir} is not a git checkout with a GitHub origin`);
  writeRegistry(home, { ...readRegistry(home), [checkout.repo]: checkout.path });
  return checkout;
}

/**
 * Finds a local checkout of `repo`: the registry first, then siblings of the checkout at `from`.
 *
 * A registry entry counts only while its directory still has that origin. A sibling
 * found by scanning is recorded, so the next lookup skips the scan.
 */
export function findCheckout(home: string, repo: string, from: string): string | null {
  const known = readRegistry(home)[repo];
  if (known && checkoutOf(known)?.repo === repo) return known;
  const here = checkoutOf(resolve(from));
  if (!here) return null;
  if (here.repo === repo) return recordCheckout(home, here.path).path;
  const parent = dirname(here.path);
  for (const entry of readdirSync(parent, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(parent, entry.name);
    if (!existsSync(join(dir, ".git"))) continue;
    if (checkoutOf(dir)?.repo === repo) return recordCheckout(home, dir).path;
  }
  return null;
}
