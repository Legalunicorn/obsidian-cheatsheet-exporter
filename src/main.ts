import { Notice, Plugin, TFile } from "obsidian";
import { COLUMN_GAP_MM, capacity, computeGeometry, type Geometry } from "./geometry.ts";
import { impose } from "./impose.ts";
import { ExportModal } from "./modal.ts";
import { SMALL_FONT_PT } from "./recommend.ts";
import { RenderedNote, discard } from "./render.ts";
import { chooseSavePath, openInDefaultApp, writePdf } from "./save.ts";
import { DEFAULT_SETTINGS, withDefaults, type ExportSettings } from "./settings.ts";

const NOTICE_MS = 8000;

export default class CheatsheetExporter extends Plugin {
  settings: ExportSettings = DEFAULT_SETTINGS;

  async onload() {
    this.settings = withDefaults((await this.loadData()) as Partial<ExportSettings> | null);

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

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        menu.addItem((item) =>
          item
            .setTitle("Export as cheatsheet...")
            .setIcon("file-down")
            .onClick(() => this.openDialog(file)),
        );
      }),
    );
  }

  /** Starts rendering straight away, so the dialog can measure the note while it opens. */
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
    let progress: Notice | undefined;
    try {
      const path = await chooseSavePath(this.app, file);
      if (path === null) return;
      progress = new Notice("Exporting cheatsheet...", 0);

      const geometry = computeGeometry({ ...settings, gapMm: COLUMN_GAP_MM });
      const printed = await (await pendingNote).print(geometry, settings);
      const sheet = await impose(printed.pdf, geometry);
      await writePdf(this.app, path, sheet.pdf);

      new Notice(describeExport(geometry, settings, sheet, printed.overflowing), NOTICE_MS);
      // Not awaited: a slow-starting viewer shouldn't hold up the export.
      void openInDefaultApp(path).then((error) => {
        if (error) new Notice(`Saved, but could not open the PDF: ${error}`, NOTICE_MS);
      });
    } catch (error) {
      console.error("Cheatsheet export failed", error);
      new Notice(`Cheatsheet export failed: ${(error as Error).message}`, NOTICE_MS);
    } finally {
      progress?.hide();
      void discard(pendingNote);
    }
  }
}

/** The notice after a successful export: how full the sheet is, and anything worth checking. */
function describeExport(
  g: Geometry,
  settings: ExportSettings,
  sheet: { strips: number; sides: number },
  overflowing: number,
): string {
  const limit = capacity(g);
  const extraSides = sheet.strips > limit ? `, so it needs ${sheet.sides} sides` : "";
  const lines = [`Cheatsheet saved: uses ${sheet.strips} of ${limit} columns${extraSides}.`];
  if (settings.printedFontPt < SMALL_FONT_PT) {
    lines.push(`Text prints at ${settings.printedFontPt} pt, which may be hard to read.`);
  }
  if (overflowing > 0) {
    lines.push(`${overflowing} formulas or tables are wider than their column and get cut off.`);
  }
  return lines.join(" ");
}
