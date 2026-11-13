import {
  Component,
  MarkdownRenderer,
  finishRenderMath,
  loadMathJax,
  type App,
  type TFile,
} from "obsidian";
import { isDarkColor, toGrey } from "./color.ts";
import { STRIP_WIDTH_MM, type Geometry } from "./geometry.ts";
import type { Measure } from "./recommend.ts";

const MM_PER_INCH = 25.4;
const PX_PER_MM = 96 / MM_PER_INCH;
const QUIET_MS = 400;
const SETTLE_TIMEOUT_MS = 15000;
const FONT_SIZE_VARIABLE = "--font-text-size";

/** Blocks that can't split leave a gap at the bottom of a strip, so flow needs a bit more room. */
const PAGINATION_WASTE = 1.05;

interface ElectronApi {
  remote: {
    getCurrentWebContents(): {
      printToPDF(options: object): Promise<Uint8Array>;
    };
    shell: {
      /** Resolves to an error message, or "" on success. */
      openPath(path: string): Promise<string>;
    };
  };
}

export function electron(): ElectronApi {
  return (window as unknown as { require(m: "electron"): ElectronApi }).require("electron");
}

export interface PrintOptions {
  compact: boolean;
  printBackground: boolean;
  greyscale: boolean;
}

/** A note laid out off-screen, ready to be measured or printed at any settings. */
export class RenderedNote {
  private readonly root: HTMLElement;
  private readonly view: HTMLElement;
  private readonly component: Component;

  private constructor(root: HTMLElement, view: HTMLElement, component: Component) {
    this.root = root;
    this.view = view;
    this.component = component;
  }

  static async render(app: App, file: TFile): Promise<RenderedNote> {
    const root = document.body.createDiv("print cheatsheet-export");
    root.setCssProps({ "--cheatsheet-strip-width": `${STRIP_WIDTH_MM}mm` });
    const view = root.createDiv("markdown-preview-view markdown-rendered");
    const component = new Component();
    component.load();
    const note = new RenderedNote(root, view, component);
    try {
      await loadMathJax();
      await MarkdownRenderer.render(app, await readBody(app, file), view, file.path, component);
      await waitUntilSettled(view);
      await finishRenderMath();
      return note;
    } catch (error) {
      note.dispose();
      throw error;
    }
  }

  /**
   * Gives `fn` a way to measure the note at any geometry. It all runs before the next
   * paint, so the temporary font size is never visible in the app.
   */
  probe<T>(compact: boolean, fn: (measure: Measure) => T): T {
    this.root.toggleClass("cheatsheet-compact", compact);
    const font = overrideFontSize();
    // The app behind would otherwise be restyled for every measurement.
    const app = document.querySelector(".app-container");
    app?.addClass("cheatsheet-measuring");
    try {
      return fn((g) => {
        this.setStripHeight(g);
        font.set(g.sourceFontPt);
        const height = this.view.getBoundingClientRect().height * PAGINATION_WASTE;
        return {
          strips: height / (g.stripHeight * PX_PER_MM),
          overflowing: countOverflowing(this.view),
        };
      });
    } finally {
      app?.removeClass("cheatsheet-measuring");
      font.restore();
    }
  }

  /**
   * Prints the note to a PDF with one strip per page. Without `printBackground` the paper
   * stays white, as in Obsidian's own export, while highlights, code and callouts keep
   * their colours because Obsidian marks the note `print-color-adjust: exact`.
   */
  async print(g: Geometry, options: PrintOptions): Promise<{ pdf: Uint8Array; overflowing: number }> {
    const { compact, printBackground, greyscale } = options;
    this.root.toggleClass("cheatsheet-compact", compact);
    this.root.toggleClass("cheatsheet-greyscale", greyscale);
    this.setStripHeight(g);
    const font = overrideFontSize();
    const restoreTheme = forceLightTheme();
    font.set(g.sourceFontPt);
    // After the theme switch, so the light theme's colours are the ones turned grey.
    const restoreColours = greyscale ? greyOut(this.root) : () => {};
    try {
      const overflowing = countOverflowing(this.view);
      const pdf = await electron().remote.getCurrentWebContents().printToPDF({
        pageSize: {
          width: g.stripWidth / MM_PER_INCH,
          height: g.stripHeight / MM_PER_INCH,
        },
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        printBackground,
      });
      return { pdf, overflowing };
    } finally {
      restoreColours();
      restoreTheme();
      font.restore();
    }
  }

  /** Formulas MathJax couldn't read. They show their source as red text, often too wide to fit. */
  formulaErrors(): number {
    return this.view.querySelectorAll("mjx-merror").length;
  }

  dispose(): void {
    this.component.unload();
    this.root.remove();
  }

  private setStripHeight(g: Geometry): void {
    this.root.setCssProps({ "--cheatsheet-strip-height": `${g.stripHeight}mm` });
  }
}

