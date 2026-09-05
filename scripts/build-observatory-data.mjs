#!/usr/bin/env node
/**
 * Builds `examples/observatory/data/india-observatory.json` — the dataset behind
 * example 2, the observatory showcase.
 *
 * Every figure in it is a published official statistic, joined to geometry this
 * repository already ships, and carries its producer, download URL, source
 * SHA-256 and vintage. Nothing is invented and nothing is estimated; where a
 * source and our geometry genuinely disagree, the region is emitted as `null` and
 * renders as "No data" rather than being filled in.
 *
 * Two of the three sources were prepared and audited previously under `work/`,
 * with the download URLs, hashes and join rules recorded there. This script reads
 * those audited files rather than re-deriving them. The third (NFHS-5) is fetched
 * here, and its SHA-256 is checked against the audited value before use.
 *
 *     node scripts/build-observatory-data.mjs
 *
 * ## Why indicators carry a boundary edition
 *
 * They do not share one. Census 2011 is reported on the 2011 administrative
 * units, which this repo ships as the historical 35-state / 640-district bundle.
 * NFHS-5 and CGWB are reported on present-day states, which is the current
 * 36-state bundle. Drawing a 2011 statistic on 2019 boundaries would be a
 * silent lie about which places were measured, so each indicator names the
 * edition it belongs to and the app switches the map with it.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "examples/observatory/data");
const read = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

const { resolveState } = await import("../packages/js/dist/index.js");

/* ------------------------------------------------------------------ helpers */

const geometryIds = (path, object) =>
  new Set(read(path).objects[object].geometries.map((geometry) => geometry.properties.id));

const currentStateIds = geometryIds("data/generated/current-2019-states/states.topo.json", "states");

/** Fill every id the edition has, so a region the source omits is explicitly null. */
function complete(ids, values) {
  return Object.fromEntries([...ids].sort().map((id) => [id, values[id] ?? null]));
}

/* ------------------------------------------------- 1. Census 2011 literacy */

const census = read("work/census2011/validated-values.json");
const censusNotes = readFileSync(resolve(root, "work/census2011/raw-source-notes.md"), "utf8");
const censusSha = /SHA-256: `([0-9a-f]{64})`/.exec(censusNotes)?.[1];

const historicalStateIds = geometryIds("data/generated/census-2011/states.topo.json", "states");
const historicalDistrictIds = new Set(
  census.districtValues.map((district) => district.id),
);

const literacy = {
  key: "female_literacy",
  label: "Female literacy rate",
  short: "Female literacy",
  unit: "%",
  description:
    "Literate females as a share of females aged 7 and above, the universe the Census reports literacy on.",
  edition: "historical",
  levels: ["state", "district"],
  decimals: 1,
  source: {
    publisher: "Office of the Registrar General & Census Commissioner, India",
    title: "Census of India 2011 — Primary Census Abstract",
    vintage: "2011",
    url: "https://censusindia.gov.in/nada/index.php/catalog/6191",
    file: "DDW_PCA0000_2011_Indiastatedist.xlsx",
    sha256: censusSha,
    formula: census.formula,
    joinRule:
      "Official state and district codes to the historical bundle's sourceStateCode / source.censuscode. Display names are never used to join.",
  },
  values: {
    state: complete(historicalStateIds, Object.fromEntries(
      census.stateValues.map((row) => [row.id, Number(row.femaleLiteracyRate.toFixed(2))]),
    )),
    district: complete(historicalDistrictIds, Object.fromEntries(
      census.districtValues.map((row) => [row.id, Number(row.femaleLiteracyRate.toFixed(2))]),
    )),
  },
};

/* ------------------------------------------------------ 2. NFHS-5 (state) */

const nfhsAudit = read("work/nfhs5/join-audit.json");
const NFHS_URL = "https://data.gov.in/sites/default/files/datafile/NFHS_5_Factsheets_Data.xls";

