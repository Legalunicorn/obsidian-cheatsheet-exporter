/** Colour checks. No Obsidian imports, so tests can run them. */

interface Rgba {
  r: number;
  g: number;
  b: number;
  /** As written, e.g. "0.5" or "20%", or undefined when opaque. */
  alpha: string | undefined;
}

/** Reads the computed colour forms browsers return: "rgb(…)", "rgba(…)" and "color(srgb …)". */
function parse(css: string): Rgba | null {
  const text = css.trim();
  let match = /^rgba?\(([^)]*)\)$/.exec(text);
  if (match) {
    const [r, g, b, alpha] = match[1].split(/[\s,/]+/).filter(Boolean);
    return { r: Number(r), g: Number(g), b: Number(b), alpha };
  }
  match = /^color\(srgb ([^)]*)\)$/.exec(text);
  if (match) {
    const [r, g, b, alpha] = match[1].split(/[\s/]+/).filter(Boolean);
    return { r: 255 * Number(r), g: 255 * Number(g), b: 255 * Number(b), alpha };
  }
  return null;
}

function opacity(alpha: string | undefined): number {
  if (alpha === undefined) return 1;
  return alpha.endsWith("%") ? parseFloat(alpha) / 100 : parseFloat(alpha);
}

/** Brightness from 0 to 255. */
function luminance({ r, g, b }: Rgba): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * True for a computed CSS colour such as "rgb(40, 42, 54)" that is dark.
 * Unreadable or mostly transparent colours count as light, so they never cause a warning.
 */
export function isDarkColor(css: string): boolean {
  const colour = parse(css);
  if (!colour || !(opacity(colour.alpha) >= 0.5)) return false;
  return luminance(colour) < 127.5;
}

/** Coloured text turns this much darker in greyscale, so light headings and links stay readable. */
const TEXT_DARKENING = 0.55;

/**
 * The grey with the same brightness as a computed CSS colour, keeping its transparency.
 * Text is darkened as well. Null when the colour can't be read, so it is left alone.
 */
export function toGrey(css: string, isText = false): string | null {
  const colour = parse(css);
  if (!colour || Number.isNaN(colour.r + colour.g + colour.b)) return null;
  const y = Math.round(luminance(colour) * (isText ? TEXT_DARKENING : 1));
  return colour.alpha === undefined ? `rgb(${y}, ${y}, ${y})` : `rgba(${y}, ${y}, ${y}, ${opacity(colour.alpha)})`;
}
