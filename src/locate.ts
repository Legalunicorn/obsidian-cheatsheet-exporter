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

/** The ">" markers of callouts and quotes, each with up to one space after it. */
const QUOTE_PREFIX = /^(?: {0,3}> ?)*/;
const DELIMITER_CELL = /^\s*:?-+:?\s*$/;

/**
 * What comes before a line's content in callouts, quotes and lists: indentation, ">" and
 * list markers like "-", "*", "+", "1." or "1)". A marker needs a space after it, so
 * "*emphasis*" isn't one.
 */
const LINE_PREFIX = /^(?:\s*(?:>|[-*+](?=\s)|\d{1,9}[.)](?=\s)))*\s*/;
const FENCE = /^(`{3,}|~{3,})/;

/**
 * Locates each cut-off block. Blocks are matched in order, each searched for after the
 * previous one, so a formula that appears twice is placed at the right copy. Only text
 * Obsidian renders is searched: frontmatter, code and comments are skipped.
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

/**
 * Whether two lines open a table: a header row and a delimiter row like `|---|:-:|`, with
 * the same number of pipe-separated cells. A row without a pipe, like a Setext heading's
 * "---", isn't a table row.
 */
function startsTable(header: string, delimiter: string): boolean {
  const headerCells = cells(header);
  const delimiterCells = cells(delimiter);
  if (!headerCells || !delimiterCells) return false;
  return headerCells.length === delimiterCells.length && delimiterCells.every((cell) => DELIMITER_CELL.test(cell));
}

/** A table row's cells, or null when the line has no pipe. Escaped pipes don't split cells. */
function cells(row: string): string[] | null {
  const content = row.replace(QUOTE_PREFIX, "").trim();
  if (!content.includes("|")) return null;
  return content
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
    .split(/(?<!\\)\|/);
}

/** Leading indentation in columns, with tabs stopping every 4. */
function indentWidth(line: string): number {
  let width = 0;
  for (const char of line) {
    if (char === " ") width++;
    else if (char === "\t") width += 4 - (width % 4);
    else break;
  }
  return width;
}

/** Whether a line is a list item or indented under one, so indented lines after it continue the list. */
function inList(line: string): boolean {
  return indentWidth(line) > 0 || /^([-*+]|\d{1,9}[.)])\s/.test(line);
}

/**
 * Where inline code or a comment starting at `i` ends, or `i` when none starts there.
 * Inline code needs a closing run of as many backticks in the same paragraph, so a stray
 * backtick hides only itself.
 */
function spanEnd(source: string, i: number): number {
  for (const [open, close] of [
    ["%%", "%%"],
    ["<!--", "-->"],
  ]) {
    if (!source.startsWith(open, i)) continue;
    const end = source.indexOf(close, i + open.length);
    return end === -1 ? source.length : end + close.length;
  }
  if (source[i] !== "`") return i;
  let run = i;
  while (source[run] === "`") run++;
  const blankLine = /\n[ \t>]*\n/g;
  blankLine.lastIndex = run;
  const paragraphEnd = blankLine.exec(source)?.index ?? source.length;
  for (let j = run; j < paragraphEnd; ) {
    const tick = source.indexOf("`", j);
    if (tick === -1 || tick >= paragraphEnd) break;
    let after = tick;
    while (source[after] === "`") after++;
    if (after - tick === run - i) return after;
    j = after;
  }
  return run;
}

/** The note's text, searchable with whitespace ignored, since MathJax doesn't keep it exactly. */
class SourceText {
  private readonly lines: string[];
  private readonly lineStarts: number[] = [];
  /** The text without whitespace, and where each of its characters came from. */
  private readonly compact: string;
  private readonly origin: number[] = [];

  /** 1 for each character Obsidian doesn't render as maths or tables. */
  private readonly hidden: Uint8Array;

  constructor(source: string) {
    this.lines = source.split("\n");
    let offset = 0;
    for (const line of this.lines) {
      this.lineStarts.push(offset);
      offset += line.length + 1;
    }
    this.hidden = this.unrendered(source, this.frontmatterEnd());
    let compact = "";
    let lineStart = true;
    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      if (char === "\n") lineStart = true;
      if (this.hidden[i]) continue;
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
      if (this.lineStarts[line] < from || this.hidden[this.lineStarts[line]]) continue;
      if (startsTable(this.lines[line], this.lines[line + 1])) return this.lineStarts[line];
    }
    return null;
  }

  /**
   * Where the frontmatter ends: after the "---" closing a block that opens on the first line.
   * Obsidian hides this block even when its YAML is invalid and it reports no frontmatter.
   */
  private frontmatterEnd(): number {
    if (this.lines[0]?.trimEnd() !== "---") return 0;
    for (let i = 1; i < this.lines.length; i++) {
      if (this.lines[i].trimEnd() === "---") return this.lineStarts[i] + this.lines[i].length;
    }
    return 0;
  }

  /** Frontmatter, fenced code blocks, inline code, and %% and HTML comments. */
  private unrendered(source: string, bodyStart: number): Uint8Array {
    const hidden = new Uint8Array(source.length);
    hidden.fill(1, 0, bodyStart);

    // Code blocks, which may sit in callouts and lists. Unclosed ones run to the end, as in Obsidian.
    let fence: string | null = null;
    this.lines.forEach((line, i) => {
      const start = this.lineStarts[i];
      if (start < bodyStart) return;
      const content = line.replace(LINE_PREFIX, "");
      const marker = FENCE.exec(content)?.[1];
      if (fence === null && !marker) return;
      hidden.fill(1, start, start + line.length + 1);
      if (fence === null) fence = marker ?? null;
      else if (marker?.[0] === fence[0] && marker.length >= fence.length && !content.slice(marker.length).trim()) {
        fence = null;
      }
    });

    // Indented code blocks: 4 spaces or a tab after a blank line. In a list the same
    // indentation continues the list item instead, so those are left alone.
    // Inside a callout or quote, indentation counts from after the ">".
    let inBlock = false;
    let afterBlank = true;
    let previous = "";
    this.lines.forEach((line, i) => {
      const start = this.lineStarts[i];
      if (start < bodyStart) return;
      const content = line.replace(QUOTE_PREFIX, "");
      if (!content.trim()) {
        afterBlank = true;
        return;
      }
      const isCode = !hidden[start] && indentWidth(content) >= 4 && (inBlock || (afterBlank && !inList(previous)));
      if (isCode) hidden.fill(1, start, start + line.length + 1);
      else previous = content;
      inBlock = isCode;
      afterBlank = false;
    });

    // Inline code and comments, outside code blocks.
    for (let i = bodyStart; i < source.length; ) {
      const end = hidden[i] ? i : spanEnd(source, i);
      hidden.fill(1, i, end);
      i = Math.max(end, i + 1);
    }
    return hidden;
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
