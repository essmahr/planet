import type { Command } from "../lib/context.ts";
import { parse } from "../lib/args.ts";
import { listEpics } from "../lib/epic.ts";
import { buildReport } from "../lib/report.ts";
import { renderTable } from "../lib/table.ts";

export const feedbackCommand: Command = async (args, ctx) => {
  const [sub, ...rest] = args;
  if (sub !== "report") throw new Error("usage: planet feedback report [epic]");
  const { positionals } = parse(rest, {});
  const epics = positionals[0] ? [positionals[0]] : listEpics(ctx.home).map((e) => e.slug);
  const report = buildReport(ctx.home, epics);
  const table = renderTable(
    ["STEP", "PROPOSALS", "APPROVED", "REJECTED", "PENDING", "EDITED", "PER APPROVAL"],
    report.steps.map((s) => [s.step, String(s.proposals), String(s.approved), String(s.rejected), String(s.pending), String(s.edited), s.proposals_per_approval === null ? "-" : s.proposals_per_approval.toFixed(1)]),
  );
  const tags = Object.entries(report.tags).map(([t, n]) => `${t}=${n}`).join(" ") || "none";
  const prompts = Object.entries(report.prompts).map(([k, n]) => `${k}=${n}`).join(" ") || "none";
  const events = Object.entries(report.events).map(([k, n]) => `${k}=${n}`).join(" ") || "none";
  const applyCount = report.lessons.filter((l) => l.apply).length;
  const lastReview = report.reviews.length ? ` (last ${report.reviews[report.reviews.length - 1].date})` : "";
  return {
    json: report,
    text: `${table}\n\nrejections: ${report.rejections.length}  edits: ${report.edits.length}\ntags: ${tags}\nprompts: ${prompts}\nlessons: ${applyCount} to apply, ${report.lessons.length} total\nskill rejections: ${report.skill_rejections.length}\nevents: ${events}\nreviews: ${report.reviews.length}${lastReview}`,
  };
};
