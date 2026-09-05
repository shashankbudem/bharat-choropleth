#!/usr/bin/env node
/**
 * Populates `examples/observatory/flutter/assets/` from the repository.
 *
 * The Flutter app loads through `rootBundle`, so its data has to sit inside the
 * app and be listed in its pubspec. It is generated data, so it is gitignored,
 * and a fresh clone has an empty directory the build still expects — the same
 * arrangement, and the same failure mode, as the package's own example.
 *
 *     pnpm prepare:observatory-flutter-assets
 *
 * Both district vintages are copied, plus the sub-districts: female literacy
 * drills the historical bundle, and the live-temperature indicator drills the
 * current one all the way to sub-district.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const assets = resolve(root, "examples/observatory/flutter/assets");

const COPIES = [
  { to: "india-observatory.json", from: "examples/observatory/data/india-observatory.json" },
  { to: "historical/states.topo.json", from: "data/generated/census-2011/states.topo.json" },
  { to: "current/states.topo.json", from: "data/generated/current-2019-states/states.topo.json" },
  { to: "historical-districts", from: "data/generated/census-2011/districts" },
  // The live indicator drills the current bundle all the way down.
  { to: "region-centroids.json", from: "examples/observatory/data/region-centroids.json" },
  { to: "current-districts", from: "data/generated/current-2019-districts/districts" },
  { to: "subdistricts", from: "data/generated/current-2019-subdistricts/subdistricts" },
];

const missing = COPIES.filter(({ from }) => !existsSync(resolve(root, from)));
if (missing.length > 0) {
  console.error(
    `prepare-observatory-flutter-assets: missing source data:\n${missing.map(({ from }) => `  ${from}`).join("\n")}\n\n` +
      "Run `pnpm build:observatory-data` first if the dataset is what is missing.",
  );
  process.exit(1);
}

mkdirSync(assets, { recursive: true });
for (const { to, from } of COPIES) {
  const destination = resolve(assets, to);
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(resolve(destination, ".."), { recursive: true });
  cpSync(resolve(root, from), destination, { recursive: true });
  console.log(`  ${to.padEnd(32)} <- ${from}`);
}
console.log(`\nObservatory Flutter assets ready: ${assets}`);
