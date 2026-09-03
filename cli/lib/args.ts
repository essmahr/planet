import { parseArgs } from "node:util";

export type OptionSpec = { type: "string" | "boolean"; short?: string; multiple?: boolean };

export interface Parsed {
  positionals: string[];
  values: Record<string, string | boolean | string[] | undefined>;
}

export function parse(args: string[], options: Record<string, OptionSpec>): Parsed {
  const result = parseArgs({ args, options, allowPositionals: true, strict: true });
  return { positionals: result.positionals, values: result.values as Parsed["values"] };
}

export function need(positionals: string[], index: number, what: string): string {
  const value = positionals[index];
  if (value === undefined) throw new Error(`missing ${what}`);
  return value;
}

export function needInt(positionals: string[], index: number, what: string): number {
  const value = Number(need(positionals, index, what));
  if (!Number.isInteger(value)) throw new Error(`${what} must be an integer`);
  return value;
}

export function optString(values: Parsed["values"], name: string): string | undefined {
  const value = values[name];
  return typeof value === "string" ? value : undefined;
}

export function needString(values: Parsed["values"], name: string): string {
  const value = optString(values, name);
  if (value === undefined) throw new Error(`missing --${name}`);
  return value;
}

export function optList(values: Parsed["values"], name: string): string[] {
  const value = values[name];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
}

export function flag(values: Parsed["values"], name: string): boolean {
  return values[name] === true;
}
