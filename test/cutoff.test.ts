import assert from "node:assert/strict";
import { test } from "node:test";
import { describeCutOffs, type Item } from "../src/cutoff.ts";

const heading = (text: string, embed: string | null = null): Item => ({ kind: "heading", text, embed });
const formula = (latex: string, embed: string | null = null): Item => ({ kind: "formula", latex, embed });
const table = (header: string[]): Item => ({ kind: "table", header, embed: null });

test("each cut-off gets the closest heading above it", () => {
  assert.deepEqual(describeCutOffs([heading("Basics"), formula("a = b"), heading("Bayes"), table(["x", "y"])]), [
    { embed: null, heading: "Basics", preview: "a = b" },
    { embed: null, heading: "Bayes", preview: "Table: x, y" },
  ]);
});

test("a note without headings still lists each cut-off", () => {
  assert.deepEqual(describeCutOffs([formula("y = mx + c")]), [{ embed: null, heading: null, preview: "y = mx + c" }]);
});

test("an embed's headings label only its own cut-offs", () => {
  const items = [
    heading("Combined"),
    heading("Lecture 2 intro", "Lecture 2"),
    formula("f(x,y)", "Lecture 2"),
    formula("e = \\lim"),
  ];
  assert.deepEqual(describeCutOffs(items), [
    { embed: "Lecture 2", heading: "Lecture 2 intro", preview: "f(x,y)" },
    { embed: null, heading: "Combined", preview: "e = \\lim" },
  ]);
});

test("previews collapse whitespace and are shortened", () => {
  const latex = "\\sum_{i=1}^{n}\n  \\binom{n}{i} p^i (1-p)^{n-i} = 1 \\quad \\text{for all } n";
  const [cutOff] = describeCutOffs([formula(latex)]);
  assert.equal(cutOff.preview.length, 40);
  assert.ok(cutOff.preview.startsWith("\\sum_{i=1}^{n} \\binom"));
  assert.ok(cutOff.preview.endsWith("…"));
});
