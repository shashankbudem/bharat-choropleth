#!/usr/bin/env node
/**
 * Assembles example 2 — the observatory showcase — into `dist/observatory/`.
 *
 * Served at its own root, separately from example 1 (`apps/demo`). The three
 * apps use absolute paths for the things they share (`/data/generated`,
 * `/packages/js/dist`, `/data/india-observatory.json`), so this layout is what
 * they expect:
 *
 *     /                  the portal
 *     /react/            the React app
 *     /js/               the framework-free app
 *     /flutter/          the Flutter web build
 *     /data/             the observatory dataset + the boundary bundles
 *     /packages/js/dist/ the published framework-free bundle
 *
 *     pnpm build:observatory
 *
 * The Flutter app is optional: pass --skip-flutter, or leave the Flutter SDK
 * off the machine, and the other two are still assembled with the portal card
 * pointing at a build that is not there. Everything else is required.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "dist/observatory");
const skipFlutter = process.argv.includes("--skip-flutter");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function copy(from, to) {
  const source = resolve(root, from);
  if (!existsSync(source)) throw new Error(`Expected build output was not found: ${from}`);
  cpSync(source, resolve(out, to), { recursive: true });
}

// The dataset is regenerated rather than trusted: it verifies the NFHS-5
// workbook's SHA-256 against the recorded audit before using a single number.
run("node", ["scripts/build-observatory-data.mjs"]);
run("node", ["scripts/build-region-centroids.mjs"]);

run("pnpm", ["--filter", "bharat-choropleth", "build"]);
run("pnpm", ["--filter", "bharat-choropleth-js", "build"]);
run("pnpm", ["--filter", "@bharat-choropleth/observatory-react", "build"]);

const flutterDir = resolve(root, "examples/observatory/flutter");
const buildFlutter = !skipFlutter && existsSync(flutterDir);
if (buildFlutter) {
  run("node", ["scripts/prepare-observatory-flutter-assets.mjs"]);
  run("flutter", ["build", "web", "--base-href", "/flutter/"], { cwd: flutterDir });
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

copy("examples/observatory/index.html", "index.html");
copy("examples/observatory/react/dist", "react");
copy("examples/observatory/js", "js");
copy("examples/observatory/data/india-observatory.json", "data/india-observatory.json");
copy("examples/observatory/data/region-centroids.json", "data/region-centroids.json");
copy("data/generated", "data/generated");
copy("packages/js/dist", "packages/js/dist");
if (buildFlutter) copy("examples/observatory/flutter/build/web", "flutter");

console.log(`\nObservatory artifact ready: ${out}`);
if (!buildFlutter) console.log("Flutter build skipped; /flutter/ will 404 in this artifact.");
