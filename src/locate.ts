/** Finds where cut-off formulas and tables are in the note's text. No Obsidian imports, so tests can run it. */

/** A formula or table in the rendered note, in document order. */
export type Block = (
  | { kind: "formula"; latex: string }
  | { kind: "table"; header: string[] }
) & {
  cutOff: boolean;
  /** The note it's embedded from, or null when it's in this note. */
  embed: string | null;
};

export interface Heading {
  /** 0-based, as in Obsidian's metadata cache. */
  line: number;
  text: string;
}

export interface CutOff {
  /** The note it's embedded from, or null when it's in this note. */
  embed: string | null;
  /** 1-based, or null when it's embedded or couldn't be found in the note's text. */
  line: number | null;
  /** The closest heading above, or null when there is none. */
  heading: string | null;
  preview: string;
}

const PREVIEW_CHARS = 40;

/** A table's delimiter row, like `|---|:--:|`, possibly inside a callout or quote. */
const DELIMITER_ROW = /^(\s*>)*\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/**
 * Locates each cut-off block. Blocks are matched in order, each searched for after the
 * previous one, so a formula that appears twice is placed at the right copy.
 */
export function locateCutOffs(source: string, headings: Heading[], blocks: Block[]): CutOff[] {
  const text = new SourceText(source);
  const cutOffs: CutOff[] = [];
  let cursor = 0;
  for (const block of blocks) {
    // Embedded blocks aren't in this note's text, so the cursor stays where it is.
    const at =
      block.embed !== null
        ? null
        : block.kind === "formula"
          ? text.findFormula(block.latex, cursor)
          : text.findTable(cursor);
    if (at !== null) cursor = at + 1;
    if (!block.cutOff) continue;
    const line = at === null ? null : text.lineOf(at);
    cutOffs.push({
      embed: block.embed,
      line: line === null ? null : line + 1,
      heading: line === null ? null : headingAbove(headings, line),
      preview: preview(block),
    });
  }
  return cutOffs;
}

function headingAbove(headings: Heading[], line: number): string | null {
  let closest: string | null = null;
  for (const heading of headings) {
    if (heading.line > line) break;
    closest = heading.text;
  }
  return closest;
}

function preview(block: Block): string {
  const text =
    block.kind === "formula" ? block.latex.replace(/\s+/g, " ").trim() : `Table: ${block.header.join(", ")}`;
  return text.length > PREVIEW_CHARS ? `${text.slice(0, PREVIEW_CHARS - 1).trimEnd()}…` : text;
}

/** The note's text, searchable with whitespace ignored, since MathJax doesn't keep it exactly. */
class SourceText {
  private readonly lines: string[];
  private readonly lineStarts: number[] = [];
  /** The text without whitespace, and where each of its characters came from. */
  private readonly compact: string;
  private readonly origin: number[] = [];

  constructor(source: string) {
    this.lines = source.split("\n");
    let offset = 0;
    for (const line of this.lines) {
      this.lineStarts.push(offset);
      offset += line.length + 1;
    }
    let compact = "";
    let lineStart = true;
    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      if (char === "\n") lineStart = true;
      // A formula in a callout or quote has "> " before each of its lines.
      if (/\s/.test(char) || (lineStart && char === ">")) continue;
      lineStart = false;
      compact += char;
      this.origin.push(i);
    }
    this.compact = compact;
  }

  /** Where a formula starts, at or after `from`. Prefers a match between $ signs, so `x` doesn't match prose. */
  findFormula(latex: string, from: number): number | null {
    const needle = latex.replace(/\s+/g, "");
    if (!needle) return null;
    const start = this.compactIndex(from);
    const delimited = this.compact.indexOf(`$${needle}$`, start);
    if (delimited !== -1) return this.origin[delimited + 1];
    const bare = this.compact.indexOf(needle, start);
    return bare === -1 ? null : this.origin[bare];
  }

  /** Where the next table's header row starts, at or after `from`. */
  findTable(from: number): number | null {
    for (let line = this.lineOf(from); line + 1 < this.lines.length; line++) {
      if (this.lineStarts[line] < from) continue;
      if (this.lines[line].includes("|") && DELIMITER_ROW.test(this.lines[line + 1])) return this.lineStarts[line];
    }
    return null;
  }

  /** 0-based line of an offset. */
  lineOf(offset: number): number {
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (this.lineStarts[middle] <= offset) low = middle;
      else high = middle - 1;
    }
    return low;
  }

  /** The first compact character at or after an offset in the source. */
  private compactIndex(offset: number): number {
    let low = 0;
    let high = this.origin.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (this.origin[middle] < offset) low = middle + 1;
      else high = middle;
    }
    return low;
  }
}
