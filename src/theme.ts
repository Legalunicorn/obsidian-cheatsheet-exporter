import { isDarkColor, toGrey } from "./color.ts";

/**
 * Runs `fn` with the app behind the export unstyled, so changing the theme or font for a
 * measurement doesn't restyle every open pane. It all happens before the next paint.
 */
export function withAppHidden<T>(fn: () => T): T {
  const app = document.querySelector(".app-container");
  app?.addClass("cheatsheet-measuring");
  try {
    return fn();
  } finally {
    app?.removeClass("cheatsheet-measuring");
  }
}

/** Switches to the theme's light mode, as Obsidian's own export does. Returns an undo. */
export function forceLightTheme(): () => void {
  const { body } = document;
  const wasDark = body.hasClass("theme-dark");
  body.removeClass("theme-dark");
  body.addClass("theme-light");
  return () => {
    if (!wasDark) return;
    body.removeClass("theme-light");
    body.addClass("theme-dark");
  };
}

/** True when the theme stays dark in light mode, so the sheet prints on a dark page or with faint text. */
export function themeIsDarkOnly(): boolean {
  return withAppHidden(() => {
    const restoreTheme = forceLightTheme();
    try {
      return isDarkColor(getComputedStyle(document.body).backgroundColor);
    } finally {
      restoreTheme();
    }
  });
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

interface Change {
  el: HTMLElement | SVGElement;
  property: string;
  grey: string;
}

/**
 * Turns every colour in the export grey, and returns an undo. A CSS filter on the export
 * would be simpler, but Chromium then prints the whole page as a picture, so text comes
 * out blurry and can't be selected. Instead each colour is replaced by an inline style,
 * which beats any theme rule. Images do get the filter, in styles.css.
 */
export function greyOut(root: HTMLElement): () => void {
  // <body> too, for the page colour when the theme background is printed.
  const elements = [document.body, root, ...Array.from(root.querySelectorAll<HTMLElement | SVGElement>("*"))];

  // Read every colour before writing any, or each write restyles the page for the next read.
  const changes: Change[] = [];
  for (const el of elements) {
    const style = getComputedStyle(el);
    for (const property of COLOUR_PROPERTIES) {
      const grey = toGrey(style.getPropertyValue(property), TEXT_PROPERTIES.has(property));
      if (grey) changes.push({ el, property, grey });
    }
  }

  const undo = changes.map(({ el, property, grey }) => {
    const value = el.style.getPropertyValue(property);
    const priority = el.style.getPropertyPriority(property);
    el.style.setProperty(property, grey, "important");
    return () => el.style.setProperty(property, value, priority);
  });
  root.addClass("cheatsheet-greyscale");

  return () => {
    root.removeClass("cheatsheet-greyscale");
    for (const restore of undo) restore();
  };
}