const workbook = Buffer.from(await (await fetch(NFHS_URL)).arrayBuffer());
const nfhsSha = createHash("sha256").update(workbook).digest("hex");
if (nfhsSha !== nfhsAudit.sourceFiles.stateXlsSha256) {
  throw new Error(
    `NFHS-5 workbook changed since it was audited.\n  audited: ${nfhsAudit.sourceFiles.stateXlsSha256}\n  fetched: ${nfhsSha}\n` +
      "Re-audit it under work/nfhs5/ before trusting the numbers.",
  );
}
// The workbook is legacy BIFF, so the numbers are parsed by the Python helper
// beside this script and handed back as JSON. It is written to a scratch file
// only because that helper takes a path, and removed again straight after —
// the repository stores the audit of this download, not the download itself.
const { execFileSync } = await import("node:child_process");
const { rmSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const scratch = resolve(tmpdir(), `nfhs5-state-${process.pid}.xls`);
writeFileSync(scratch, workbook);
let nfhsRows;
try {
  nfhsRows = JSON.parse(
    execFileSync("python3", [resolve(root, "scripts/read-nfhs5-state-xls.py"), scratch], { encoding: "utf8" }),
  );
} finally {
  rmSync(scratch, { force: true });
}

/**
 * The source spells Maharashtra "Maharastra". That is a defect in this one file,
 * not a name anyone uses, so it is corrected here rather than taught to the
 * shared state registry — where it would silently accept the misspelling for
 * every consumer of the library.
 */
const NFHS_NAME_FIXES = { Maharastra: "Maharashtra" };

const nfhsValues = { improved_sanitation: {}, full_vaccination: {}, stunting: {}, child_anaemia: {} };
const nfhsUnmatched = [];
for (const row of nfhsRows) {
  if (row.name === "India") continue;
  const id = resolveState(NFHS_NAME_FIXES[row.name] ?? row.name)?.id;
  if (!id || !currentStateIds.has(id)) {
    nfhsUnmatched.push(row.name);
    continue;
  }
  for (const metric of Object.keys(nfhsValues)) nfhsValues[metric][id] = row[metric];
}
if (nfhsUnmatched.length > 0) throw new Error(`NFHS-5 states did not join: ${nfhsUnmatched.join(", ")}`);

const nfhsSource = (column) => ({
  publisher: "International Institute for Population Sciences / Ministry of Health and Family Welfare",
  title: "National Family Health Survey (NFHS-5), state and union territory factsheets",
  vintage: "2019–21",
  url: "https://www.data.gov.in/resource/all-india-and-stateut-wise-factsheets-national-family-health-survey-nfhs-5-2019-2021",
  file: "NFHS_5_Factsheets_Data.xls",
  sha256: nfhsSha,
  column,
  joinRule:
    "State name resolved through this library's own state registry; one source misspelling corrected. Area = Total rows only.",
  caveat:
    "NFHS-5 district figures are reported on the survey's own 707-district frame, which matches neither boundary bundle here, so this indicator is state-level only.",
});

const nfhs = [
  {
    key: "improved_sanitation",
    label: "Improved sanitation",
    short: "Sanitation",
    unit: "%",
    description: "Population living in a household using an improved sanitation facility.",
    source: nfhsSource("Population living in households that use an improved sanitation facility (%)"),
  },
  {
    key: "full_vaccination",
    label: "Full child vaccination",
    short: "Vaccination",
    unit: "%",
    description: "Children aged 12–23 months fully vaccinated, by card or mother's recall.",
    source: nfhsSource("Children age 12-23 months fully vaccinated based on information from either vaccination card or mother (%)"),
  },
  {
    key: "stunting",
    label: "Child stunting",
    short: "Stunting",
    unit: "%",
    description: "Children under 5 who are stunted for their age. Lower is better.",
    lowerIsBetter: true,
    source: nfhsSource("Children under 5 years who are stunted (height-for-age) (%)"),
  },
  {
    key: "child_anaemia",
    label: "Child anaemia",
    short: "Anaemia",
    unit: "%",
    description: "Children aged 6–59 months who are anaemic. Lower is better.",
    lowerIsBetter: true,
    source: nfhsSource("Children age 6-59 months who are anaemic (<11.0 g/dl) (%)"),
  },
].map((indicator) => ({
  ...indicator,
  edition: "current",
  levels: ["state"],
  decimals: 1,
  values: { state: complete(currentStateIds, nfhsValues[indicator.key]) },
}));

/* ------------------------------------------------ 3. CGWB 2023 groundwater */

const cgwb = read("work/cgwb2023/validated-values.json");
const cgwbAudit = read("work/cgwb2023/join-audit.json");

const MERGED_DNH_DD = "in-cs-26-dadra-and-nagar-haveli-and-daman-and-diu";
const groundwaterValues = {};
const cgwbSkipped = [];
for (const row of cgwb.state_rows) {
  const id = resolveState(row.state_name)?.id;
  // Dadra & Nagar Haveli and Daman & Diu are separate rows in the 2023
  // assessment and one merged UT in this geometry. The report gives an
  // extraction *percentage* with no draft or recharge volume to weight by, so
  // the two cannot be honestly combined into one number — the merged UT is
  // emitted as no data instead of being guessed at.
  //
  // Matched on the resolved id, not the name: "daman" is a substring of
  // "Andaman", and a name test here quietly dropped Andaman & Nicobar.
  if (!id || !currentStateIds.has(id) || id === MERGED_DNH_DD) {
    cgwbSkipped.push(row.state_name);
    continue;
  }
  groundwaterValues[id] = row.stage_of_extraction_pct;
}

const groundwater = {
  key: "groundwater_extraction",
  label: "Groundwater extraction",
  short: "Groundwater",
  unit: "%",
  description:
    "Annual groundwater draft as a share of annual recharge. Above 100% means more is taken out than goes back in.",
  edition: "current",
  levels: ["state"],
  decimals: 1,
  lowerIsBetter: true,
  source: {
    publisher: "Central Ground Water Board, Ministry of Jal Shakti",
    title: "Dynamic Ground Water Resources of India, 2023 — Annexure I (state-wise)",
    vintage: "2023",
    url: cgwbAudit.source.url,
    sha256: cgwbAudit.source.sha256,
    joinRule: "State name resolved through this library's own state registry.",
    caveat:
      `Dadra & Nagar Haveli and Daman & Diu are two rows in the 2023 assessment and one merged union territory in this ` +
      `geometry. The report gives a percentage with no volume to weight a merge by, so that UT is left as no data. ` +
      `District figures are omitted entirely: the audit under work/cgwb2023/ matched only ` +
      `${cgwbAudit.district_join_audit.matched_rows} of ${cgwb.counts.district_rows} district rows against the ` +
      `788-feature current bundle, which is not a complete enough join to publish.`,
  },
  values: { state: complete(currentStateIds, groundwaterValues) },
};

/* --------------------------------------------------- 0. Live temperature */

/**
 * The one indicator that reaches sub-district, and the only one with no vintage.
 *
 * The published five are collected on particular administrative units, so they
 * stop where their source stops. A weather API answers for a coordinate at the
 * moment you ask, so it can fill every level of the current bundle honestly —
 * all 5,950 sub-districts included.
 *
 * It carries no values here. The apps fetch them, keyed by region id, using the
 * sampling points from `region-centroids.json`; the state map is emitted as all
 * nulls purely so every indicator has the same shape.
 */
const liveTemperature = {
  key: "live_temperature",
  label: "Current temperature",
  short: "Temperature",
  unit: "°C",
  description:
    "The temperature right now at one point inside each region — a sample, not an average over its area.",
  edition: "current",
  levels: ["state", "district", "subdistrict"],
  decimals: 1,
  live: {
    provider: "Open-Meteo",
    endpoint: "https://api.open-meteo.com/v1/forecast",
    variable: "temperature_2m",
    centroids: "/data/region-centroids.json",
    // Cool to hot. Not a "more is better" ramp: temperature has no good end.
    colorScale: ["#4a6fa5", "#6d95bd", "#9dbdd4", "#e8e2d0", "#efc48a", "#e09453", "#c2542f"],
    legendLabels: ["Cooler", "Warmer"],
  },
  source: {
    publisher: "Open-Meteo",
    title: "Open-Meteo forecast API, current temperature_2m",
    vintage: "live",
    url: "https://open-meteo.com/",
    licence: "CC BY 4.0",
    joinRule:
      "One representative point inside each region, derived from this repository's boundary bundles and checked to fall inside it. Read in one batched request per view.",
    caveat:
      "A point sample, not an area average: a large district is a single reading, the same as a small one. Readings change between visits, so this indicator is the one thing here that is not reproducible from a recorded source hash.",
  },
  values: { state: complete(currentStateIds, {}) },
};

/* ------------------------------------------------------------------ write */

mkdirSync(out, { recursive: true });
const dataset = {
  generatedBy: "scripts/build-observatory-data.mjs",
  generatedAt: new Date().toISOString().slice(0, 10),
  note:
    "Every value is a published official statistic joined to boundary data in this repository. Regions a source does not cover are null and render as No data; none are estimated or filled in.",
  editions: {
    historical: {
      label: "Census 2011 boundaries",
      states: "data/generated/census-2011/states.topo.json",
      districts: "data/generated/census-2011/districts",
      stateCount: historicalStateIds.size,
    },
    current: {
      label: "Current (2019) boundaries",
      states: "data/generated/current-2019-states/states.topo.json",
      districts: "data/generated/current-2019-districts/districts",
      stateCount: currentStateIds.size,
    },
  },
  // Live first: it is the one that drills to sub-district, so it is what a
  // reader should meet before the published five that stop at district.
  indicators: [liveTemperature, literacy, ...nfhs, groundwater],
};
writeFileSync(resolve(out, "india-observatory.json"), `${JSON.stringify(dataset, null, 1)}\n`);

for (const indicator of dataset.indicators) {
  const states = Object.values(indicator.values.state);
  const reported = indicator.live ? states.length : states.filter((value) => value !== null).length;
  const districts = indicator.values.district ? Object.keys(indicator.values.district).length : 0;
  console.log(
    `  ${indicator.key.padEnd(23)} ${indicator.edition.padEnd(11)} states ${reported}/${states.length}` +
      (districts ? `  districts ${districts}` : "") +
      (indicator.live ? "  (fetched at runtime, to sub-district)" : ""),
  );
}
if (cgwbSkipped.length > 0) console.log(`\n  CGWB rows left as no data: ${cgwbSkipped.join(", ")}`);
console.log(`\nWrote ${resolve(out, "india-observatory.json")}`);
