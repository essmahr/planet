import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ctx, run, tmpHome } from "./helpers.ts";
import { repoFromRemote } from "../cli/lib/repos.ts";

function checkout(parent: string, name: string, remote: string): string {
  const dir = join(parent, name);
  mkdirSync(dir);
  execFileSync("git", ["-C", dir, "init", "-q"]);
  execFileSync("git", ["-C", dir, "remote", "add", "origin", remote]);
  return dir;
}

function workspace(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "planet-ws-")));
}

test("repoFromRemote reads ssh and https GitHub urls", () => {
  assert.equal(repoFromRemote("git@github.com:closeio/close-ui.git"), "closeio/close-ui");
  assert.equal(repoFromRemote("https://github.com/closeio/closeio"), "closeio/closeio");
  assert.equal(repoFromRemote("https://github.com/closeio/closeio.git\n"), "closeio/closeio");
  assert.equal(repoFromRemote("https://gitlab.com/o/r.git"), null);
});

test("repo path finds a sibling checkout, records it, and exits 3 when there is none", async () => {
  const home = tmpHome();
  const ws = workspace();
  const fe = checkout(ws, "close-ui", "git@github.com:closeio/close-ui.git");
  const be = checkout(ws, "closeio", "https://github.com/closeio/closeio.git");
  const found = await run(["repo", "path", "closeio/closeio", "--from", fe], ctx(home));
  assert.equal(found.code, 0);
  assert.equal(found.stdout, `${be}\n`);

  const moved = join(workspace(), "elsewhere");
  renameSync(be, moved);
  const gone = await run(["repo", "path", "closeio/closeio", "--from", fe], ctx(home));
  assert.equal(gone.code, 3);
  assert.match(gone.stdout, /no local checkout of closeio\/closeio/);

  const seen = await run(["repo", "seen", "--path", moved], ctx(home));
  assert.equal(seen.stdout, `closeio/closeio ${moved}\n`);
  const again = await run(["repo", "path", "closeio/closeio", "--from", fe], ctx(home));
  assert.equal(again.stdout, `${moved}\n`);
});

test("repo seen refuses a directory without a GitHub origin", async () => {
  const home = tmpHome();
  const r = await run(["repo", "seen", "--path", workspace()], ctx(home));
  assert.equal(r.code, 1);
  assert.match(r.stderr, /not a git checkout with a GitHub origin/);
});

test("repo seen from a linked worktree records the main checkout", async () => {
  const home = tmpHome();
  const ws = workspace();
  const fe = checkout(ws, "close-ui", "git@github.com:closeio/close-ui.git");
  execFileSync("git", ["-C", fe, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init"]);
  const wt = join(workspace(), "wt");
  execFileSync("git", ["-C", fe, "worktree", "add", "-q", "--detach", wt]);
  const r = await run(["repo", "seen", "--path", wt], ctx(home));
  assert.equal(r.stdout, `closeio/close-ui ${fe}\n`);
});
