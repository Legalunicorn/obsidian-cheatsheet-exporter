/** Export settings, remembered between exports. No Obsidian imports, so tests can run them. */

import type { Paper, Sides } from "./geometry.ts";

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
