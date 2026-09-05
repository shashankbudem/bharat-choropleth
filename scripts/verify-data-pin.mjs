#!/usr/bin/env node
/**
 * Checks that `DEFAULT_DATA_BASE_URL` actually serves every map level.
 *
 * The zero-config `BharatChoropleth` — in both the React and the framework-free
 * package — fetches boundary data from a jsDelivr copy of this repository pinned
 * to a release tag. If that pin is left behind, the levels the older tag predates
 * do not error: `loadSubDistrictTopology` reads a 404 as "this district has no
 * sub-district level", which is a real case for three districts, so an entirely
 * absent bundle is indistinguishable from every district being a leaf. Drill-down
 * just quietly stops one level short, with no console error and no status message.
 *
 * That is exactly how v0.2.0 shipped: the pin still said v0.1.0, a tag from before
 * `data/generated/current-2019-subdistricts/` existed, so the sub-district level
 * that release added was unreachable for every consumer on the default URL.
 *
 * `docs/PUBLISHING.md` already told a releaser to check this by hand. It was not
 * caught, because a manual step in a checklist is only as reliable as the person
 * reading it at the time. Hence a script:
 *
 *     pnpm verify:data-pin
 *
 * Network-dependent, so it is deliberately not part of `pnpm check` — it belongs
 * to release preflight, where the network is a given anyway.
 */
import { readFile } from "node:fs/promises";

const SOURCE = new URL("../packages/js/src/data-source.ts", import.meta.url);

/**
 * One real asset per level. The district must be one that genuinely has
 * sub-districts — `data/metadata/current-2019-subdistricts-validation-report.json`
 * lists the three that do not, and picking one of those would make this check
 * pass against an empty bundle.
 */
const PROBES = [
  { level: "states", path: "current-2019-states/states.topo.json" },
  { level: "districts", path: "current-2019-districts/districts/in-cs-36-telangana.topo.json" },
  { level: "sub-districts", path: "current-2019-subdistricts/subdistricts/in-cd-36-643.topo.json" },
];

const source = await readFile(SOURCE, "utf8");
const pin = source.match(/export const DEFAULT_DATA_BASE_URL = "([^"]+)"/)?.[1];
if (!pin) {
  console.error("verify-data-pin: could not find DEFAULT_DATA_BASE_URL in packages/js/src/data-source.ts");
  process.exit(1);
}

console.log(`Pinned data source: ${pin}\n`);

const failures = [];
for (const { level, path } of PROBES) {
  const url = `${pin.replace(/\/+$/, "")}/${path}`;
  let status;
  try {
    status = (await fetch(url, { method: "HEAD" })).status;
  } catch (error) {
    status = `network error: ${error instanceof Error ? error.message : String(error)}`;
  }
  const ok = status === 200;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${level.padEnd(14)} ${status}  ${url}`);
  if (!ok) failures.push({ level, url, status });
}

if (failures.length > 0) {
  console.error(
    `\nverify-data-pin: ${failures.length} level(s) missing at the pinned tag.\n` +
      "The map will not error at runtime — it will silently render without them.\n" +
      "Bump DEFAULT_DATA_BASE_URL to the tag you are about to create, and make sure\n" +
      "data/generated is committed at that tag. See docs/PUBLISHING.md.",
  );
  process.exit(1);
}

console.log("\nAll levels resolve at the pinned tag.");
