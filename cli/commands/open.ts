import type { Command } from "../lib/context.ts";
import { need, optString, parse } from "../lib/args.ts";
import { listEpics, resolveEpics } from "../lib/epic.ts";
import { listPhases } from "../lib/phase.ts";
import { sessionIdFrom, startSession } from "../lib/session.ts";
import { commit } from "../lib/store.ts";
import { epicBrief } from "../lib/view.ts";
import { parseStep } from "./session.ts";
import { READ_OPTIONS, buildRows, syncForRead } from "./status.ts";

export const openCommand: Command = async (args, ctx) => {
  const { positionals, values } = parse(args, { ...READ_OPTIONS, step: { type: "string" }, session: { type: "string" } });
  const text = need(positionals, 0, "text to resolve");
  const stale = await syncForRead(ctx, values);
  const rows = buildRows(ctx.home, stale).filter((r) => r.status !== "shipped" && r.status !== "abandoned");
  const matches = resolveEpics(listEpics(ctx.home), text, (slug) => listPhases(ctx.home, slug).map((p) => p.meta));
  if (matches.length !== 1) {
    const candidates = matches.map((e) => e.slug);
    return {
      json: { match: null, candidates, status: rows },
      text: candidates.length ? `ambiguous: ${candidates.join(", ")}` : `no epic matches '${text}'`,
    };
  }
  const slug = matches[0].slug;
  const stepText = optString(values, "step");
  const id = sessionIdFrom(ctx.env, optString(values, "session"));
  const marker = startSession(ctx.home, id, slug, { step: stepText === undefined ? null : parseStep(stepText) }, ctx.now());
  commit(ctx.home, `${slug}: start session`);
  return {
    json: { match: slug, marker, status: rows, epic: epicBrief(ctx.home, slug) },
    text: `opened ${slug}`,
  };
};
