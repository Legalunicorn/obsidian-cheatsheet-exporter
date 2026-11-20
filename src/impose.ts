import { ParseSpeeds, PDFDocument, grayscale } from "@cantoo/pdf-lib";
import { columnSlot, dividerPositions, type Geometry } from "./geometry.ts";

const PT_PER_MM = 72 / 25.4;
/** Thin and light, so the lines separate columns without competing with the text. */
const DIVIDER_PT = 0.4;
const DIVIDER_GREY = 0.6;

/** Lays each page of the strip PDF out as a column on the sides of the sheet. */
export async function impose(
  stripPdf: Uint8Array,
  g: Geometry,
  { dividers = false }: { dividers?: boolean } = {},
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

  if (dividers) {
    pages.forEach((page, side) => {
      for (const x of dividerPositions(g, strips.length - side * g.columns)) {
        page.drawLine({
          start: { x: x * PT_PER_MM, y: g.marginMm * PT_PER_MM },
          end: { x: x * PT_PER_MM, y: (g.marginMm + g.columnHeight) * PT_PER_MM },
          thickness: DIVIDER_PT,
          color: grayscale(DIVIDER_GREY),
        });
      }
    });
  }

  const pdf = await output.save({ objectsPerTick: Infinity });
  return { pdf, strips: strips.length, sides };
}
