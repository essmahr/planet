import type { Gh } from "./gh.ts";

export interface Ctx {
  home: string;
  gh: Gh;
  now: () => string;
  env: NodeJS.ProcessEnv;
  stdin: () => string;
}

export interface CommandResult {
  json: unknown;
  text: string;
  exitCode?: number;
}

export type Command = (args: string[], ctx: Ctx) => Promise<CommandResult>;
