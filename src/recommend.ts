import { COLUMN_GAP_MM, capacity, computeGeometry, type Geometry } from "./geometry.ts";

export const MAX_COLUMNS = 8;
export const MIN_FONT_PT = 5;
const MAX_FONT_PT = 14;
const FONT_STEP_PT = 0.5;

export interface Measurement {
  strips: number;
  overflowing: number;
}

export type Measure = (g: Geometry) => Measurement;

export interface Layout {
  columns: number;
  landscape: boolean;
  marginMm: number;
}

type Fit = "fits" | "too-long" | "cut-off";

function checkFit(measure: Measure, layout: Layout, printedFontPt: number): Fit {
  const g = computeGeometry({ ...layout, printedFontPt, gapMm: COLUMN_GAP_MM });
  const { strips, overflowing } = measure(g);
  if (strips > capacity(g)) return "too-long";
  return overflowing > 0 ? "cut-off" : "fits";
}

/** The largest font, no smaller than `atLeast`, that fits one sheet. */
export function largestFont(
  measure: Measure,
  layout: Layout,
  { atLeast = MIN_FONT_PT, allowCutOff = false }: { atLeast?: number; allowCutOff?: boolean } = {},
): number | null {
  const fits = (pt: number) => {
    const fit = checkFit(measure, layout, pt);
    return fit === "fits" || (allowCutOff && fit === "cut-off");
  };
  if (!fits(atLeast)) return null;
  const size = (step: number) => atLeast + step * FONT_STEP_PT;
  let fitting = 0;
  let tooBig = Math.floor((MAX_FONT_PT - atLeast) / FONT_STEP_PT) + 1;
  while (tooBig - fitting > 1) {
    const middle = Math.floor((fitting + tooBig) / 2);
    if (fits(size(middle))) fitting = middle;
    else tooBig = middle;
  }
  return size(fitting);
}

/** The layout allowing the largest font with nothing cut off. On a tie, fewer columns win. */
export function recommendLayout(
  measure: Measure,
  marginMm: number,
): (Layout & { printedFontPt: number }) | null {
  let best: (Layout & { printedFontPt: number }) | null = null;
  for (const landscape of [true, false]) {
    for (let columns = 1; columns <= MAX_COLUMNS; columns++) {
      const layout = { columns, landscape, marginMm };
      const floor: number = best ? best.printedFontPt + FONT_STEP_PT : MIN_FONT_PT;
      if (floor > MAX_FONT_PT) break;
      const fit = checkFit(measure, layout, floor);
      if (fit === "cut-off") break; // Narrower columns only cut off more.
      if (fit === "too-long") continue;
      best = { ...layout, printedFontPt: largestFont(measure, layout, { atLeast: floor }) ?? floor };
    }
  }
  return best;
}
