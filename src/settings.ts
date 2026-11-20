/** Export settings, remembered between exports. No Obsidian imports, so tests can run them. */

import { COLUMN_GAP_MM, computeGeometry, type Paper, type Sides } from "./geometry.ts";

export interface ExportSettings {
  paper: Paper;
  sides: Sides;
  columns: number;
  landscape: boolean;
  printedFontPt: number;
  marginMm: number;
  compact: boolean;
  printBackground: boolean;
  greyscale: boolean;
  dividers: boolean;
}

export const DEFAULT_SETTINGS: ExportSettings = {
  paper: "a4",
  sides: 2,
  columns: 4,
  landscape: true,
  printedFontPt: 6,
  marginMm: 5,
  compact: true,
  printBackground: false,
  greyscale: false,
  dividers: false,
};

/** Fills in defaults for anything the saved settings lack. */
export function withDefaults(saved: Partial<ExportSettings> | null): ExportSettings {
  const settings = { ...saved };
  // Before 0.1.4 every save stored compact: false, the old default, so those take the new one.
  if (saved && !("printBackground" in saved)) delete settings.compact;
  return { ...DEFAULT_SETTINGS, ...settings };
}

/**
 * Why these settings can't be exported, or "" when they can. `invalid` lists the number
 * fields whose text isn't a usable number. The values are checked too, since settings saved
 * by 0.1.7 could hold a font size of 0.
 */
export function exportProblem(
  settings: ExportSettings,
  invalid: ReadonlySet<"printedFontPt" | "marginMm"> = new Set(),
): string {
  if (invalid.has("printedFontPt") || !(settings.printedFontPt > 0)) return "Enter a font size above 0 pt.";
  if (invalid.has("marginMm") || !(settings.marginMm >= 0)) return "Enter a margin of 0 mm or more.";
  try {
    computeGeometry({ ...settings, gapMm: COLUMN_GAP_MM });
    return "";
  } catch (error) {
    return (error as Error).message;
  }
}
