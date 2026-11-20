import assert from "node:assert/strict";
import { test } from "node:test";
import type { Geometry } from "../src/geometry.ts";
import { fontLimit, largestFont, recommendLayout } from "../src/recommend.ts";

const printed = (g: Geometry) => g.sourceFontPt * g.scale;
const sheet = { paper: "a4", sides: 2, marginMm: 5 } as const;
const landscape4 = { ...sheet, columns: 4, landscape: true };

test("largestFont finds the biggest size that fits one sheet", () => {
  const measure = (g: Geometry) => ({ strips: printed(g), overflowing: 0 });
  assert.equal(largestFont(measure, landscape4), 8);
});

test("largestFont is null when nothing fits", () => {
  assert.equal(largestFont(() => ({ strips: 100, overflowing: 0 }), landscape4), null);
});

test("largestFont treats cut-off content as not fitting", () => {
  const measure = (g: Geometry) => ({ strips: 1, overflowing: printed(g) > 7.01 ? 1 : 0 });
  assert.equal(largestFont(measure, landscape4), 7);
  assert.equal(largestFont(measure, landscape4, { allowCutOff: true }), 14);
});

test("fontLimit keeps lines about 40 characters long, up to 10 pt", () => {
  assert.equal(fontLimit({ ...sheet, columns: 3, landscape: true }), 10);
  assert.equal(fontLimit({ ...sheet, columns: 4, landscape: true }), 9.5);
  assert.equal(fontLimit({ ...sheet, columns: 5, landscape: true }), 7.5);
  assert.equal(fontLimit({ ...sheet, columns: 3, landscape: false }), 9);
  assert.equal(fontLimit({ ...sheet, columns: 8, landscape: false }), 5);
});

test("recommendLayout won't buy a bigger font with thin columns", () => {
  const measure = (g: Geometry) => ({
    strips: printed(g),
    overflowing: g.columnWidth < 50 ? 1 : 0,
  });
  // 5 landscape columns would fit 10 pt, but only 7.5 pt keeps lines long enough.
  const best = recommendLayout(measure, sheet);
  assert.deepEqual(best, { ...sheet, columns: 4, landscape: true, printedFontPt: 8 });
});

test("recommendLayout still uses many columns when the note needs them", () => {
  const best = recommendLayout((g) => ({ strips: 2 * printed(g), overflowing: 0 }), sheet);
  assert.deepEqual(best, { ...sheet, columns: 6, landscape: true, printedFontPt: 6 });
});

test("recommendLayout caps a short note at 10 pt and prefers columns near 4 landscape or 3 portrait", () => {
  const best = recommendLayout(() => ({ strips: 0.1, overflowing: 0 }), sheet);
  assert.deepEqual(best, { ...sheet, columns: 3, landscape: true, printedFontPt: 10 });
});

test("recommendLayout is null when no layout fits", () => {
  assert.equal(recommendLayout(() => ({ strips: 100, overflowing: 0 }), sheet), null);
});

test("recommendLayout fits a single-sided sheet on one side", () => {
  const measure = (g: Geometry) => ({ strips: 2 * printed(g), overflowing: 0 });
  // Fits two sides at 6 pt (see above), but needs 10 strips even at 5 pt, more than 8 columns hold.
  assert.equal(recommendLayout(measure, { ...sheet, sides: 1 }), null);
  const roomier = recommendLayout((g) => ({ strips: printed(g), overflowing: 0 }), { ...sheet, sides: 1 });
  assert.deepEqual(roomier, { ...sheet, sides: 1, columns: 6, landscape: true, printedFontPt: 6 });
});