/** Themes derive sizes on <body> and some use rem, so both have to follow the export font. */
function overrideFontSize() {
  const { body, documentElement: html } = document;
  const previousVariable = body.style.getPropertyValue(FONT_SIZE_VARIABLE);
  const previousRoot = html.style.fontSize;
  return {
    set(pt: number): void {
      body.setCssProps({ [FONT_SIZE_VARIABLE]: `${pt}pt` });
      html.setCssStyles({ fontSize: `${pt}pt` });
    },
    restore(): void {
      html.setCssStyles({ fontSize: previousRoot });
      body.setCssProps({ [FONT_SIZE_VARIABLE]: previousVariable });
    },
  };
}

/**
 * True when the theme stays dark in light mode, so the sheet prints on a dark page or
 * with faint text. Runs before the next paint, so the theme switch is never visible.
 */
export function themeIsDarkOnly(): boolean {
  const app = document.querySelector(".app-container");
  app?.addClass("cheatsheet-measuring");
  const restoreTheme = forceLightTheme();
  try {
    return isDarkColor(getComputedStyle(document.body).backgroundColor);
  } finally {
    restoreTheme();
    app?.removeClass("cheatsheet-measuring");
  }
}

/** Prints in the theme's light mode, as in Obsidian's own export. Colours resolve on <body>. */
function forceLightTheme(): () => void {
  const { body } = document;
  const wasDark = body.hasClass("theme-dark");
  body.removeClass("theme-dark");
  body.addClass("theme-light");
  return () => {
    if (wasDark) {
      body.removeClass("theme-light");
      body.addClass("theme-dark");
    }
  };
}

const COLOUR_PROPERTIES = [
  "color",
  "background-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
  "fill",
  "stroke",
];
const TEXT_PROPERTIES = new Set(["color", "text-decoration-color"]);

/**
 * Turns every colour in the note grey with inline styles, and returns an undo. A CSS filter
 * on the note would be simpler, but Chromium then prints the whole page as a picture, so
 * text comes out blurry and can't be selected. Images get the filter, in styles.css.
 */
function greyOut(root: HTMLElement): () => void {
  const elements = [document.body, root, ...Array.from(root.querySelectorAll<HTMLElement | SVGElement>("*"))];
  const changes: { el: HTMLElement | SVGElement; property: string; grey: string }[] = [];
  // Read everything before writing anything, or each write restyles the page for the next read.
  for (const el of elements) {
    const style = getComputedStyle(el);
    for (const property of COLOUR_PROPERTIES) {
      const grey = toGrey(style.getPropertyValue(property), TEXT_PROPERTIES.has(property));
      if (grey) changes.push({ el, property, grey });
    }
  }
  const previous = changes.map(({ el, property, grey }) => {
    const before = { value: el.style.getPropertyValue(property), priority: el.style.getPropertyPriority(property) };
    el.style.setProperty(property, grey, "important");
    return before;
  });
  return () => {
    changes.forEach(({ el, property }, i) => {
      const { value, priority } = previous[i];
      if (value) el.style.setProperty(property, value, priority);
      else el.style.removeProperty(property);
    });
  };
}

/** Counts formulas and tables running past the column edge, which get cut off on paper. */
function countOverflowing(view: HTMLElement): number {
  const edge = view.getBoundingClientRect().right;
  return Array.from(view.querySelectorAll("table, mjx-math")).filter(
    (el) => el.getBoundingClientRect().right > edge + 0.5,
  ).length;
}

async function readBody(app: App, file: TFile): Promise<string> {
  const text = await app.vault.cachedRead(file);
  const end = app.metadataCache.getFileCache(file)?.frontmatterPosition?.end.offset;
  return end === undefined ? text : text.slice(end);
}

/** Math, embeds and diagrams finish after render() resolves: wait for the DOM to go quiet. */
async function waitUntilSettled(el: HTMLElement): Promise<void> {
  await new Promise<void>((resolve) => {
    const deadline = window.setTimeout(done, SETTLE_TIMEOUT_MS);
    let quiet = window.setTimeout(done, QUIET_MS);
    const observer = new MutationObserver(() => {
      window.clearTimeout(quiet);
      quiet = window.setTimeout(done, QUIET_MS);
    });
    observer.observe(el, { childList: true, subtree: true, attributes: true });
    function done() {
      window.clearTimeout(deadline);
      window.clearTimeout(quiet);
      observer.disconnect();
      resolve();
    }
  });
  await Promise.all(Array.from(el.querySelectorAll("img"), imageSettled));
}

/** Not img.decode(): that never resolves while the window is hidden. */
function imageSettled(img: HTMLImageElement): Promise<void> {
  if (img.complete) return Promise.resolve();
  return new Promise((resolve) => {
    img.addEventListener("load", () => resolve(), { once: true });
    img.addEventListener("error", () => resolve(), { once: true });
  });
}
