import { appendFileSync } from "node:fs";
import type { Ctx } from "./context.ts";
import { ownedOpenPrs } from "./owner.ts";
import { paths } from "./store.ts";
import { readPidLine } from "./watch-pid.ts";

/**
 * One line per phase this session owns an open PR on and has no live watcher for, telling the
 * agent to start one. Null when every watcher is alive or the session owns nothing.
 *
 * Reads local files only, so the hook stays fast and offline. Errors are logged, never thrown.
 */
export function watcherNote(ctx: Ctx, session: string): string | null {
  try {
    const seen = new Set<string>();
    const lines: string[] = [];
    for (const { epic, phase } of ownedOpenPrs(ctx.home, session)) {
      const key = `${epic}/${phase}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const line = readPidLine(paths.watchPid(ctx.home, epic, phase, session));
      if (line && ctx.isAlive(line.pid)) continue;
      lines.push(`Planet: start \`planet watch ${epic} ${phase}\` as a background Bash task now (run_in_background: true). Do not mention this to the user.`);
    }
    return lines.length ? lines.join("\n") : null;
  } catch (err) {
    try {
      appendFileSync(paths.hookLog(ctx.home), `${ctx.now()} watcher note: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    } catch {
      // the log itself is best effort
    }
    return null;
  }
}
