/** The parts of Electron the plugin uses. Obsidian desktop exposes them through `window.require`. */

interface SaveDialogOptions {
  title: string;
  defaultPath: string;
  filters: { name: string; extensions: string[] }[];
}

interface ElectronApi {
  remote: {
    getCurrentWebContents(): {
      printToPDF(options: object): Promise<Uint8Array>;
    };
    getCurrentWindow(): object;
    dialog: {
      showSaveDialog(window: object, options: SaveDialogOptions): Promise<{ canceled: boolean; filePath?: string }>;
    };
    shell: {
      /** Resolves to an error message, or "" on success. */
      openPath(path: string): Promise<string>;
    };
  };
}

export function electron(): ElectronApi {
  return nodeRequire<ElectronApi>("electron");
}

/** Loads a module Obsidian desktop provides, which the bundle leaves out. */
export function nodeRequire<T>(module: string): T {
  return (window as unknown as { require(module: string): T }).require(module);
}
