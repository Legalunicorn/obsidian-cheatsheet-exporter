/** Layout maths. All lengths are millimetres. No Obsidian or PDF imports. */

export type Paper = "a4" | "letter";
export type Sides = 1 | 2;

export const PAPER_SIZES: Record<Paper, { short: number; long: number }> = {
  a4: { short: 210, long: 297 },
  letter: { short: 215.9, long: 279.4 },
};

/** Width every strip is rendered at, before being scaled down onto the sheet. */
export const STRIP_WIDTH_MM = 210;

export const COLUMN_GAP_MM = 2;

export interface GeometryInput {
  paper: Paper;
  sides: Sides;
  columns: number;
  landscape: boolean;
  printedFontPt: number;
  marginMm: number;
  gapMm: number;
}

export interface Geometry {
  sides: Sides;
  sheetWidth: number;
  sheetHeight: number;
  columns: number;
  columnWidth: number;
  columnHeight: number;
  marginMm: number;
  gapMm: number;
  stripWidth: number;
  stripHeight: number;
  /** Size of the strip's content relative to its size on paper. */
  scale: number;
  sourceFontPt: number;
}

export function computeGeometry(input: GeometryInput): Geometry {
  const { columns, landscape } = input;
  if (!Number.isInteger(columns) || columns < 1) {
    throw new Error("Columns must be a whole number of at least 1.");
  }
  const paper = PAPER_SIZES[input.paper];
  const sheetWidth = landscape ? paper.long : paper.short;
  const sheetHeight = landscape ? paper.short : paper.long;
  const columnWidth =
    (sheetWidth - 2 * input.marginMm - (columns - 1) * input.gapMm) / columns;
  const columnHeight = sheetHeight - 2 * input.marginMm;
  if (columnWidth <= 0 || columnHeight <= 0) {
    throw new Error("Margins are too large for this layout.");
  }
  const scale = columnWidth / STRIP_WIDTH_MM;
  return {
    sides: input.sides,
    sheetWidth,
    sheetHeight,
    columns,
    columnWidth,
    columnHeight,
    marginMm: input.marginMm,
    gapMm: input.gapMm,
    stripWidth: STRIP_WIDTH_MM,
    stripHeight: columnHeight / scale,
    scale,
    sourceFontPt: input.printedFontPt / scale,
  };
}

/** Where strip `index` goes. `side` is the output PDF page; x/y are from the bottom-left. */
export function columnSlot(g: Geometry, index: number) {
  const column = index % g.columns;
  return {
    side: Math.floor(index / g.columns),
    x: g.marginMm + column * (g.columnWidth + g.gapMm),
    y: g.marginMm,
  };
}

/** Where lines between columns go on a side holding `strips` strips: the middle of each gap between filled columns. */
export function dividerPositions(g: Geometry, strips: number): number[] {
  const gaps = Math.max(0, Math.min(strips, g.columns) - 1);
  return Array.from({ length: gaps }, (_, i) => g.marginMm + (i + 1) * g.columnWidth + i * g.gapMm + g.gapMm / 2);
}

/** How many strips fit on one sheet of paper, printed on one side or both. */
export function capacity(g: Geometry): number {
  return g.sides * g.columns;
}
