import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureStore } from "../cli/lib/store.ts";

export const NOW = "2026-09-03T15:00:00.000Z";
export const SESSION = "sess-1";

export function tmpHome(): string {
  const home = mkdtempSync(join(tmpdir(), "planet-"));
  ensureStore(home);
  return home;
}
