import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument } from "@cantoo/pdf-lib";
import { capacity, columnSlot, computeGeometry } from "../src/geometry.ts";
import { impose } from "../src/impose.ts";

const close = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

const edgeToEdge = { printedFontPt: 6, marginMm: 0, gapMm: 0 };
const landscape4 = { columns: 4, landscape: true, printedFontPt: 6, marginMm: 5, gapMm: 2 };

test("4 landscape columns match A7 width on A4", () => {
  const g = computeGeometry({ ...edgeToEdge, columns: 4, landscape: true });
  close(g.sheetWidth, 297);
  close(g.columnWidth, 74.25);
  close(g.columnHeight, 210);
  close(g.stripHeight, (210 * 210) / 74.25);
  assert.equal(capacity(g), 8);
});

test("3 portrait columns are full height", () => {
  const g = computeGeometry({ ...edgeToEdge, columns: 3, landscape: false });
  close(g.columnWidth, 70);
  close(g.columnHeight, 297);
  close(g.stripHeight, 891);
  close(g.sourceFontPt, 18);
});

test("any column count works, including ones that are not a grid", () => {
  const g = computeGeometry({ ...edgeToEdge, columns: 5, landscape: true });
  close(g.columnWidth, 59.4);
  assert.equal(capacity(g), 10);
});

test("column counts must be whole and positive", () => {
  for (const columns of [0, -1, 2.5]) {
    assert.throws(() => computeGeometry({ ...edgeToEdge, columns, landscape: true }));
  }
});

test("margins and gaps come out of the columns", () => {
  const g = computeGeometry(landscape4);
  close(g.columnWidth, 70.25);
  close(g.columnHeight, 200);
});

test("strips fill columns left to right, then the next side", () => {
  const g = computeGeometry(landscape4);
  assert.equal(columnSlot(g, 3).side, 0);
  close(columnSlot(g, 3).x, 5 + 3 * 72.25);
  assert.equal(columnSlot(g, 4).side, 1);
  close(columnSlot(g, 4).x, 5);
});

test("impose produces A4 sides and rounds partial sides up", async () => {
  const g = computeGeometry(landscape4);
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
