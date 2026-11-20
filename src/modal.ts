import {
  Modal,
  Setting,
  debounce,
  type App,
  type ButtonComponent,
  type DropdownComponent,
  type TextComponent,
} from "obsidian";
import { COLUMN_GAP_MM, PAPER_SIZES, capacity, computeGeometry, type Paper, type Sides } from "./geometry.ts";
import {
  MAX_COLUMNS,
  MIN_FONT_PT,
  SMALL_FONT_PT,
  largestFont,
  recommendLayout,
  type Layout,
  type Measure,
} from "./recommend.ts";
import type { CutOff } from "./locate.ts";
import { discard, type RenderedNote } from "./render.ts";
import type { ExportSettings } from "./settings.ts";
import { themeIsDarkOnly } from "./theme.ts";

/** Measuring a long note takes a while, so wait for a pause in typing. */
const MEASURE_DELAY_MS = 300;

type ToggleKey = "compact" | "printBackground" | "greyscale";
type NumberKey = "printedFontPt" | "marginMm";

interface Fit {
  summary: string;
  warnings: string[];
  /** Listed under the cut-off warning, which comes last. */
  cutOffs?: CutOff[];
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
  /** Whether "Show where" is open, kept while the fit is measured again. */
  private showingCutOffs = false;
  private exportButton!: ButtonComponent;
  /** Number fields whose text isn't a usable value. The last usable value stays in `values`. */
  private readonly invalid = new Set<NumberKey>();
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

    new Setting(this.contentEl).setName("Paper").addDropdown((dropdown) => {
      dropdown.addOption("a4", "A4");
      dropdown.addOption("letter", "US Letter");
      dropdown.setValue(this.values.paper);
      dropdown.onChange((value) => {
        this.values.paper = value as Paper;
        this.refresh();
      });
    });

    new Setting(this.contentEl).setName("Sides").addDropdown((dropdown) => {
      dropdown.addOption("2", "Double-sided");
      dropdown.addOption("1", "Single-sided");
      dropdown.setValue(String(this.values.sides));
      dropdown.onChange((value) => {
        this.values.sides = Number(value) as Sides;
        this.refresh();
      });
    });

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

    this.font = this.addNumber("Printed font size (pt)", "printedFontPt", 0.5, (pt) => pt > 0);
    this.fontWarning = this.contentEl.createDiv("cheatsheet-warning");
    this.addNumber("Outer margin (mm)", "marginMm", 1, (mm) => mm >= 0);

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
    this.addToggle(advanced, "compact", "Force compact spacing", {
      description: "Remove the margins and padding added by your theme.",
      recommendation: "Recommended: on.",
    });
    this.addToggle(advanced, "printBackground", "Print theme background", {
      description: "Keep your theme's page colour instead of white paper. Uses more ink.",
      recommendation: "Recommended: off.",
    });
    this.addToggle(advanced, "greyscale", "Greyscale", {
      description: "Print every colour as a shade of grey. Coloured text is darkened to stay readable.",
      recommendation: "Recommended: off.",
    });

    if (themeIsDarkOnly()) {
      this.contentEl.createDiv({
        cls: "cheatsheet-warning",
        text:
          "Your theme has no light mode, so the cheatsheet may print on a dark page or with faint text. " +
          "Switch to a theme with a light mode before exporting.",
      });
    }

    new Setting(this.contentEl).addButton((button) => {
      this.exportButton = button;
      button
        .setButtonText("Export")
        .setCta()
        .onClick(() => {
          if (this.problem()) return;
          this.exported = true;
          this.close();
          this.onExport(this.values);
        });
    });

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

