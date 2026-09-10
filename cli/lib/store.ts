import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

export function planetHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.PLANET_HOME ?? join(homedir(), ".planet");
}

export const REVIEW = "review";

function epicRoot(home: string, slug: string): string {
  return slug === REVIEW ? join(home, "reviews") : join(home, "epics", slug);
}

function feedbackDir(home: string, slug: string): string {
  return slug === REVIEW ? join(home, "reviews") : join(home, "epics", slug, "feedback");
}

export const paths = {
  epics: (home: string) => join(home, "epics"),
  epic: (home: string, slug: string) => join(home, "epics", slug),
  epicFile: (home: string, slug: string) => join(home, "epics", slug, "epic.yaml"),
  plan: (home: string, slug: string) => join(home, "epics", slug, "plan.md"),
  phases: (home: string, slug: string) => join(home, "epics", slug, "phases"),
  proposals: (home: string, slug: string) => join(epicRoot(home, slug), "proposals"),
  feedback: feedbackDir,
  prompts: (home: string, slug: string) => join(feedbackDir(home, slug), "prompts.jsonl"),
  notes: (home: string, slug: string) => join(feedbackDir(home, slug), "notes.md"),
  events: (home: string, slug: string) => join(home, "epics", slug, "feedback", "events.jsonl"),
  retros: (home: string, slug: string) => join(home, "epics", slug, "retros"),
  retroFile: (home: string, slug: string, id: number, phaseSlug: string) => join(home, "epics", slug, "retros", `${String(id).padStart(2, "0")}-${phaseSlug}.md`),
  research: (home: string, slug: string) => join(home, "epics", slug, "research"),
  reviews: (home: string) => join(home, "reviews"),
  reviewFile: (home: string, date: string, n: number) => join(home, "reviews", n === 1 ? `${date}.md` : `${date}-${n}.md`),
  sessions: (home: string) => join(home, "sessions"),
  session: (home: string, id: string) => join(home, "sessions", id),
  hookLog: (home: string) => join(home, "hook.log"),
};

export function git(home: string, args: string[]): string {
  return execFileSync(
    "git",
    [
      "-C", home,
      "-c", "user.name=planet",
      "-c", "user.email=planet@local",
      "-c", "commit.gpgsign=false",
      "-c", "core.hooksPath=/dev/null",
      ...args,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

export function ensureStore(home: string): void {
  mkdirSync(paths.epics(home), { recursive: true });
  mkdirSync(paths.sessions(home), { recursive: true });
  if (!existsSync(join(home, ".git"))) git(home, ["init", "-q"]);
  const gitignore = join(home, ".gitignore");
  if (!existsSync(gitignore)) {
    writeFileSync(gitignore, "hook.log\n.DS_Store\n");
    commit(home, "init store");
  }
}

export function commit(home: string, message: string): boolean {
  git(home, ["add", "-A"]);
  if (git(home, ["status", "--porcelain"]).trim() === "") return false;
  git(home, ["commit", "-q", "-m", message]);
  return true;
}
