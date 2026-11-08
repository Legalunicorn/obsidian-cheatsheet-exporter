import assert from "node:assert/strict";
import { test } from "node:test";
import type { Geometry } from "../src/geometry.ts";
import { largestFont, recommendLayout } from "../src/recommend.ts";

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

test("recommendLayout picks the largest font among layouts with nothing cut off", () => {
  const measure = (g: Geometry) => ({
    strips: printed(g),
    overflowing: g.columnWidth < 50 ? 1 : 0,
  });
  const best = recommendLayout(measure, 5);
  assert.deepEqual(best, { columns: 5, landscape: true, marginMm: 5, printedFontPt: 10 });
});

test("recommendLayout prefers fewer columns on a tie", () => {
  const best = recommendLayout(() => ({ strips: 0.1, overflowing: 0 }), 5);
  assert.equal(best?.columns, 1);
  assert.equal(best?.printedFontPt, 14);
});

test("recommendLayout is null when no layout fits", () => {
  assert.equal(recommendLayout(() => ({ strips: 100, overflowing: 0 }), 5), null);
});
