import { parse, stringify } from "yaml";

export interface Document {
  data: Record<string, unknown>;
  body: string;
}

export function parseFrontmatter(text: string): Document {
  if (!text.startsWith("---\n")) return { data: {}, body: text };
  const close = text.indexOf("\n---", 3);
  if (close === -1) throw new Error("unterminated frontmatter");
  const afterClose = close + 4;
  if (afterClose < text.length && text[afterClose] !== "\n") throw new Error("unterminated frontmatter");
  const raw: unknown = parse(text.slice(4, close + 1)) ?? {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("frontmatter must be a mapping");
  const body = afterClose >= text.length ? "" : text.slice(afterClose + 1);
  return { data: raw as Record<string, unknown>, body };
}

export function serializeFrontmatter(data: Record<string, unknown>, body: string): string {
  return `---\n${stringify(data)}---\n${body}`;
}
