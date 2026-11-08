# Cheatsheet Exporter

An Obsidian plugin that exports a note as a dense A4 cheatsheet PDF, built to fit on one double-sided sheet.

Text flows down each column, then left to right, then onto the back of the sheet. Each column is rendered as one tall strip, so content only breaks between columns.

## Use

Run **Export current note as cheatsheet** from the command palette and choose the orientation, number of columns and printed font size. The dialog estimates how many sides that needs and suggests a font size that fits. **Auto recommend** fills in the layout allowing the largest font with nothing cut off, without exporting. The PDF is saved next to the note and opens in your default PDF app, and a notice says how many columns it used. If the note doesn't fit on one sheet, everything is still exported and the notice says how many sides it needs. The notice also warns about text under 6 pt, and about formulas or tables too wide for their column, which get cut off.

Printed font size is the real size on paper. More columns at the same font size means narrower columns, which wastes less space on short lines but wraps long lines more often.

Print at **actual size**, not "fit to page". Choose double-sided printing that flips on the short edge for landscape layouts and the long edge for portrait layouts.

Desktop only, because PDF export depends on Electron.

## Develop

```bash
npm install
```

```bash
npm test
```

```bash
npm run build
```

To try it, copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/cheatsheet-exporter/`, then enable the plugin under Community plugins.
