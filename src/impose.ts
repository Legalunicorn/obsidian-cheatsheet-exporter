import { ParseSpeeds, PDFDocument } from "@cantoo/pdf-lib";
import { columnSlot, type Geometry } from "./geometry.ts";

const PT_PER_MM = 72 / 25.4;

/** Lays each page of the strip PDF out as a column on A4 sides. */
export async function impose(
  stripPdf: Uint8Array,
  g: Geometry,
): Promise<{ pdf: Uint8Array; strips: number; sides: number }> {
  // No yielding between objects: timers are throttled while the window is hidden.
  const source = await PDFDocument.load(stripPdf, { parseSpeed: ParseSpeeds.Fastest });
  const output = await PDFDocument.create();
  const strips = await output.embedPages(source.getPages());

  const sides = Math.ceil(strips.length / g.columns);
  const pages = Array.from({ length: sides }, () =>
    output.addPage([g.sheetWidth * PT_PER_MM, g.sheetHeight * PT_PER_MM]),
  );

  strips.forEach((strip, index) => {
    const slot = columnSlot(g, index);
    pages[slot.side].drawPage(strip, {
      x: slot.x * PT_PER_MM,
      y: slot.y * PT_PER_MM,
      width: g.columnWidth * PT_PER_MM,
      height: g.columnHeight * PT_PER_MM,
    });
  });

  const pdf = await output.save({ objectsPerTick: Infinity });
  return { pdf, strips: strips.length, sides };
}
