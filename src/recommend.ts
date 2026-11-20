import { COLUMN_GAP_MM, capacity, computeGeometry, type Geometry, type Paper, type Sides } from "./geometry.ts";

export const MAX_COLUMNS = 8;
export const MIN_FONT_PT = 5;
/** Below this, printed text gets hard to read. */
export const SMALL_FONT_PT = 6;
const MAX_FONT_PT = 14;
const FONT_STEP_PT = 0.5;

export interface Measurement {
  strips: number;
  overflowing: number;
}

export type Measure = (g: Geometry) => Measurement;

/** What the user fixes before choosing a layout: the paper, how many sides, and the margin. */
export interface Sheet {
  paper: Paper;
  sides: Sides;
  marginMm: number;
}

export interface Layout extends Sheet {
  columns: number;
  landscape: boolean;
}

type Fit = "fits" | "too-long" | "cut-off";

function checkFit(measure: Measure, layout: Layout, printedFontPt: number): Fit {
  const g = computeGeometry({ ...layout, printedFontPt, gapMm: COLUMN_GAP_MM });
  const { strips, overflowing } = measure(g);
  if (strips > capacity(g)) return "too-long";
  return overflowing > 0 ? "cut-off" : "fits";
}

/** The largest font, from `atLeast` to `atMost`, that fits one sheet. */
export function largestFont(
  measure: Measure,
  layout: Layout,
  {
    atLeast = MIN_FONT_PT,
    atMost = MAX_FONT_PT,
    allowCutOff = false,
  }: { atLeast?: number; atMost?: number; allowCutOff?: boolean } = {},
): number | null {
  const fits = (pt: number) => {
    const fit = checkFit(measure, layout, pt);
    return fit === "fits" || (allowCutOff && fit === "cut-off");
  };
  if (atMost < atLeast || !fits(atLeast)) return null;
  const size = (step: number) => atLeast + step * FONT_STEP_PT;
  let fitting = 0;
  let tooBig = Math.floor((atMost - atLeast) / FONT_STEP_PT) + 1;
  while (tooBig - fitting > 1) {
    const middle = Math.floor((fitting + tooBig) / 2);
    if (fits(size(middle))) fitting = middle;
    else tooBig = middle;
  }
  return size(fitting);
}

/** Auto recommend never goes above this, so a short note doesn't get huge text. */
export const RECOMMENDED_MAX_FONT_PT = 10;
/** Shortest comfortable line, about 40 characters. */
const MIN_LINE_EM = 20;
const MM_PER_PT = 25.4 / 72;
const IDEAL_COLUMNS = { landscape: 4, portrait: 3 };

/** The largest font Auto recommend allows for a layout: lines no shorter than MIN_LINE_EM. */
export function fontLimit(layout: Layout): number {
  const g = computeGeometry({ ...layout, printedFontPt: MIN_FONT_PT, gapMm: COLUMN_GAP_MM });
  const forLineLength = g.columnWidth / (MIN_LINE_EM * MM_PER_PT);
  const limit = Math.min(RECOMMENDED_MAX_FONT_PT, Math.floor(forLineLength / FONT_STEP_PT) * FONT_STEP_PT);
  return Math.max(MIN_FONT_PT, limit);
}

const distanceFromIdeal = ({ columns, landscape }: Layout) =>
  Math.abs(columns - (landscape ? IDEAL_COLUMNS.landscape : IDEAL_COLUMNS.portrait));

/**
 * The layout allowing the largest font with nothing cut off, within each layout's fontLimit.
 * On a tie, the column count closest to IDEAL_COLUMNS wins.
 */
export function recommendLayout(
  measure: Measure,
  sheet: Sheet,
): (Layout & { printedFontPt: number }) | null {
  let best: (Layout & { printedFontPt: number }) | null = null;
  for (const landscape of [true, false]) {
    for (let columns = 1; columns <= MAX_COLUMNS; columns++) {
      const layout = { ...sheet, columns, landscape };
      const limit = fontLimit(layout);
      const floor: number = best ? best.printedFontPt : MIN_FONT_PT;
      if (floor > limit) break; // More columns only lower the limit.
      const fit = checkFit(measure, layout, floor);
      if (fit === "cut-off") break; // Narrower columns only cut off more.
      if (fit === "too-long") continue;
      const font: number = largestFont(measure, layout, { atLeast: floor, atMost: limit }) ?? floor;
      const better =
        !best ||
        font > best.printedFontPt ||
        distanceFromIdeal(layout) < distanceFromIdeal(best);
      if (better) best = { ...layout, printedFontPt: font };
    }
  }
  return best;
}
