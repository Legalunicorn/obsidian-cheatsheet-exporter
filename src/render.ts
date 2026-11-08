import {
  Component,
  MarkdownRenderer,
  finishRenderMath,
  loadMathJax,
  type App,
  type TFile,
} from "obsidian";
import type { Geometry } from "./geometry.ts";

const MM_PER_INCH = 25.4;
const QUIET_MS = 400;
const SETTLE_TIMEOUT_MS = 15000;

const FONT_SIZE_VARIABLE = "--font-text-size";

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

/** Renders the note and prints it to a PDF with one strip per page. */
export async function renderStrips(
  app: App,
  file: TFile,
  g: Geometry,
  compact: boolean,
): Promise<Uint8Array> {
  const restoreBody = applyBodyOverrides(g.sourceFontPt);
  const root = document.body.createDiv("print cheatsheet-export");
  root.toggleClass("cheatsheet-compact", compact);
  root.style.setProperty("--cheatsheet-strip-width", `${g.stripWidth}mm`);
  root.style.setProperty("--cheatsheet-strip-height", `${g.stripHeight}mm`);
  const view = root.createDiv("markdown-preview-view markdown-rendered");

  const component = new Component();
  component.load();
  try {
    await loadMathJax();
    await MarkdownRenderer.render(app, await readBody(app, file), view, file.path, component);
    await waitUntilSettled(view);
    await finishRenderMath();

    return await electron().remote.getCurrentWebContents().printToPDF({
      pageSize: {
        width: g.stripWidth / MM_PER_INCH,
        height: g.stripHeight / MM_PER_INCH,
      },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      printBackground: true,
    });
  } finally {
    component.unload();
    root.remove();
    restoreBody();
  }
}

/**
 * Themes derive colours and table sizes on <body>, and some size headings in rem,
 * so the overrides have to go on the page itself for the length of the export.
 * Paper is white even in dark mode, as in Obsidian's own export.
 */
function applyBodyOverrides(fontPt: number): () => void {
  const { body, documentElement: html } = document;
  const wasDark = body.hasClass("theme-dark");
  const previousSize = body.style.getPropertyValue(FONT_SIZE_VARIABLE);
  const previousRootSize = html.style.fontSize;
  body.removeClass("theme-dark");
  body.addClass("theme-light");
  body.style.setProperty(FONT_SIZE_VARIABLE, `${fontPt}pt`);
  html.style.fontSize = `${fontPt}pt`;

  return () => {
    html.style.fontSize = previousRootSize;
    if (previousSize) body.style.setProperty(FONT_SIZE_VARIABLE, previousSize);
    else body.style.removeProperty(FONT_SIZE_VARIABLE);
    if (wasDark) {
      body.removeClass("theme-light");
      body.addClass("theme-dark");
    }
  };
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
