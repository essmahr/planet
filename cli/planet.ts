import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { Command, Ctx } from "./lib/context.ts";
import { realGh } from "./lib/gh.ts";
import { ensureStore, planetHome } from "./lib/store.ts";
import { captureCommand } from "./commands/capture.ts";
import { checkCommand } from "./commands/check.ts";
import { epicCommand } from "./commands/epic.ts";
import { feedbackCommand } from "./commands/feedback.ts";
import { linkCommand, unlinkCommand } from "./commands/link.ts";
import { openCommand } from "./commands/open.ts";
import { phaseCommand } from "./commands/phase.ts";
import { prCommand } from "./commands/pr.ts";
import { proposalCommand, proposeCommand } from "./commands/proposal.ts";
import { sessionCommand } from "./commands/session.ts";
import { statusCommand } from "./commands/status.ts";
import { syncCommand } from "./commands/sync.ts";

export const COMMANDS: Record<string, Command> = {
  status: statusCommand,
  open: openCommand,
  epic: epicCommand,
  phase: phaseCommand,
  link: linkCommand,
  unlink: unlinkCommand,
  session: sessionCommand,
  propose: proposeCommand,
  proposal: proposalCommand,
  sync: syncCommand,
  check: checkCommand,
  pr: prCommand,
  feedback: feedbackCommand,
  capture: captureCommand,
};

const USAGE = `usage: planet <command> [args] [--json]

commands:
  status [--all] [--no-sync] [--force]
  open <text> [--step <name>]
  epic new|set|show|resolve
  phase new|write|set
  link <epic> <phase> <pr-url>...
  unlink <epic> <phase> <pr-url>
  session start|step|end
  propose <epic> <step> --file <path>
  proposal approve <epic> <id> --to plan|phase:<n>
  sync [epic] [--force]
  pr files <epic> <phase>
  feedback report [epic]
  check
  capture   (hook entry, reads Claude Code json on stdin)
`;

export interface Output {
  stdout(text: string): void;
  stderr(text: string): void;
}

export function defaultCtx(): Ctx {
  return {
    home: planetHome(),
    gh: realGh(),
    now: () => new Date().toISOString(),
    env: process.env,
    stdin: () => readFileSync(0, "utf8"),
  };
}

function withNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}

export async function main(argv: string[], ctx: Ctx, out: Output): Promise<number> {
  const json = argv.includes("--json");
  const [name, ...rest] = argv.filter((a) => a !== "--json");
  if (!name || name === "--help" || name === "-h") {
    out.stdout(USAGE);
    return 0;
  }
  const command = COMMANDS[name];
  if (!command) {
    out.stderr(`planet: unknown command '${name}'\n${USAGE}`);
    return 2;
  }
  ensureStore(ctx.home);
  try {
    const result = await command(rest, ctx);
    if (json) out.stdout(`${JSON.stringify(result.json, null, 2)}\n`);
    else if (result.text) out.stdout(withNewline(result.text));
    return result.exitCode ?? 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (json) out.stdout(`${JSON.stringify({ error: message })}\n`);
    else out.stderr(`planet: ${message}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2), defaultCtx(), {
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
  }).then((code) => {
    process.exitCode = code;
  });
}
