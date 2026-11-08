/** Layout maths. All lengths are millimetres. No Obsidian or PDF imports. */

export const A4 = { short: 210, long: 297 };

/** Width every strip is rendered at, before being scaled down onto the sheet. */
export const STRIP_WIDTH_MM = 210;

export const COLUMN_GAP_MM = 2;

export interface GeometryInput {
  columns: number;
  landscape: boolean;
  printedFontPt: number;
  marginMm: number;
  gapMm: number;
}

export interface Geometry {
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
  const sheetWidth = landscape ? A4.long : A4.short;
  const sheetHeight = landscape ? A4.short : A4.long;
  const columnWidth =
    (sheetWidth - 2 * input.marginMm - (columns - 1) * input.gapMm) / columns;
  const columnHeight = sheetHeight - 2 * input.marginMm;
  if (columnWidth <= 0 || columnHeight <= 0) {
    throw new Error("Margins are too large for this layout.");
  }
  const scale = columnWidth / STRIP_WIDTH_MM;
  return {
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

/** A cheatsheet is one sheet of paper, so two sides. */
export function capacity(g: Geometry): number {
  return 2 * g.columns;
}
