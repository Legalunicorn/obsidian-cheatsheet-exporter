import { Modal, Setting, type App } from "obsidian";
import { LAYOUTS, type LayoutId } from "./geometry.ts";

export interface ExportSettings {
  layout: LayoutId;
  printedFontPt: number;
  marginMm: number;
  compact: boolean;
}

export class ExportModal extends Modal {
  private readonly values: ExportSettings;
  private readonly onExport: (settings: ExportSettings) => void;

  constructor(app: App, initial: ExportSettings, onExport: (settings: ExportSettings) => void) {
    super(app);
    this.values = { ...initial };
    this.onExport = onExport;
  }

  onOpen() {
    this.setTitle("Export cheatsheet");

    new Setting(this.contentEl).setName("Layout").addDropdown((dropdown) => {
      for (const [id, layout] of Object.entries(LAYOUTS)) dropdown.addOption(id, layout.label);
      dropdown.setValue(this.values.layout);
      dropdown.onChange((id) => (this.values.layout = id as LayoutId));
    });

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

  private addNumber(name: string, key: "printedFontPt" | "marginMm", step: number) {
    new Setting(this.contentEl).setName(name).addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text.inputEl.step = String(step);
      text.setValue(String(this.values[key]));
      text.onChange((value) => {
        const parsed = Number(value);
        if (value !== "" && Number.isFinite(parsed) && parsed >= 0) this.values[key] = parsed;
      });
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
