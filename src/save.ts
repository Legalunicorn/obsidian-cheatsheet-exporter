import { FileSystemAdapter, normalizePath, type App, type TFile } from "obsidian";
import { electron, nodeRequire } from "./electron.ts";

/**
 * Asks where to save the cheatsheet, starting next to the note. Resolves to a full path,
 * or null if the user cancels.
 */
export async function chooseSavePath(app: App, file: TFile): Promise<string | null> {
  const { remote } = electron();
  const { canceled, filePath } = await remote.dialog.showSaveDialog(remote.getCurrentWindow(), {
    title: "Save cheatsheet",
    defaultPath: vaultAdapter(app).getFullPath(
      normalizePath(`${file.parent?.path ?? ""}/${file.basename} - cheatsheet.pdf`),
    ),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  return canceled || !filePath ? null : filePath;
}

/**
 * Writes the PDF to a full path. Inside the vault it goes through Obsidian, so the file
 * shows up straight away. Anywhere else it is written directly.
 */
export async function writePdf(app: App, fullPath: string, pdf: Uint8Array): Promise<void> {
  const inVault = vaultRelativePath(app, fullPath);
  if (inVault === null) {
    const fs = nodeRequire<typeof import("node:fs")>("fs");
    await fs.promises.writeFile(fullPath, pdf);
    return;
  }
  const data = toArrayBuffer(pdf);
  const existing = app.vault.getFileByPath(inVault);
  if (existing) await app.vault.modifyBinary(existing, data);
  else await app.vault.createBinary(inVault, data);
}

/** Resolves to an error message, or "" once the PDF is open. */
export function openInDefaultApp(fullPath: string): Promise<string> {
  return electron().remote.shell.openPath(fullPath);
}

function vaultAdapter(app: App): FileSystemAdapter {
  const { adapter } = app.vault;
  // The plugin is desktop only, where vaults are always folders on disk.
  if (!(adapter instanceof FileSystemAdapter)) throw new Error("This vault isn't a folder on disk.");
  return adapter;
}

/** The path inside the vault, or null when the file is outside it. */
function vaultRelativePath(app: App, fullPath: string): string | null {
  const vault = `${normalizePath(vaultAdapter(app).getBasePath())}/`;
  const target = normalizePath(fullPath);
  // Windows and macOS paths usually ignore case.
  if (!target.toLowerCase().startsWith(vault.toLowerCase())) return null;
  return target.slice(vault.length);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
