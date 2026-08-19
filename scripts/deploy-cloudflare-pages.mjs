import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "dist/cloudflare-pages");
const projectName = process.env.CLOUDFLARE_PAGES_PROJECT_NAME || "bharat-choropleth-demos";

if (!existsSync(output)) {
  console.error("Missing dist/cloudflare-pages. Run `pnpm build:pages` first.");
  process.exit(1);
}

// `pnpm dlx` keeps Wrangler out of the published packages. Authentication is
// intentionally delegated to `wrangler login` or Cloudflare's documented CI
// environment variables; this repository never stores credentials.
const result = spawnSync(
  "pnpm",
  ["dlx", "wrangler@4", "pages", "deploy", output, "--project-name", projectName, ...process.argv.slice(2)],
  { cwd: root, stdio: "inherit" },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
