# Cheatsheet Exporter

Export an Obsidian note as a dense, double-sided A4 cheatsheet PDF. Your theme, LaTeX, images and tables are kept, and nothing else needs to be installed.

Text flows down each column, then left to right, then onto the back of the sheet. You choose the orientation, the number of columns and the printed font size.

## How to use

1. Open a note, then run **Export current note as cheatsheet** from the command palette. You can also choose **Export as cheatsheet...** from the note's three-dot menu, or by right-clicking it in the file list.
2. Pick the orientation and columns per side. The dialog shows the sheet cut into columns and estimates how many sides your note needs.
3. Adjust the font size until it fits, or press **Auto recommend** to fill in the layout that allows the largest font with nothing cut off. Auto recommend only sets the options. It doesn't export.
4. Press **Export**. The PDF is saved next to your note as `<note name> - cheatsheet.pdf` and opens in your default PDF app.

## Printing

Print at **actual size**, not "fit to page", or the font size won't match what you chose. For double-sided printing, flip on the short edge for landscape and on the long edge for portrait.

## What it won't do for you

The plugin warns you but never changes your content to make it fit:

- A note too long for one sheet still exports in full, and the notice says how many sides it needs.
- Text under 6 pt gets a readability warning.
- Formulas or tables wider than their column get cut off on paper, and the dialog and notice say how many. Use fewer columns or a smaller font.

Force compact spacing removes the margins and padding your theme adds, which often saves a lot of space.

## Compatibility and privacy

Desktop only, because PDF export uses Electron. It has been tested on Windows.

The plugin makes no network requests and has no accounts, ads or telemetry. It reads the note you export and writes the PDF into your vault. It doesn't read or write files outside your vault.

## Install manually

Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/Legalunicorn/obsidian-cheatsheet-exporter/releases/latest) into `<vault>/.obsidian/plugins/cheatsheet-exporter/`, then enable the plugin under **Settings → Community plugins**.

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

## License

[MIT](LICENSE). The bundled libraries, including [pdf-lib](https://github.com/cantoo-scribe/pdf-lib), are listed with their licences in [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt).