  private addNumber(
    name: string,
    key: NumberKey,
    step: number,
    isValid: (value: number) => boolean,
  ): TextComponent {
    let component!: TextComponent;
    new Setting(this.contentEl).setName(name).addText((text) => {
      component = text;
      text.inputEl.type = "number";
      text.inputEl.min = "0";
      text.inputEl.step = String(step);
      text.setValue(String(this.values[key]));
      text.onChange((value) => {
        const parsed = Number(value);
        const valid = value.trim() !== "" && Number.isFinite(parsed) && isValid(parsed);
        if (valid) this.values[key] = parsed;
        this.invalid[valid ? "delete" : "add"](key);
        this.refresh();
      });
    });
    return component;
  }

  private addToggle(
    parent: HTMLElement,
    key: ToggleKey,
    name: string,
    { description, recommendation }: { description: string; recommendation: string },
  ) {
    const desc = createFragment((fragment) => {
      fragment.appendText(description);
      fragment.createEl("br");
      fragment.createEl("strong", { text: recommendation });
    });
    new Setting(parent)
      .setName(name)
      .setDesc(desc)
      .addToggle((toggle) => {
        toggle.setValue(this.values[key]);
        toggle.onChange((value) => {
          this.values[key] = value;
          // Only spacing changes how much fits.
          if (key === "compact") this.refresh();
        });
      });
  }

  private refresh() {
    this.showInstantFeedback();
    if (!this.note) return;
    this.setMeasuring(true);
    this.measureSoon();
  }

  /** Why the current options can't be exported, or "" when they can. */
  private problem(): string {
    if (this.invalid.has("printedFontPt")) return "Enter a font size above 0 pt.";
    if (this.invalid.has("marginMm")) return "Enter a margin of 0 mm or more.";
    try {
      computeGeometry({ ...this.values, gapMm: COLUMN_GAP_MM });
      return "";
    } catch (error) {
      return (error as Error).message;
    }
  }

  /** Everything that doesn't need the note measured. */
  private showInstantFeedback() {
    // The reason shows as the fit straight away, without waiting for a measurement.
    const problem = this.problem();
    this.exportButton.setDisabled(problem !== "");
    if (problem) this.showFit({ summary: problem, warnings: [] });

    const paper = PAPER_SIZES[this.values.paper];
    this.preview.toggleClass("is-landscape", this.values.landscape);
    this.preview.setCssProps({
      "--cheatsheet-sheet-ratio": this.values.landscape
        ? `${paper.long} / ${paper.short}`
        : `${paper.short} / ${paper.long}`,
    });
    this.preview.empty();
    for (let i = 0; i < this.values.columns; i++) this.preview.createDiv();

    const { printedFontPt } = this.values;
    const tooSmall = !this.invalid.has("printedFontPt") && printedFontPt < SMALL_FONT_PT;
    this.fontWarning.setText(tooSmall ? `Text under ${SMALL_FONT_PT} pt can be hard to read on paper.` : "");
  }

  private updateFit() {
    if (this.note) this.showFit(this.describeFit(this.note));
    this.setMeasuring(false);
  }

  private showFit({ summary, warnings, cutOffs = [] }: Fit) {
    this.fit.setDesc(summary);
    this.fitWarnings.empty();
    if (warnings.length === 0) return;
    const list = this.fitWarnings.createEl("ul");
    let item: HTMLElement | undefined;
    for (const warning of warnings) item = list.createEl("li", { text: warning });
    if (item && cutOffs.length > 0) this.showCutOffs(item, cutOffs);
  }

  /** A collapsed list of where each cut-off formula or table is, by line and closest heading. */
  private showCutOffs(parent: HTMLElement, cutOffs: CutOff[]) {
    const details = parent.createEl("details", { cls: "cheatsheet-cutoffs" });
    details.open = this.showingCutOffs;
    details.addEventListener("toggle", () => (this.showingCutOffs = details.open));
    details.createEl("summary", { text: "Show where" });
    const list = details.createEl("ul");
    for (const { embed, line, heading, preview } of cutOffs) {
      const item = list.createEl("li");
      const place = embed !== null ? `In embedded note "${embed}"` : line === null ? "Line not found" : `Line ${line}`;
      const where = [place, heading].filter(Boolean).join(" · ");
      item.createSpan({ text: `${where}: ` });
      item.createEl("code", { text: preview });
    }
  }

