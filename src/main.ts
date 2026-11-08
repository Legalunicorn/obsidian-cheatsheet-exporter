import { FileSystemAdapter, Notice, Plugin, type TFile } from "obsidian";
import { capacity, computeGeometry } from "./geometry.ts";
import { impose } from "./impose.ts";
import { ExportModal, type ExportSettings } from "./modal.ts";
import { electron, renderStrips } from "./render.ts";

const COLUMN_GAP_MM = 2;
const SMALL_FONT_PT = 6;

const DEFAULT_SETTINGS: ExportSettings = {
  columns: 4,
  landscape: true,
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
      const rendered = await renderStrips(this.app, file, geometry, settings.compact);
      const { pdf, strips: used, sides } = await impose(rendered.pdf, geometry);

      const path = `${file.parent?.path === "/" ? "" : `${file.parent?.path}/`}${file.basename} - cheatsheet.pdf`;
      await this.app.vault.adapter.writeBinary(path, toArrayBuffer(pdf));

      const limit = capacity(geometry);
      const fit = used > limit ? `, so it needs ${sides} sides` : "";
      const small =
        settings.printedFontPt < SMALL_FONT_PT
          ? ` Text prints at ${settings.printedFontPt} pt, which may be hard to read.`
          : "";
      const shrunk =
        rendered.shrunk > 0
          ? ` ${rendered.shrunk} wide formulas or tables were shrunk to fit their column.`
          : "";
      new Notice(`Cheatsheet saved: uses ${used} of ${limit} columns${fit}.${small}${shrunk}`, 8000);
      // Not awaited: a slow-starting viewer shouldn't hold up the export.
      void this.openInDefaultApp(path);
      return path;
    } catch (error) {
      console.error("Cheatsheet export failed", error);
      new Notice(`Cheatsheet export failed: ${(error as Error).message}`, 8000);
      return undefined;
    } finally {
      progress.hide();
    }
  }

  private async openInDefaultApp(path: string): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) return;
    const error = await electron().remote.shell.openPath(adapter.getFullPath(path));
    if (error) new Notice(`Saved, but could not open the PDF: ${error}`, 8000);
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
