import { FileSystemAdapter, Notice, Plugin, type TFile } from "obsidian";
import { COLUMN_GAP_MM, capacity, computeGeometry } from "./geometry.ts";
import { impose } from "./impose.ts";
import { ExportModal, type ExportSettings } from "./modal.ts";
import { RenderedNote, electron } from "./render.ts";

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
        if (!checking) this.openDialog(file);
        return true;
      },
    });
  }

  private openDialog(file: TFile) {
    const note = RenderedNote.render(this.app, file);
    new ExportModal(this.app, this.settings, note, (settings) => {
      this.settings = settings;
      void this.saveData(settings);
      void this.exportCheatsheet(note, file, settings);
    }).open();
  }

  private async exportCheatsheet(
    pendingNote: Promise<RenderedNote>,
    file: TFile,
    settings: ExportSettings,
  ): Promise<void> {
    const progress = new Notice("Exporting cheatsheet...", 0);
    let note: RenderedNote | undefined;
    try {
      const geometry = computeGeometry({ ...settings, gapMm: COLUMN_GAP_MM });
      note = await pendingNote;
      const rendered = await note.print(geometry, settings.compact);
      const { pdf, strips: used, sides } = await impose(rendered.pdf, geometry);

      const path = `${file.parent?.path === "/" ? "" : `${file.parent?.path}/`}${file.basename} - cheatsheet.pdf`;
      await this.app.vault.adapter.writeBinary(path, toArrayBuffer(pdf));

      const limit = capacity(geometry);
      const fit = used > limit ? `, so it needs ${sides} sides` : "";
      const small =
        settings.printedFontPt < SMALL_FONT_PT
          ? ` Text prints at ${settings.printedFontPt} pt, which may be hard to read.`
          : "";
      const cut =
        rendered.overflowing > 0
          ? ` ${rendered.overflowing} formulas or tables are wider than their column and get cut off.`
          : "";
      new Notice(`Cheatsheet saved: uses ${used} of ${limit} columns${fit}.${small}${cut}`, 8000);
      // Not awaited: a slow-starting viewer shouldn't hold up the export.
      void this.openInDefaultApp(path);
    } catch (error) {
      console.error("Cheatsheet export failed", error);
      new Notice(`Cheatsheet export failed: ${(error as Error).message}`, 8000);
    } finally {
      progress.hide();
      note?.dispose();
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
