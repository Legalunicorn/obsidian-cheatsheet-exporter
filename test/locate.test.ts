import assert from "node:assert/strict";
import { test } from "node:test";
import { locateCutOffs, type Block } from "../src/locate.ts";

const formula = (latex: string, cutOff = false, embed: string | null = null): Block => ({
  kind: "formula",
  latex,
  cutOff,
  embed,
});
const table = (header: string[], cutOff = false): Block => ({ kind: "table", header, cutOff, embed: null });

const note = [
  "---", // 1
  "tags: [x]",
  "---",
  "# Basics", // 4
  "A set $A$ and $B$.",
  "$$",
  "P(A \\cup B) = P(A) + P(B) - P(A \\cap B)", // 7
  "$$",
  "#### Bayes", // 9
  "| x | y |",
  "|---|:-:|",
  "| 1 | 2 |",
  "Again $P(A \\cup B)$ here.", // 13
  "> [!note]",
  "> | a | b |", // 15
  "> | - | - |",
].join("\n");
const headings = [
  { line: 3, text: "Basics" },
  { line: 8, text: "Bayes" },
];

test("cut-off formulas get their line, counting frontmatter, and closest heading", () => {
  const blocks = [formula("A"), formula("B"), formula("P(A \\cup B) = P(A) + P(B) - P(A \\cap B)", true)];
  assert.deepEqual(locateCutOffs(note, headings, blocks), [
    { embed: null, line: 7, heading: "Basics", preview: "P(A \\cup B) = P(A) + P(B) - P(A \\cap B)" },
  ]);
});

test("a repeated formula is placed at the copy that matches its order", () => {
  const blocks = [
    formula("P(A \\cup B) = P(A) + P(B) - P(A \\cap B)"),
    table(["x", "y"]),
    formula("P(A\\cup B)", true),
  ];
  assert.equal(locateCutOffs(note, headings, blocks)[0].line, 13);
});

test("tables are found by their delimiter row, including inside callouts", () => {
  const blocks = [table(["x", "y"], true), table(["a", "b"], true)];
  assert.deepEqual(
    locateCutOffs(note, headings, blocks).map(({ line, heading, preview }) => [line, heading, preview]),
    [
      [10, "Bayes", "Table: x, y"],
      [15, "Bayes", "Table: a, b"],
    ],
  );
});

test("multi-line formulas inside callouts are found despite the > on each line", () => {
  const text = "> [!info]\n> $$\n> a = b \\\\\n> c = d\n> $$";
  assert.equal(locateCutOffs(text, [], [formula("a = b \\\\\nc = d", true)])[0].line, 3);
});

test("short formulas match between $ signs, not inside prose", () => {
  const text = "A word with x in it.\nThen $x$.";
  assert.equal(locateCutOffs(text, [], [formula("x", true)])[0].line, 2);
});

test("a note without headings still gets line numbers", () => {
  assert.deepEqual(locateCutOffs("text\n$$\ny = mx + c\n$$", [], [formula("y=mx+c", true)]), [
    { embed: null, line: 3, heading: null, preview: "y=mx+c" },
  ]);
});

test("an embedded formula names its note and doesn't move the search", () => {
  // The embed's formula also appears later in this note, which must not pull the search past B.
  const blocks = [formula("P(A\\cup B)", true, "Lecture 2"), formula("B", true)];
  assert.deepEqual(locateCutOffs(note, headings, blocks), [
    { embed: "Lecture 2", line: null, heading: null, preview: "P(A\\cup B)" },
    { embed: null, line: 5, heading: "Basics", preview: "B" },
  ]);
});

test("a formula that can't be found has no line and doesn't move the search", () => {
  const blocks = [formula("\\int_0^1 f", true), formula("B", true)];
  assert.deepEqual(locateCutOffs(note, headings, blocks), [
    { embed: null, line: null, heading: null, preview: "\\int_0^1 f" },
    { embed: null, line: 5, heading: "Basics", preview: "B" },
  ]);
});

test("long previews are shortened", () => {
  const latex = "\\sum_{i=1}^{n} \\binom{n}{i} p^i (1-p)^{n-i} = 1 \\quad \\text{for all } n";
  const [cutOff] = locateCutOffs(`$$${latex}$$`, [], [formula(latex, true)]);
  assert.equal(cutOff.preview.length, 40);
  assert.ok(cutOff.preview.endsWith("…"));
});
