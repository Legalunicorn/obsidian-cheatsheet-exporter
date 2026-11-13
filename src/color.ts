/** Colour checks. No Obsidian imports, so tests can run them. */

/**
 * True for a computed CSS colour such as "rgb(40, 42, 54)" that is dark.
 * Unreadable or mostly transparent colours count as light, so they never cause a warning.
 */
export function isDarkColor(css: string): boolean {
  const match = /^rgba?\(([^)]*)\)$/.exec(css.trim());
  if (!match) return false;
  const [r, g, b, a] = match[1].split(/[\s,/]+/).filter(Boolean);
  const alpha = a === undefined ? 1 : a.endsWith("%") ? parseFloat(a) / 100 : parseFloat(a);
  if (!(alpha >= 0.5)) return false;
  const luminance = (0.2126 * Number(r) + 0.7152 * Number(g) + 0.0722 * Number(b)) / 255;
  return luminance < 0.5;
}
