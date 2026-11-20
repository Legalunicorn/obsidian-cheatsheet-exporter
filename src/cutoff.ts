/**
 * Describes cut-off formulas and tables by the closest heading above them in the rendered
 * note. No Obsidian imports, so tests can run it.
 *
 * There are deliberately no line numbers: Obsidian hides them by default, and finding them
 * meant re-parsing the note's Markdown, which can never match Obsidian's rendering exactly.
 * Headings come from what Obsidian rendered, so they're right by construction.
 */

/** A heading or cut-off block in the rendered note, in document order. */
export type Item = (
  | { kind: "heading"; text: string }
  | { kind: "formula"; latex: string }
  | { kind: "table"; header: string[] }
) & {
  /** The note it's embedded from, or null when it's in this note. */
  embed: string | null;
  /** Which part of the page it's in: 0 for this note, or one number per embed on the page. */
  scope: number;
};

export interface CutOff {
  /** The note it's embedded from, or null when it's in this note. */
  embed: string | null;
  /** The closest heading above it in the same note, or null when there is none. */
  heading: string | null;
  preview: string;
}

const PREVIEW_CHARS = 40;

export function describeCutOffs(items: Item[]): CutOff[] {
  // Headings are tracked per scope, so an embed's headings label neither what follows the
  // embed nor another copy of the same note.
  const headings = new Map<number, string>();
  const cutOffs: CutOff[] = [];
  for (const item of items) {
    if (item.kind === "heading") {
      headings.set(item.scope, item.text);
      continue;
    }
    cutOffs.push({ embed: item.embed, heading: headings.get(item.scope) ?? null, preview: preview(item) });
  }
  return cutOffs;
}

function preview(item: Item): string {
  const text =
    item.kind === "formula"
      ? item.latex.replace(/\s+/g, " ").trim()
      : item.kind === "table"
        ? `Table: ${item.header.join(", ")}`
        : item.text;
  return text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS - 1).trimEnd()}…` : text;
}