  private setMeasuring(measuring: boolean) {
    this.spinner.toggleClass("is-active", measuring);
  }

  private describeFit(note: RenderedNote): Fit {
    const { paper, sides, columns, landscape, marginMm, compact } = this.values;
    const problem = this.problem();
    if (problem) return { summary: problem, warnings: [] };
    try {
      return note.probe(compact, (measure) => {
        const g = computeGeometry({ ...this.values, gapMm: COLUMN_GAP_MM });
        const { strips, overflowing } = measure(g);
        const cutOffs = overflowing > 0 ? note.cutOffs() : [];
        const used = (strips / columns).toFixed(1);
        const fits = strips <= capacity(g);
        const layout = { paper, sides, columns, landscape, marginMm };
        const warnings = [
          formulaErrorWarning(note.formulaErrors()),
          fits ? "" : `More than ${oneSheet(sides)}. ${this.suggestion(measure, layout)}`,
          cutOffWarning(overflowing),
        ].filter(Boolean);
        return {
          summary: fits ? `Fits on ${oneSheet(sides)}: about ${used} of ${sidesText(sides)}.` : `About ${used} sides.`,
          warnings,
          cutOffs,
        };
      });
    } catch (error) {
      return { summary: (error as Error).message, warnings: [] };
    }
  }

  private suggestion(measure: Measure, layout: Layout): string {
    const font = largestFont(measure, layout, { allowCutOff: true });
    return font === null
      ? `It won't fit with these columns, even at ${MIN_FONT_PT} pt.`
      : `${font} pt would fit with these columns.`;
  }

  /** Fills in the options only. Exporting stays the user's click. */
  private async applyRecommendation(button: ButtonComponent) {
    if (!this.note) return;
    const note = this.note;
    const { paper, sides, marginMm, compact } = this.values;
    this.measureSoon.cancel();
    button.setDisabled(true);
    this.setMeasuring(true);
    this.showFit({ summary: "Working out the best layout...", warnings: [] });
    // Let that message and the spinner appear before the measurements hold up the window.
    await new Promise((resolve) => window.setTimeout(resolve, 50));

    let best: ReturnType<typeof recommendLayout>;
    try {
      best = note.probe(compact, (measure) => recommendLayout(measure, { paper, sides, marginMm }));
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
        warnings: [`No layout fits this note on ${oneSheet(sides)} at ${MIN_FONT_PT} pt or larger.`],
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
    this.invalid.delete("printedFontPt");
    this.showInstantFeedback();
    this.updateFit();
  }

  onClose() {
    this.measureSoon.cancel();
    this.contentEl.empty();
    if (!this.exported) void discard(this.pendingNote);
  }
}

/** What one cheatsheet is: a single side, or both sides of a sheet. */
function oneSheet(sides: Sides): string {
  return sides === 1 ? "one side" : "one sheet";
}

function sidesText(sides: Sides): string {
  return sides === 1 ? "1 side" : `${sides} sides`;
}

/** Empty when every formula rendered. */
function formulaErrorWarning(errors: number): string {
  if (errors === 0) return "";
  const what = errors === 1 ? "1 formula has a LaTeX error and prints" : `${errors} formulas have LaTeX errors and print`;
  return (
    `${what} as red text, which can stop the note fitting. Check in Reading view. ` +
    "A $$ that isn't on its own line is a common cause."
  );
}

/** Empty when nothing runs past its column. */
function cutOffWarning(overflowing: number): string {
  if (overflowing === 0) return "";
  const what = overflowing === 1 ? "1 formula or table gets" : `${overflowing} formulas or tables get`;
  return `${what} cut off. Try fewer columns or a smaller font.`;
}
