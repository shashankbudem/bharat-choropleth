import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "dist/cloudflare-pages");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function copy(source, destination) {
  const absoluteSource = resolve(root, source);
  if (!existsSync(absoluteSource)) {
    throw new Error(`Expected build output was not found: ${source}`);
  }
  cpSync(absoluteSource, resolve(output, destination), { recursive: true });
}

// A Pages deployment is static. Build all three renderers locally, where the
// Flutter SDK is available, instead of relying on an ephemeral local tunnel.
run("pnpm", ["build"]);
run("pnpm", ["build:demo"]);
// The example's boundary assets are gitignored, so a clean checkout has none and
// `flutter build web` would bundle an app that loads nothing.
run("pnpm", ["prepare:flutter-assets"]);
run("flutter", ["build", "web", "--base-href", "/flutter/"], {
  cwd: resolve(root, "packages/flutter/example"),
});

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

// The web demos use root-relative data URLs. Keep their shared data and JS
// runtime at those URLs while publishing friendly entry points for each demo.
copy("hosting/index.html", "index.html");
copy("apps/parity-demo/dist", "react");
copy("packages/js/example/parity-demo.html", "js/index.html");
copy("packages/js/dist", "packages/js/dist");
copy("data/generated", "data/generated");
copy("examples/parity-config.json", "examples/parity-config.json");
copy("packages/flutter/example/build/web", "flutter");

console.log(`Cloudflare Pages artifact ready: ${output}`);
