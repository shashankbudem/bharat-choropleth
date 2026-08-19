import { defineConfig } from "tsup";

export default defineConfig([
  {
    // Bundler / ESM consumers. No CSS side effects here — they import
    // `bharat-choropleth-js/style.css` so their build can extract it.
    entry: { index: "src/index.ts" },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    clean: true,
  },
  {
    // Script-tag consumers. Separate entry (src/iife.ts) because this build both
    // injects the stylesheet and assigns the globals itself — tsup's `globalName`
    // would expose the module namespace instead of the constructors.
    entry: { "bharat-choropleth": "src/iife.ts" },
    format: ["iife"],
    outExtension: () => ({ js: ".min.js" }),
    minify: true,
    sourcemap: true,
    clean: false,
    loader: { ".css": "text" },
  },
]);
