import { Modal, Setting, type App } from "obsidian";

export interface ExportSettings {
  columns: number;
  landscape: boolean;
  printedFontPt: number;
  marginMm: number;
  compact: boolean;
}

const MAX_PREVIEW_COLUMNS = 24;

export class ExportModal extends Modal {
  private readonly values: ExportSettings;
  private readonly onExport: (settings: ExportSettings) => void;
  private preview!: HTMLElement;

  constructor(app: App, initial: ExportSettings, onExport: (settings: ExportSettings) => void) {
    super(app);
    this.values = { ...initial };
    this.onExport = onExport;
  }

  onOpen() {
    this.setTitle("Export cheatsheet");

    new Setting(this.contentEl).setName("Orientation").addDropdown((dropdown) => {
      dropdown.addOption("landscape", "Landscape");
      dropdown.addOption("portrait", "Portrait");
      dropdown.setValue(this.values.landscape ? "landscape" : "portrait");
      dropdown.onChange((value) => {
        this.values.landscape = value === "landscape";
        this.updatePreview();
      });
    });

    this.addNumber("Columns per side", "columns", 1);
    this.preview = this.contentEl.createDiv("cheatsheet-preview");
    this.updatePreview();

    this.addNumber("Printed font size (pt)", "printedFontPt", 0.5);
    this.addNumber("Outer margin (mm)", "marginMm", 1);

    new Setting(this.contentEl)
      .setName("Force compact spacing")
      .setDesc("Remove the margins and padding added by your theme.")
      .addToggle((toggle) => {
        toggle.setValue(this.values.compact);
        toggle.onChange((compact) => (this.values.compact = compact));
      });

    new Setting(this.contentEl).addButton((button) =>
      button
        .setButtonText("Export")
        .setCta()
        .onClick(() => {
          this.close();
          this.onExport(this.values);
        }),
    );
  }

  private addNumber(name: string, key: "columns" | "printedFontPt" | "marginMm", step: number) {
    new Setting(this.contentEl).setName(name).addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text.inputEl.step = String(step);
      text.setValue(String(this.values[key]));
      text.onChange((value) => {
        const parsed = Number(value);
        if (value !== "" && Number.isFinite(parsed) && parsed >= 0) this.values[key] = parsed;
        this.updatePreview();
      });
    });
  }

  /** A small A4 sheet, cut into the chosen columns. */
  private updatePreview() {
    this.preview.toggleClass("is-landscape", this.values.landscape);
    this.preview.empty();
    const columns = Math.min(Math.floor(this.values.columns), MAX_PREVIEW_COLUMNS);
    for (let i = 0; i < columns; i++) this.preview.createDiv();
  }

  onClose() {
    this.contentEl.empty();
  }
}
