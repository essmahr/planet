import type { Gh } from "./gh.ts";

export interface Ctx {
  home: string;
  gh: Gh;
  now: () => string;
  env: NodeJS.ProcessEnv;
  stdin: () => string;
  sleep: (ms: number) => Promise<void>;
  pid: number;
  isAlive: (pid: number) => boolean;
}

export interface CommandResult {
  json: unknown;
  text: string;
  exitCode?: number;
}

export type Command = (args: string[], ctx: Ctx) => Promise<CommandResult>;
