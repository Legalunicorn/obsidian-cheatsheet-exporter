import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "@cantoo/pdf-lib";
import { capacity, columnSlot, computeGeometry } from "../src/geometry.ts";
import { impose } from "../src/impose.ts";

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

const edgeToEdge = { printedFontPt: 6, marginMm: 0, gapMm: 0 };

test("8 per side matches A7 columns on landscape A4", () => {
  const g = computeGeometry({ ...edgeToEdge, layout: "8" });
  close(g.sheetWidth, 297);
  close(g.columnWidth, 74.25);
  close(g.columnHeight, 210);
  close(g.stripHeight, (210 * 210) / 74.25);
  assert.equal(capacity(g), 8);
});

test("9 per side is three full-height columns on portrait A4", () => {
  const g = computeGeometry({ ...edgeToEdge, layout: "9" });
  close(g.columnWidth, 70);
  close(g.columnHeight, 297);
  close(g.stripHeight, 891);
  close(g.sourceFontPt, 18);
});

test("16 per side quadruples the strip height", () => {
  const g = computeGeometry({ ...edgeToEdge, layout: "16" });
  close(g.columnWidth, 52.5);
  close(g.stripHeight, 1188);
  close(g.sourceFontPt, 24);
});

test("margins and gaps come out of the columns", () => {
  const g = computeGeometry({ layout: "8", printedFontPt: 6, marginMm: 5, gapMm: 2 });
  close(g.columnWidth, 70.25);
  close(g.columnHeight, 200);
});

test("strips fill columns left to right, then the next side", () => {
  const g = computeGeometry({ layout: "8", printedFontPt: 6, marginMm: 5, gapMm: 2 });
  assert.equal(columnSlot(g, 3).side, 0);
  close(columnSlot(g, 3).x, 5 + 3 * 72.25);
  assert.equal(columnSlot(g, 4).side, 1);
  close(columnSlot(g, 4).x, 5);
});

test("impose produces A4 sides and rounds partial sides up", async () => {
  const g = computeGeometry({ layout: "8", printedFontPt: 6, marginMm: 5, gapMm: 2 });
  const doc = await PDFDocument.create();
  for (let i = 0; i < 5; i++) {
    doc.addPage([595, 1684]).drawRectangle({ width: 10, height: 10 });
  }

  const result = await impose(await doc.save(), g);
  assert.equal(result.strips, 5);
  assert.equal(result.sides, 2);

  const out = await PDFDocument.load(result.pdf);
  assert.equal(out.getPageCount(), 2);
  assert.ok(Math.abs(out.getPage(0).getWidth() - 841.89) < 0.01);
  assert.ok(Math.abs(out.getPage(0).getHeight() - 595.28) < 0.01);
});
