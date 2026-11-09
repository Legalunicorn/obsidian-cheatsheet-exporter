import {
  Modal,
  Setting,
  debounce,
  type App,
  type ButtonComponent,
  type DropdownComponent,
  type TextComponent,
} from "obsidian";
import { COLUMN_GAP_MM, capacity, computeGeometry } from "./geometry.ts";
import { MAX_COLUMNS, MIN_FONT_PT, largestFont, recommendLayout, type Measure } from "./recommend.ts";
import type { RenderedNote } from "./render.ts";

/** Measuring a long note takes a while, so wait for a pause in typing. */
const MEASURE_DELAY_MS = 300;

export interface ExportSettings {
  columns: number;
  landscape: boolean;
  printedFontPt: number;
  marginMm: number;
  compact: boolean;
}

export class ExportModal extends Modal {
  private readonly values: ExportSettings;
  private readonly pendingNote: Promise<RenderedNote>;
  private readonly onExport: (settings: ExportSettings) => void;
  private note: RenderedNote | undefined;
  private exported = false;

  private orientation!: DropdownComponent;
  private columns!: DropdownComponent;
  private font!: TextComponent;
  private preview!: HTMLElement;
  private fit!: Setting;
  private spinner!: HTMLElement;
  private readonly measureSoon = debounce(() => this.updateFit(), MEASURE_DELAY_MS, true);

  constructor(
    app: App,
    initial: ExportSettings,
    pendingNote: Promise<RenderedNote>,
    onExport: (settings: ExportSettings) => void,
  ) {
    super(app);
    this.values = { ...initial, columns: Math.min(initial.columns, MAX_COLUMNS) };
    this.pendingNote = pendingNote;
    this.onExport = onExport;
  }

  onOpen() {
    this.setTitle("Export cheatsheet");

    new Setting(this.contentEl).setName("Orientation").addDropdown((dropdown) => {
      this.orientation = dropdown;
      dropdown.addOption("landscape", "Landscape");
      dropdown.addOption("portrait", "Portrait");
      dropdown.setValue(this.values.landscape ? "landscape" : "portrait");
      dropdown.onChange((value) => {
        this.values.landscape = value === "landscape";
        this.refresh();
      });
    });

    new Setting(this.contentEl).setName("Columns per side").addDropdown((dropdown) => {
      this.columns = dropdown;
      for (let n = 1; n <= MAX_COLUMNS; n++) dropdown.addOption(String(n), String(n));
      dropdown.setValue(String(this.values.columns));
      dropdown.onChange((value) => {
        this.values.columns = Number(value);
        this.refresh();
      });
    });

    this.preview = this.contentEl.createDiv("cheatsheet-preview");

    this.font = this.addNumber("Printed font size (pt)", "printedFontPt", 0.5);
    this.addNumber("Outer margin (mm)", "marginMm", 1);

    new Setting(this.contentEl)
      .setName("Force compact spacing")
      .setDesc("Remove the margins and padding added by your theme.")
      .addToggle((toggle) => {
        toggle.setValue(this.values.compact);
        toggle.onChange((compact) => {
          this.values.compact = compact;
          this.refresh();
        });
      });

    this.fit = new Setting(this.contentEl)
      .setName("Fit")
      .setDesc("Measuring your note...")
      .addButton((button) => {
        button.setButtonText("Auto recommend").setDisabled(true);
        button.onClick(() => void this.applyRecommendation(button));
        void this.whenMeasurable(button);
      });
    this.spinner = this.fit.controlEl.createDiv({
      cls: "cheatsheet-spinner is-active",
      prepend: true,
    });

    new Setting(this.contentEl).addButton((button) =>
      button
        .setButtonText("Export")
        .setCta()
        .onClick(() => {
          this.exported = true;
          this.close();
          this.onExport(this.values);
        }),
    );

    this.refresh();
  }

  private async whenMeasurable(button: ButtonComponent) {
    try {
      this.note = await this.pendingNote;
    } catch (error) {
      this.fit.setDesc(`Could not measure this note: ${(error as Error).message}`);
      this.setMeasuring(false);
      return;
    }
    button.setDisabled(false);
    this.updateFit();
  }

