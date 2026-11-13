import { existsSync, readFileSync } from "node:fs";

export interface PidLine {
  pid: number;
  session: string | null;
}

export function readPidLine(file: string): PidLine | null {
  if (!existsSync(file)) return null;
  const [pidText, session] = readFileSync(file, "utf8").trim().split(/\s+/);
  const pid = Number(pidText);
  if (!Number.isInteger(pid) || pid <= 0) return null;
  return { pid, session: session ?? null };
}
