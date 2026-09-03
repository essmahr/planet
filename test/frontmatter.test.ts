import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontmatter, serializeFrontmatter } from "../cli/lib/frontmatter.ts";

test("parses frontmatter and body", () => {
  const doc = parseFrontmatter("---\nid: 1\nslug: a\n---\nBody line\n");
  assert.deepEqual(doc.data, { id: 1, slug: "a" });
  assert.equal(doc.body, "Body line\n");
});

test("no frontmatter means empty data", () => {
  assert.deepEqual(parseFrontmatter("just text"), { data: {}, body: "just text" });
});

test("frontmatter with no body", () => {
  assert.deepEqual(parseFrontmatter("---\nid: 1\n---"), { data: { id: 1 }, body: "" });
  assert.deepEqual(parseFrontmatter("---\nid: 1\n---\n"), { data: { id: 1 }, body: "" });
});

test("round trips through serialize", () => {
  const text = serializeFrontmatter({ id: 2, prs: [] }, "Hello\n");
  assert.equal(text, "---\nid: 2\nprs: []\n---\nHello\n");
  assert.deepEqual(parseFrontmatter(text), { data: { id: 2, prs: [] }, body: "Hello\n" });
});

test("rejects unterminated frontmatter", () => {
  assert.throws(() => parseFrontmatter("---\nid: 1\n"), /unterminated/);
});
