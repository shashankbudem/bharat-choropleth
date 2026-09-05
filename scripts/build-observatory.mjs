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
/**
 * Where the built site will be mounted. Everything else resolves relative to the
 * page, but Flutter's `--base-href` has to be absolute, so it is the one thing
 * that needs telling. Defaults to a domain root; GitHub Pages serves a project
 * site under `/<repo>/`.
 */
const base = (process.argv.find((arg) => arg.startsWith("--base="))?.slice("--base=".length) ?? "/").replace(/\/*$/, "/");

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

// The packages come first: build-observatory-data.mjs resolves state names
// through the framework-free package's own registry, and imports it from
// `packages/js/dist`. Building the data before the package it depends on worked
// only on a machine with a dist left over from an earlier run — on a clean
// checkout it is a module-not-found, which is how CI found this.
run("pnpm", ["--filter", "bharat-choropleth-js", "build"]);
run("pnpm", ["--filter", "bharat-choropleth", "build"]);

// The dataset is regenerated rather than trusted: it verifies the NFHS-5
// workbook's SHA-256 against the recorded audit before using a single number.
run("node", ["scripts/build-observatory-data.mjs"]);
run("node", ["scripts/build-region-centroids.mjs"]);

run("pnpm", ["--filter", "@bharat-choropleth/observatory-react", "build"]);

const flutterDir = resolve(root, "examples/observatory/flutter");
const buildFlutter = !skipFlutter && existsSync(flutterDir);
if (buildFlutter) {
  run("node", ["scripts/prepare-observatory-flutter-assets.mjs"]);
  run("flutter", ["build", "web", "--base-href", `${base}flutter/`], { cwd: flutterDir });
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

console.log(`\nObservatory artifact ready: ${out}  (mounted at ${base})`);
if (!buildFlutter) console.log("Flutter build skipped; /flutter/ will 404 in this artifact.");
