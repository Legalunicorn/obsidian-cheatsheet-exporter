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

// Text Obsidian doesn't render as maths or tables must never be matched, or the line points at the wrong place.
const longFormula = "E[X] = \\sum_x x\\, f(x)";
const lineOf = (text: string) => locateCutOffs(text, [], [formula(longFormula, true)])[0].line;

test("a formula quoted in frontmatter is skipped, even when the YAML is invalid", () => {
  assert.equal(lineOf(`---\nsummary: '$${longFormula}$'\n---\n$$${longFormula}$$`), 4);
  // "\s" is not a valid escape in double-quoted YAML, so Obsidian reports no frontmatter but still hides it.
  assert.equal(lineOf(`---\r\nsummary: "$${longFormula}$"\r\n---\r\n$$${longFormula}$$`), 4);
});

test("a --- that doesn't open the note isn't frontmatter", () => {
  assert.equal(lineOf(`Intro\n---\n$$${longFormula}$$\n---`), 3);
});

test("a formula in inline code is skipped", () => {
  assert.equal(lineOf(`Write \`$${longFormula}$\` for this.\n\n$$${longFormula}$$`), 3);
});

test("a formula in a fenced code block is skipped, including fences inside callouts", () => {
  assert.equal(lineOf(`\`\`\`latex\n$$${longFormula}$$\n\`\`\`\n$$${longFormula}$$`), 4);
  assert.equal(lineOf(`> [!example]\n> ~~~\n> $${longFormula}$\n> ~~~\n$$${longFormula}$$`), 5);
});

test("a code fence opened on a list item's line is recognised, and doesn't hide the rest", () => {
  assert.equal(lineOf(`- \`\`\`latex\n  $$${longFormula}$$\n  \`\`\`\n\n$$${longFormula}$$`), 5);
  assert.equal(lineOf(`1. ~~~\n   $${longFormula}$\n   ~~~\n> - \`\`\`\n>   x\n>   \`\`\`\n\n$$${longFormula}$$`), 8);
});

test("indented code blocks are skipped", () => {
  assert.equal(lineOf(`Intro\n\n    $$${longFormula}$$\n\n$$${longFormula}$$`), 5);
  const text = "Text\n\n\t| x | y |\n\t|---|---|\n\n| x | y |\n|---|---|";
  assert.equal(locateCutOffs(text, [], [table(["x", "y"], true)])[0].line, 6);
});

test("indented text that belongs to a list or paragraph isn't code", () => {
  assert.equal(lineOf(`- item\n\n    $$${longFormula}$$`), 3);
  assert.equal(lineOf(`1. item\n   more\n\n    $$${longFormula}$$`), 4);
  assert.equal(lineOf(`Paragraph\n    $$${longFormula}$$`), 2);
});

test("indented code inside a callout is skipped, but list items in a callout aren't code", () => {
  assert.equal(lineOf(`> [!note]\n>\n>     $$${longFormula}$$\n\n$$${longFormula}$$`), 5);
  assert.equal(lineOf(`> - item\n>\n>     $$${longFormula}$$`), 3);
});

test("only rows with matching pipe-separated columns count as a table", () => {
  const find = (text: string) => locateCutOffs(text, [], [table(["x", "y"], true)])[0].line;
  // A Setext heading containing a pipe, then a table.
  assert.equal(find("CPU | GPU\n---\n\n| x | y |\n|---|---|"), 4);
  // Three header cells over two delimiter cells isn't a table in Obsidian.
  assert.equal(find("a | b | c\n|---|---|\n\n| x | y |\n|---|---|"), 4);
  // A one-column table still works.
  assert.equal(find("| x |\n| --- |"), 1);
});

test("a line starting with emphasis isn't mistaken for a list item", () => {
  assert.equal(lineOf(`*note* \`\`\`not a fence\n$$${longFormula}$$`), 2);
});

test("a formula in an Obsidian or HTML comment is skipped", () => {
  assert.equal(lineOf(`%% $${longFormula}$ %%\n<!-- $${longFormula}$ -->\n$$${longFormula}$$`), 3);
});

test("a table inside a code fence is skipped", () => {
  const text = "```\n| a | b |\n|---|---|\n```\n| x | y |\n|---|---|";
  assert.equal(locateCutOffs(text, [], [table(["x", "y"], true)])[0].line, 5);
});

test("an unclosed inline backtick doesn't hide the rest of the note", () => {
  assert.equal(lineOf(`A stray \` backtick.\n\n$$${longFormula}$$`), 3);
});
