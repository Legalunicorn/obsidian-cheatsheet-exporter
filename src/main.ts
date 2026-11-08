import { Notice, Plugin, type TFile } from "obsidian";
import { capacity, computeGeometry } from "./geometry.ts";
import { impose } from "./impose.ts";
import { ExportModal, type ExportSettings } from "./modal.ts";
import { renderStrips } from "./render.ts";

const COLUMN_GAP_MM = 2;

const DEFAULT_SETTINGS: ExportSettings = {
  layout: "8",
  printedFontPt: 6,
  marginMm: 5,
  compact: false,
};

export default class CheatsheetExporter extends Plugin {
  settings: ExportSettings = DEFAULT_SETTINGS;

  async onload() {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
    this.addCommand({
      id: "export-cheatsheet",
      name: "Export current note as cheatsheet",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (file?.extension !== "md") return false;
        if (!checking) {
          new ExportModal(this.app, this.settings, (settings) => {
            this.settings = settings;
            void this.saveData(settings);
            void this.exportCheatsheet(file, settings);
          }).open();
        }
        return true;
      },
    });
  }

  async exportCheatsheet(file: TFile, settings: ExportSettings): Promise<string | undefined> {
    const progress = new Notice("Exporting cheatsheet...", 0);
    try {
      const geometry = computeGeometry({ ...settings, gapMm: COLUMN_GAP_MM });
      const strips = await renderStrips(this.app, file, geometry, settings.compact);
      const { pdf, strips: used, sides } = await impose(strips, geometry);

      const path = `${file.parent?.path === "/" ? "" : `${file.parent?.path}/`}${file.basename} - cheatsheet.pdf`;
      await this.app.vault.adapter.writeBinary(path, toArrayBuffer(pdf));

      const limit = capacity(geometry);
      new Notice(
        used > limit
          ? `Cheatsheet saved: uses ${used} of ${limit} columns, so it needs ${sides} sides.`
          : `Cheatsheet saved: uses ${used} of ${limit} columns.`,
        8000,
      );
      return path;
    } catch (error) {
      console.error("Cheatsheet export failed", error);
      new Notice(`Cheatsheet export failed: ${(error as Error).message}`, 8000);
      return undefined;
    } finally {
      progress.hide();
    }
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
