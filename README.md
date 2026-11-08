# Cheatsheet Exporter

An Obsidian plugin that exports a note as a dense A4 cheatsheet PDF, built to fit on one double-sided sheet.

Text flows down each column, then left to right, then onto the back of the sheet. Each column is rendered as one tall strip, so content only breaks between columns.

| Layout | Sheet | Columns per side |
| --- | --- | --- |
| 8 per side | A4 landscape | 4 |
| 9 per side | A4 portrait | 3 |
| 16 per side | A4 portrait | 4 |

## Use

Run **Export current note as cheatsheet** from the command palette, choose a layout and printed font size, then export. The PDF is saved next to the note and opens in your default PDF app, and a notice says how many columns it used. If the note doesn't fit on one sheet, everything is still exported and the notice says how many sides it needs.

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
