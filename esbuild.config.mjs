import { readFileSync } from "node:fs";
import { build } from "esbuild";

// Release assets are just main.js, so the bundled libraries' licences have to travel inside it.
const notices = readFileSync("THIRD_PARTY_NOTICES.txt", "utf8");

await build({
  entryPoints: ["src/main.ts"],
  outfile: "main.js",
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2022",
  external: ["obsidian", "electron"],
  banner: { js: `/*\n${notices}*/` },
  logLevel: "info",
});
