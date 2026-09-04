import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpHome } from "./helpers.ts";
import { feedbackFromResultText, rejectionFeedback } from "../cli/lib/transcript.ts";

test("feedbackFromResultText handles the three rejection phrasings", () => {
  assert.equal(feedbackFromResultText("The user doesn't want to proceed. To tell you how to proceed, the user said:\nfoo bar\n\nNote: The user's next message may contain a correction"), "foo bar");
  assert.equal(feedbackFromResultText("The tool use was rejected. The user provided the following reason for the rejection:  be terser"), "be terser");
  assert.equal(feedbackFromResultText('User chose to stay in plan mode and continue planning\n\nComments on the plan:\n[Re: "x"] why'), '[Re: "x"] why');
  assert.equal(feedbackFromResultText("nothing relevant"), null);
});

test("rejectionFeedback prefers userFeedback, falls back to result text, and never throws", () => {
  const home = tmpHome();
  const file = join(home, "t.jsonl");
  const withFeedback = { userFeedback: "trim it", message: { content: [{ type: "tool_result", tool_use_id: "a", content: "ignored" }] } };
  const textOnly = { message: { content: [{ type: "tool_result", tool_use_id: "b", content: [{ type: "text", text: "rejected. the user said:\nno thanks" }] }] } };
  writeFileSync(file, `not json but mentions a\n${JSON.stringify(withFeedback)}\n${JSON.stringify(textOnly)}\n`);
  assert.equal(rejectionFeedback(file, "a"), "trim it");
  assert.equal(rejectionFeedback(file, "b"), "no thanks");
  assert.equal(rejectionFeedback(file, "zzz"), null);
  assert.equal(rejectionFeedback("/nonexistent", "a"), null);
  assert.equal(rejectionFeedback(undefined, "a"), null);
  assert.equal(rejectionFeedback(file, null), null);
});
