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

/** Obsidian resolves the derived sizes on <body>, so each one has to be set here too. */
const FONT_SIZE_VARIABLES = [
  "--font-text-size",
  "--font-preferred-size",
  "--table-text-size",
  "--table-header-size",
];

interface ElectronApi {
  remote: {
    getCurrentWebContents(): {
      printToPDF(options: object): Promise<Uint8Array>;
    };
  };
}

/** Renders the note and prints it to a PDF with one strip per page. */
export async function renderStrips(
  app: App,
  file: TFile,
  g: Geometry,
  compact: boolean,
): Promise<Uint8Array> {
  // Paper is white even in dark mode, as in Obsidian's own export. Colours resolve on <body>,
  // so the class has to change there for the length of the export.
  const wasDark = document.body.hasClass("theme-dark");
  document.body.removeClass("theme-dark");
  document.body.addClass("theme-light");

  const root = document.body.createDiv("print cheatsheet-export");
  root.toggleClass("cheatsheet-compact", compact);
  root.style.setProperty("--cheatsheet-strip-width", `${g.stripWidth}mm`);
  root.style.setProperty("--cheatsheet-strip-height", `${g.stripHeight}mm`);
  for (const variable of FONT_SIZE_VARIABLES) {
    root.style.setProperty(variable, `${g.sourceFontPt}pt`);
  }
  const view = root.createDiv("markdown-preview-view markdown-rendered");

  const component = new Component();
  component.load();
  try {
    await loadMathJax();
    await MarkdownRenderer.render(app, await readBody(app, file), view, file.path, component);
    await waitUntilSettled(view);
    await finishRenderMath();

    const electron = (window as unknown as { require(m: "electron"): ElectronApi }).require("electron");
    return await electron.remote.getCurrentWebContents().printToPDF({
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
    if (wasDark) {
      document.body.removeClass("theme-light");
      document.body.addClass("theme-dark");
    }
  }
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
