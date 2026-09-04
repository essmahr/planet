import { closeSync, existsSync, fstatSync, openSync, readSync } from "node:fs";

/** Only the end of the transcript is read; the wanted record is always among the latest events. */
export const TRANSCRIPT_TAIL_BYTES = 2 * 1024 * 1024;

/**
 * Best-effort read of the user's rejection message for an ExitPlanMode call from the
 * session transcript that Claude Code names in every hook payload.
 *
 * A rejected plan fires no hook event, so the transcript is the only place the message
 * exists. The JSONL layout is Claude Code internal: a `user` record whose content holds
 * a `tool_result` for the tool_use_id, with `userFeedback` at the top level. Anything
 * unexpected returns null and the caller records that the message was not captured.
 */
export function rejectionFeedback(transcriptPath: string | undefined, toolUseId: string | null): string | null {
  if (!transcriptPath || !toolUseId || !existsSync(transcriptPath)) return null;
  let lines: string[];
  try {
    lines = readTail(transcriptPath, TRANSCRIPT_TAIL_BYTES).split("\n");
  } catch {
    return null;
  }
  for (const line of lines) {
    if (!line.includes(toolUseId)) continue;
    const found = feedbackFromRecord(line, toolUseId);
    if (found !== undefined) return found;
  }
  return null;
}

interface ResultBlock {
  type?: string;
  tool_use_id?: string;
  content?: unknown;
}

/** Undefined when the line holds no matching tool_result; otherwise the feedback or null. */
function feedbackFromRecord(line: string, toolUseId: string): string | null | undefined {
  let record: { userFeedback?: unknown; message?: { content?: unknown } };
  try {
    record = JSON.parse(line);
  } catch {
    return undefined;
  }
  const content = record.message?.content;
  if (!Array.isArray(content)) return undefined;
  const hit = (content as ResultBlock[]).find((b) => b && b.type === "tool_result" && b.tool_use_id === toolUseId);
  if (!hit) return undefined;
  if (typeof record.userFeedback === "string" && record.userFeedback.trim()) return record.userFeedback;
  return feedbackFromResultText(resultText(hit.content));
}

function resultText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((x) => (x && typeof (x as { text?: unknown }).text === "string" ? (x as { text: string }).text : "")).join("\n");
}

const FEEDBACK_MARKERS = ["the user said:\n", "reason for the rejection:", "Comments on the plan:\n"];
const TRAILING_NOTE = "\n\nNote: The user's next message";

/** Pulls the user's words out of Claude Code's rejection boilerplate. */
export function feedbackFromResultText(text: string): string | null {
  for (const marker of FEEDBACK_MARKERS) {
    const at = text.indexOf(marker);
    if (at === -1) continue;
    const rest = text.slice(at + marker.length);
    const note = rest.indexOf(TRAILING_NOTE);
    const message = (note === -1 ? rest : rest.slice(0, note)).trim();
    return message || null;
  }
  return null;
}

function readTail(path: string, maxBytes: number): string {
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, size - length);
    return buffer.toString("utf8");
  } finally {
    closeSync(fd);
  }
}
