import assert from "node:assert/strict";
import { test } from "node:test";
import type { Geometry } from "../src/geometry.ts";
import { fontLimit, largestFont, recommendLayout } from "../src/recommend.ts";

const printed = (g: Geometry) => g.sourceFontPt * g.scale;
const landscape4 = { columns: 4, landscape: true, marginMm: 5 };

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
  assert.equal(fontLimit({ columns: 3, landscape: true, marginMm: 5 }), 10);
  assert.equal(fontLimit({ columns: 4, landscape: true, marginMm: 5 }), 9.5);
  assert.equal(fontLimit({ columns: 5, landscape: true, marginMm: 5 }), 7.5);
  assert.equal(fontLimit({ columns: 3, landscape: false, marginMm: 5 }), 9);
  assert.equal(fontLimit({ columns: 8, landscape: false, marginMm: 5 }), 5);
});

test("recommendLayout won't buy a bigger font with thin columns", () => {
  const measure = (g: Geometry) => ({
    strips: printed(g),
    overflowing: g.columnWidth < 50 ? 1 : 0,
  });
  // 5 landscape columns would fit 10 pt, but only 7.5 pt keeps lines long enough.
  const best = recommendLayout(measure, 5);
  assert.deepEqual(best, { columns: 4, landscape: true, marginMm: 5, printedFontPt: 8 });
});

test("recommendLayout still uses many columns when the note needs them", () => {
  const best = recommendLayout((g) => ({ strips: 2 * printed(g), overflowing: 0 }), 5);
  assert.deepEqual(best, { columns: 6, landscape: true, marginMm: 5, printedFontPt: 6 });
});

test("recommendLayout caps a short note at 10 pt and prefers columns near 4 landscape or 3 portrait", () => {
  const best = recommendLayout(() => ({ strips: 0.1, overflowing: 0 }), 5);
  assert.deepEqual(best, { columns: 3, landscape: true, marginMm: 5, printedFontPt: 10 });
});

test("recommendLayout is null when no layout fits", () => {
  assert.equal(recommendLayout(() => ({ strips: 100, overflowing: 0 }), 5), null);
});