  private addNumber(name: string, key: "printedFontPt" | "marginMm", step: number): TextComponent {
    let component!: TextComponent;
    new Setting(this.contentEl).setName(name).addText((text) => {
      component = text;
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text.inputEl.step = String(step);
      text.setValue(String(this.values[key]));
      text.onChange((value) => {
        const parsed = Number(value);
        if (value !== "" && Number.isFinite(parsed) && parsed >= 0) this.values[key] = parsed;
        this.refresh();
      });
    });
    return component;
  }

  private refresh() {
    this.drawPreview();
    if (!this.note) return;
    this.setMeasuring(true);
    this.measureSoon();
  }

  private drawPreview() {
    this.preview.toggleClass("is-landscape", this.values.landscape);
    this.preview.empty();
    for (let i = 0; i < this.values.columns; i++) this.preview.createDiv();
  }

  private updateFit() {
    if (this.note) this.fit.setDesc(this.describeFit(this.note));
    this.setMeasuring(false);
  }

  private setMeasuring(measuring: boolean) {
    this.spinner.toggleClass("is-active", measuring);
  }

  private describeFit(note: RenderedNote): string {
    const { columns, landscape, marginMm, printedFontPt, compact } = this.values;
    if (printedFontPt <= 0) return "Enter a font size to see the fit.";
    try {
      return note.probe(compact, (measure) => {
        const g = computeGeometry({ ...this.values, gapMm: COLUMN_GAP_MM });
        const { strips, overflowing } = measure(g);
        const sides = (strips / columns).toFixed(1);
        const cut = overflowing > 0 ? ` ${overflowing} formulas or tables get cut off.` : "";
        if (strips <= capacity(g)) return `Fits on one sheet: about ${sides} of 2 sides.${cut}`;
        return `About ${sides} sides, more than one sheet. ${this.suggestion(measure, { columns, landscape, marginMm })}${cut}`;
      });
    } catch (error) {
      return (error as Error).message;
    }
  }

  private suggestion(measure: Measure, layout: Parameters<typeof largestFont>[1]): string {
    const font = largestFont(measure, layout, { allowCutOff: true });
    return font === null
      ? `It won't fit with these columns, even at ${MIN_FONT_PT} pt.`
      : `${font} pt would fit with these columns.`;
  }

  /** Fills in the options only. Exporting stays the user's click. */
  private async applyRecommendation(button: ButtonComponent) {
    if (!this.note) return;
    const note = this.note;
    const { marginMm, compact } = this.values;
    this.measureSoon.cancel();
    button.setDisabled(true);
    this.setMeasuring(true);
    this.fit.setDesc("Working out the best layout...");
    // Let that message and the spinner appear before the measurements hold up the window.
    await new Promise((resolve) => window.setTimeout(resolve, 50));

    let best: ReturnType<typeof recommendLayout>;
    try {
      best = note.probe(compact, (measure) => recommendLayout(measure, marginMm));
    } catch (error) {
      this.fit.setDesc((error as Error).message);
      this.setMeasuring(false);
      return;
    } finally {
      button.setDisabled(false);
    }
    if (!best) {
      this.fit.setDesc(`No layout fits this note on one sheet at ${MIN_FONT_PT} pt or larger.`);
      this.setMeasuring(false);
      return;
    }
    this.values.columns = best.columns;
    this.values.landscape = best.landscape;
    this.values.printedFontPt = best.printedFontPt;
    this.orientation.setValue(best.landscape ? "landscape" : "portrait");
    this.columns.setValue(String(best.columns));
    this.font.setValue(String(best.printedFontPt));
    this.drawPreview();
    this.updateFit();
  }

  onClose() {
    this.measureSoon.cancel();
    this.contentEl.empty();
    if (!this.exported) void this.discardNote();
  }

  private async discardNote() {
    try {
      (await this.pendingNote).dispose();
    } catch {
      // Rendering failed, so there is nothing to clean up.
    }
  }
}
