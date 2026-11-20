import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS, exportProblem, withDefaults } from "../src/settings.ts";

test("withDefaults uses the defaults when nothing is saved", () => {
  assert.deepEqual(withDefaults(null), DEFAULT_SETTINGS);
});

test("withDefaults keeps saved choices", () => {
  const saved = { columns: 2, compact: false, printBackground: true };
  assert.deepEqual(withDefaults(saved), { ...DEFAULT_SETTINGS, ...saved });
});

test("withDefaults turns compact spacing on for settings saved before 0.1.4", () => {
  const saved = { columns: 3, compact: false };
  assert.deepEqual(withDefaults(saved), { ...DEFAULT_SETTINGS, columns: 3, compact: true });
  assert.equal(saved.compact, false, "the saved object itself is left alone");
});

test("withDefaults gives settings saved before paper and sides A4 and double-sided", () => {
  const saved = { columns: 5, landscape: true, printedFontPt: 6, marginMm: 4, compact: true, printBackground: false, greyscale: true };
  const settings = withDefaults(saved);
  assert.equal(settings.paper, "a4");
  assert.equal(settings.sides, 2);
});

test("exportProblem accepts the defaults", () => {
  assert.equal(exportProblem(DEFAULT_SETTINGS), "");
});

test("exportProblem rejects a font of 0 saved by 0.1.7, even when the field wasn't edited", () => {
  assert.equal(exportProblem({ ...DEFAULT_SETTINGS, printedFontPt: 0 }), "Enter a font size above 0 pt.");
  assert.equal(exportProblem({ ...DEFAULT_SETTINGS, printedFontPt: Number.NaN }), "Enter a font size above 0 pt.");
});

test("exportProblem reports unusable fields, negative margins and margins too large", () => {
  assert.equal(exportProblem(DEFAULT_SETTINGS, new Set(["printedFontPt"])), "Enter a font size above 0 pt.");
  assert.equal(exportProblem(DEFAULT_SETTINGS, new Set(["marginMm"])), "Enter a margin of 0 mm or more.");
  assert.equal(exportProblem({ ...DEFAULT_SETTINGS, marginMm: -1 }), "Enter a margin of 0 mm or more.");
  assert.equal(exportProblem({ ...DEFAULT_SETTINGS, marginMm: 200 }), "Margins are too large for this layout.");
});
