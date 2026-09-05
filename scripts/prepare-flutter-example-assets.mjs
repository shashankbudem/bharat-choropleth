#!/usr/bin/env node
/**
 * Populates `packages/flutter/example/assets/` from `data/generated`.
 *
 * The Flutter example loads its boundary data through `rootBundle`, so the files
 * have to sit inside the example and be listed in its `pubspec.yaml`. They are
 * not committed — `packages/flutter/.gitignore` ignores `example/assets/` — so a
 * fresh clone has an empty directory that `pubspec.yaml` still declares.
 *
 * That does not fail gently. `flutter analyze` treats the resulting
 * `asset_directory_does_not_exist` warning as an issue and exits 1, so
 * `pnpm check:flutter` and `pnpm build:pages` both fail on a clean checkout —
 * and until this script existed, nothing in the repo said how to fix it.
 *
 *     pnpm prepare:flutter-assets
 *
 * Idempotent: it clears each destination first, so a stale asset from an older
 * data generation is replaced rather than left to shadow the current bundle.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const assets = resolve(root, "packages/flutter/example/assets");

/**
 * Destination -> source. Keys mirror `packages/flutter/example/pubspec.yaml`'s
 * asset list, and the paths the example passes to `rootBundle.loadString`.
 *
 * `overlays/` comes from the district-level reference overlays and is keyed by
 * *state* id, matching `loadDistrictReferenceOverlay`'s
 * `assets/overlays/$stateId.topo.json`. It is deliberately a separate directory
 * from `districts/`: the two share a filename per state, and copying one over
 * the other would render a claim outline as if it were that state's districts.
 */
const COPIES = [
  { to: "states.topo.json", from: "data/generated/current-2019-states/states.topo.json" },
  { to: "parity-config.json", from: "examples/parity-config.json" },
  { to: "districts", from: "data/generated/current-2019-districts/districts" },
  { to: "overlays", from: "data/generated/current-2019-districts/district-reference-overlays" },
  { to: "subdistricts", from: "data/generated/current-2019-subdistricts/subdistricts" },
];

const missing = COPIES.filter(({ from }) => !existsSync(resolve(root, from)));
if (missing.length > 0) {
  console.error(
    `prepare-flutter-example-assets: missing source data:\n${missing.map(({ from }) => `  ${from}`).join("\n")}\n\n` +
      "The generated bundles are committed, so this usually means an incomplete checkout.\n" +
      "Regenerate them with `pnpm build:data` (needs the pinned DataMeet source checkout).",
  );
  process.exit(1);
}

mkdirSync(assets, { recursive: true });
for (const { to, from } of COPIES) {
  const destination = resolve(assets, to);
  rmSync(destination, { recursive: true, force: true });
  cpSync(resolve(root, from), destination, { recursive: true });
  console.log(`  ${to.padEnd(20)} <- ${from}`);
}

console.log(`\nFlutter example assets ready: ${assets}`);
