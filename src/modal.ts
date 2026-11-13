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
import {
  MAX_COLUMNS,
  MIN_FONT_PT,
  SMALL_FONT_PT,
  largestFont,
  recommendLayout,
  type Measure,
} from "./recommend.ts";
import { themeIsDarkOnly, type RenderedNote } from "./render.ts";

/** Measuring a long note takes a while, so wait for a pause in typing. */
const MEASURE_DELAY_MS = 300;

export interface ExportSettings {
  columns: number;
  landscape: boolean;
  printedFontPt: number;
  marginMm: number;
  compact: boolean;
  printBackground: boolean;
  greyscale: boolean;
}

/** A setting description followed by a bold recommendation on its own line. */
function recommended(description: string, recommendation: string): DocumentFragment {
  return createFragment((fragment) => {
    fragment.appendText(description);
    fragment.createEl("br");
    fragment.createEl("strong", { text: recommendation });
  });
}

interface Fit {
  summary: string;
  warnings: string[];
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
  private fontWarning!: HTMLElement;
  private fit!: Setting;
  private fitWarnings!: HTMLElement;
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
    this.fontWarning = this.contentEl.createDiv("cheatsheet-warning");
    this.addNumber("Outer margin (mm)", "marginMm", 1);

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
    this.fitWarnings = this.contentEl.createDiv("cheatsheet-warning");

    const advanced = this.contentEl.createEl("details", { cls: "cheatsheet-advanced" });
    advanced.createEl("summary", { text: "Advanced options" });

    new Setting(advanced)
      .setName("Force compact spacing")
      .setDesc(recommended("Remove the margins and padding added by your theme.", "Recommended: on."))
      .addToggle((toggle) => {
        toggle.setValue(this.values.compact);
        toggle.onChange((compact) => {
          this.values.compact = compact;
          this.refresh();
        });
      });

    new Setting(advanced)
      .setName("Print theme background")
      .setDesc(
        recommended("Keep your theme's page colour instead of white paper. Uses more ink.", "Recommended: off."),
      )
      .addToggle((toggle) => {
        toggle.setValue(this.values.printBackground);
        toggle.onChange((printBackground) => {
          this.values.printBackground = printBackground;
        });
      });

    new Setting(advanced)
      .setName("Greyscale")
      .setDesc(
        recommended(
          "Print every colour as a shade of grey. Coloured text is darkened to stay readable.",
          "Recommended: off.",
        ),
      )
      .addToggle((toggle) => {
        toggle.setValue(this.values.greyscale);
        toggle.onChange((greyscale) => {
          this.values.greyscale = greyscale;
        });
      });
    if (themeIsDarkOnly()) {
      this.contentEl.createDiv({
        cls: "cheatsheet-warning",
        text:
          "Your theme has no light mode, so the cheatsheet may print on a dark page or with faint text. " +
          "Switch to a theme with a light mode before exporting.",
      });
    }

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
      this.showFit({ summary: `Could not measure this note: ${(error as Error).message}`, warnings: [] });
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
    this.showInstantFeedback();
    if (!this.note) return;
    this.setMeasuring(true);
    this.measureSoon();
  }

  /** Everything that doesn't need the note measured. */
  private showInstantFeedback() {
    this.preview.toggleClass("is-landscape", this.values.landscape);
    this.preview.empty();
    for (let i = 0; i < this.values.columns; i++) this.preview.createDiv();

    const { printedFontPt } = this.values;
    const tooSmall = printedFontPt > 0 && printedFontPt < SMALL_FONT_PT;
    this.fontWarning.setText(tooSmall ? `Text under ${SMALL_FONT_PT} pt can be hard to read on paper.` : "");
  }

  private updateFit() {
    if (this.note) this.showFit(this.describeFit(this.note));
    this.setMeasuring(false);
  }

  private showFit({ summary, warnings }: Fit) {
    this.fit.setDesc(summary);
    this.fitWarnings.empty();
    if (warnings.length === 0) return;
    const list = this.fitWarnings.createEl("ul");
    for (const warning of warnings) list.createEl("li", { text: warning });
  }

  private setMeasuring(measuring: boolean) {
    this.spinner.toggleClass("is-active", measuring);
  }

  private describeFit(note: RenderedNote): Fit {
    const { columns, landscape, marginMm, printedFontPt, compact } = this.values;
    if (printedFontPt <= 0) return { summary: "Enter a font size to see the fit.", warnings: [] };
    try {
      return note.probe(compact, (measure) => {
        const g = computeGeometry({ ...this.values, gapMm: COLUMN_GAP_MM });
        const { strips, overflowing } = measure(g);
        const sides = (strips / columns).toFixed(1);
        const fits = strips <= capacity(g);
        const warnings: string[] = [];
        const errors = note.formulaErrors();
        if (errors > 0) {
          const what =
            errors === 1 ? "1 formula has a LaTeX error and prints" : `${errors} formulas have LaTeX errors and print`;
          warnings.push(
            `${what} as red text, which can stop the note fitting. Check in Reading view. ` +
              "A $$ that isn't on its own line is a common cause.",
          );
        }
        if (!fits) {
          warnings.push(`More than one sheet. ${this.suggestion(measure, { columns, landscape, marginMm })}`);
        }
        if (overflowing > 0) {
          const what = overflowing === 1 ? "1 formula or table gets" : `${overflowing} formulas or tables get`;
          warnings.push(`${what} cut off. Try fewer columns or a smaller font.`);
        }
        return {
          summary: fits ? `Fits on one sheet: about ${sides} of 2 sides.` : `About ${sides} sides.`,
          warnings,
        };
      });
    } catch (error) {
      return { summary: (error as Error).message, warnings: [] };
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
    this.showFit({ summary: "Working out the best layout...", warnings: [] });
    // Let that message and the spinner appear before the measurements hold up the window.
    await new Promise((resolve) => window.setTimeout(resolve, 50));

    let best: ReturnType<typeof recommendLayout>;
    try {
      best = note.probe(compact, (measure) => recommendLayout(measure, marginMm));
    } catch (error) {
      this.showFit({ summary: (error as Error).message, warnings: [] });
      this.setMeasuring(false);
      return;
    } finally {
      button.setDisabled(false);
    }
    if (!best) {
      this.showFit({
        summary: "Auto recommend found no layout.",
        warnings: [`No layout fits this note on one sheet at ${MIN_FONT_PT} pt or larger.`],
      });
      this.setMeasuring(false);
      return;
    }
    this.values.columns = best.columns;
    this.values.landscape = best.landscape;
    this.values.printedFontPt = best.printedFontPt;
    this.orientation.setValue(best.landscape ? "landscape" : "portrait");
    this.columns.setValue(String(best.columns));
    this.font.setValue(String(best.printedFontPt));
    this.showInstantFeedback();
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
