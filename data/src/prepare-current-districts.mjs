import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { topology } from "topojson-server";
import { feature as topoFeature, merge } from "topojson-client";
import { presimplify, simplify } from "topojson-simplify";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "..");
const outputDir = join(dataDir, "generated", "current-2019-districts");
const districtDir = join(outputDir, "districts");
const currentStatesPath = join(dataDir, "generated", "current-2019-states", "states.topo.json");
// Same independently sourced checkout as prepare-current-states.mjs, deliberately
// outside the DataMeet Census-2011 checkout used by prepare-boundaries.mjs.
const sourceDir = resolve(
  process.env.INDIA_SHAPEFILES_DIR || join(dataDir, "../../../work/india-shapefiles"),
);
const sourcePath = join(sourceDir, "INDIA", "INDIA_DISTRICTS.geojson");
const commit = process.env.INDIA_SHAPEFILES_COMMIT || "2c028f5c30fb4191ca1639ff136b152cecdbb69f";

// The source mistags Yanam's `statecode` as Andhra Pradesh (28); it is one of
// Puducherry's four exclaved districts, and its `state` property correctly says so.
const YANAM_OVERRIDE_LGD = 34;

// A single-character mojibake artifact throughout the source's own encoding: a
// romanized long-vowel diacritic was mangled into one of these five substitute
// characters, e.g. "Bengal#ru"->"Bengaluru", "K>NGRA"->"KANGRA", "HAM|RPUR"->
// "HAMIRPUR", "DEHRAD@N"->"DEHRADUN", "B\dar"->"Bidar". Verified against every one
// of the 50 affected district names across 7 states before adopting this mapping;
// no legitimate district name contains any of these characters. `_` is a plain
// space substitute (Telangana's "MEDCHAL_MALKAJGIRI").
const MOJIBAKE_REPAIRS = [
  [/#/g, "u"],
  [/\\/g, "i"],
  [/>/g, "A"],
  [/\|/g, "I"],
  [/@/g, "U"],
  [/_/g, " "],
];

// Explicit per-district overrides, keyed by D_CODE (some names collide once fixed,
// e.g. two Karnataka districts both truncate to "H"; a plain name-keyed map couldn't
// disambiguate them). Two kinds of issue:
// - A handful of Karnataka names are truncated outright in the source (not a
//   character substitution — the field itself is cut short), e.g. "Ball" / "H" / "H".
//   Identified by cross-referencing each stub's geometry centroid against the
//   current official Karnataka district list.
// - West Bengal's "24 Parganas" pair is spelled inconsistently in the source itself
//   (one numeral, no space; one hyphenated words) — standardized to the common
//   "North/South 24 Parganas" form used in Census/LGD references.
const EXPLICIT_NAME_CORRECTIONS = {
  296: "Bagalkot",
  297: "Ballari",
  298: "Belagavi",
  301: "Chamarajanagar",
  302: "Chikkaballapura",
  305: "Davanagere",
  307: "Dharwad",
  309: "Hassan",
  310: "Haveri",
  313: "Kolar",
  317: "Ramanagara",
  325: "Yadgir",
  784: "North 24 Parganas",
  791: "South 24 Parganas",
};

// A ~458x-smaller duplicate fragment of Purba Medinipur (D_CODE 789 is the real
// district, 4,914 vertices; 785 is a stray 14-vertex sliver with the same name).
// Excluded rather than merged, since it is a negligible ~0.2% of the district's area.
const EXCLUDED_DISTRICT_CODES = new Set(["785"]);

// Mirpur (260) and Muzaffarabad (261) are Pakistan-administered districts within the
// source's Jammu & Kashmir set — not Indian-administered territory, so they must not
// become ordinary, value-bearing, clickable districts (matching this project's
// existing historical-bundle treatment of the same non-administered extent, and
// india-map-studio's own documented exclusion of these same two features from its
// district view). They are excluded from the main district set below and instead
// merged into a non-interactive reference overlay for J&K's district view.
const PAKISTAN_ADMINISTERED_DISTRICT_CODES = new Set(["260", "261"]);
const JK_CURRENT_STATE_ID = "in-cs-01-jammu-and-kashmir";

function repairMojibake(value) {
  return MOJIBAKE_REPAIRS.reduce((repaired, [pattern, replacement]) => repaired.replace(pattern, replacement), value);
}

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function normalizedSlug(value) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCase(value) {
  return text(value)
    .toLowerCase()
    .replace(/(^|[\s(/-])([a-z])/g, (_, boundary, letter) => boundary + letter.toUpperCase());
}

function paddedLgdCode(value) {
  const code = String(value);
  if (!/^\d+$/.test(code)) throw new Error(`Expected a numeric LGD code, got “${code}”.`);
  return code.padStart(2, "0");
}

function featureCollection(features) {
  return { type: "FeatureCollection", features };
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value)}\n`);
}

async function byteSize(path) {
  return (await stat(path)).size;
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function ringArea(ring) {
  return ring.slice(0, -1).reduce((area, point, index) => {
    const next = ring[index + 1];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

function cleanExteriorRing(ring) {
  const deduplicated = ring.reduce((points, point) => {
    const prior = points.at(-1);
    if (!prior || prior[0] !== point[0] || prior[1] !== point[1]) points.push(point);
    return points;
  }, []);
  const first = deduplicated[0];
  const last = deduplicated.at(-1);
  if (first && (first[0] !== last[0] || first[1] !== last[1])) deduplicated.push([...first]);
  if (new Set(deduplicated.slice(0, -1).map((point) => point.join(","))).size < 3) return null;
  if (Math.abs(ringArea(deduplicated)) < 1e-8) return null;
  return ringArea(deduplicated) > 0 ? deduplicated.reverse() : deduplicated;
}

function cleanSimplifiedGeometry(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const cleaned = polygons
    .map((polygon) => {
      const exterior = cleanExteriorRing(polygon[0]);
      return exterior ? [exterior] : null;
    })
    .filter(Boolean);
  return { type: "MultiPolygon", coordinates: cleaned };
}

/** Sum of |ring area| across a geometry, used to measure what simplification cost. */
function totalRingArea(geometry) {
  if (!geometry) return 0;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates ?? [];
  return polygons.reduce((total, polygon) => total + Math.abs(ringArea(polygon[0] ?? [])), 0);
}

/**
 * A feature must not be simplified into something unrecognisable. Lakshadweep's
 * districts are islands a kilometre or two across: at this threshold each one
 * collapses to a three-point triangle, which draws as a speck and reads as an
 * empty map once you drill in. Where simplification costs a feature most of its
 * area, the unsimplified outline is kept instead — a few hundred bytes for the
 * handful of features that need it, and no change for the mainland.
 */
const MIN_RETAINED_AREA_SHARE = 0.5;

function optimizedTopology(objects, retainedVertexShare) {
  const raw = topology(objects, 20000);
  const weighted = presimplify(raw);
  const finiteWeights = weighted.arcs
    .flat()
    .map((point) => point[2])
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const threshold = finiteWeights[Math.max(0, Math.floor(finiteWeights.length * (1 - retainedVertexShare)) - 1)] || 0;
  const simplified = simplify(weighted, threshold);
  const objectName = Object.keys(objects)[0];

  const unsimplifiedById = new Map(
    (() => {
      const unpacked = topoFeature(raw, raw.objects[objectName]);
      return (unpacked.type === "FeatureCollection" ? unpacked.features : [unpacked])
        .map((feature) => [feature.properties.id, feature.geometry]);
    })(),
  );

  const unpacked = topoFeature(simplified, simplified.objects[objectName]);
  const features = (unpacked.type === "FeatureCollection" ? unpacked.features : [unpacked]).map((feature) => {
    let geometry = cleanSimplifiedGeometry(feature.geometry);
    const original = unsimplifiedById.get(feature.properties.id);
    const originalArea = totalRingArea(original);
    if (originalArea > 0 && totalRingArea(geometry) < originalArea * MIN_RETAINED_AREA_SHARE) {
      geometry = cleanSimplifiedGeometry(original);
    }
    return { ...feature, geometry };
  });
  return topology({ [objectName]: featureCollection(features) }, 20000);
}

function selectDistrict(feature, lgdToState) {
  const properties = feature.properties;
  const rawName = text(properties.district);
  const correctedName = EXPLICIT_NAME_CORRECTIONS[properties.D_CODE] || repairMojibake(rawName);
  const lgdCode = properties.district === "YANAM" ? YANAM_OVERRIDE_LGD : Number(properties.statecode);
  const parentState = lgdToState.get(lgdCode);
  if (!parentState) throw new Error(`District “${rawName}” has no matching current-state LGD code ${lgdCode}.`);
  const id = `in-cd-${paddedLgdCode(lgdCode)}-${properties.D_CODE}`;
  return {
    id,
    parentId: parentState.id,
    name: titleCase(correctedName),
    slug: normalizedSlug(correctedName),
    lgdCode,
    sourceDistrictCode: properties.D_CODE,
  };
}

async function main() {
  await mkdir(districtDir, { recursive: true });

  const currentStatesTopology = JSON.parse(await readFile(currentStatesPath, "utf8"));
  const currentStatesFeatures = topoFeature(currentStatesTopology, currentStatesTopology.objects.states);
  const lgdToState = new Map(
    currentStatesFeatures.features.map((feature) => [feature.properties.lgdCode, feature.properties]),
  );

  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  if (source.type !== "FeatureCollection") throw new Error(`Expected a GeoJSON FeatureCollection at ${sourcePath}.`);

  // `st_code === "99"` marks the source's own disputed inter-state boundary slivers
  // (district/state are both null; `remarks` explicitly says e.g. "DISPUTED (JHARKHAND
  // & BIHAR)") — not districts. One further stray "ISLAND" feature has no real
  // district code or identifiable parent, and D_CODE 785 is the duplicate Purba
  // Medinipur fragment (see EXCLUDED_DISTRICT_CODES); both excluded the same way.
  // Mirpur/Muzaffarabad are excluded from the main set but retained separately below
  // to build the J&K district-view reference overlay.
  const excludedSentinels = [
    { rule: "st_code=99 (disputed inter-state boundary sliver)", count: 0 },
    { rule: "district=ISLAND, dist_code=NOT AVAILABLE (unidentified artifact)", count: 0 },
    { rule: "D_CODE=785 (duplicate Purba Medinipur fragment)", count: 0 },
    { rule: "D_CODE=260,261 (Mirpur, Muzaffarabad — Pakistan-administered, not a value-bearing district)", count: 0 },
  ];
  const pakistanAdministeredFeatures = source.features.filter((feature) => PAKISTAN_ADMINISTERED_DISTRICT_CODES.has(feature.properties.D_CODE));
  const filteredRaw = source.features.filter((feature) => {
    const properties = feature.properties;
    if (properties.st_code === "99") { excludedSentinels[0].count += 1; return false; }
    if (properties.district === "ISLAND" && properties.dist_code === "NOT AVAILABLE") { excludedSentinels[1].count += 1; return false; }
    if (EXCLUDED_DISTRICT_CODES.has(properties.D_CODE)) { excludedSentinels[2].count += 1; return false; }
    if (PAKISTAN_ADMINISTERED_DISTRICT_CODES.has(properties.D_CODE)) { excludedSentinels[3].count += 1; return false; }
    return true;
  });

  const districts = filteredRaw.map((feature) => {
    const identity = selectDistrict(feature, lgdToState);
    return {
      type: "Feature",
      id: identity.id,
      properties: {
        id: identity.id,
        parentId: identity.parentId,
        name: identity.name,
        slug: identity.slug,
        lgdCode: identity.lgdCode,
        sourceDistrictCode: identity.sourceDistrictCode,
        source: feature.properties,
      },
      geometry: feature.geometry,
    };
  });

  const parents = new Map();
  for (const district of districts) {
    if (!parents.has(district.properties.parentId)) parents.set(district.properties.parentId, []);
    parents.get(district.properties.parentId).push(district);
  }

  const expectedDistrictOutputNames = new Set([...parents.keys()].map((parentId) => `${parentId}.topo.json`));
  for (const file of await readdir(districtDir).catch(() => [])) {
    if (!expectedDistrictOutputNames.has(file)) {
      const recoveryDir = join(dataDir, "work", "legacy-generated-artifacts", "current-2019-districts");
      await mkdir(recoveryDir, { recursive: true });
      const destination = join(recoveryDir, file);
      try {
        await stat(destination);
        continue;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const { rename } = await import("node:fs/promises");
      await rename(join(districtDir, file), destination).catch(() => {});
    }
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      provider: "datta07 / INDIAN-SHAPEFILES contributors",
      repository: "https://github.com/datta07/INDIAN-SHAPEFILES",
      commit,
      input: "INDIA/INDIA_DISTRICTS.geojson",
      inputSha256: await sha256(sourcePath),
      license: "MIT",
      attribution: "District boundaries derived from datta07/INDIAN-SHAPEFILES (MIT).",
      statement: "Independently sourced current district layer, joined to generated/current-2019-states by that bundle's LGD-derived state ids. Not derived from, and not joined to, the historical Census-2011 district geometry in generated/census-2011.",
      excludedSourceFeatures: {
        totalCount: source.features.length - filteredRaw.length,
        rules: excludedSentinels,
      },
      corrections: {
        yanam: "Source tags Yanam's statecode as Andhra Pradesh (28); it is reassigned to its actual parent, Puducherry (LGD 34), based on the source's own state name property.",
        mojibakeRepair: "50 district names across 7 states (Arunachal Pradesh, Himachal Pradesh, Karnataka, Meghalaya, Telangana, Uttarakhand, West Bengal) have a single mangled character in place of a long-vowel diacritic, e.g. Bengal#ru -> Bengaluru, K>NGRA -> Kangra, HAM|RPUR -> Hamirpur, DEHRAD@N -> Dehradun. Repaired with a verified character substitution: # -> u, backslash -> i, > -> A, | -> I, @ -> U, _ -> space.",
        explicitNameOverrides: EXPLICIT_NAME_CORRECTIONS,
      },
    },
    transformation: {
      method: "Per-state topojson-server topology → topology-preserving simplification → degenerate-ring removal and exterior-winding cleanup → final topology output",
      quantization: 20000,
      retainedVertexShare: 0.05,
    },
    identity: {
      district: "in-cd-{zero-padded parent LGD code}-{source D_CODE}",
      districtParent: "Matches the id of the corresponding generated/current-2019-states feature (in-cs-...).",
      warning: "Use id / parentId for joins. slug is for display/search only. This bundle is independently versioned from the historical in-d.../in-hs-... Census-2011 bundle; ids are not compatible between the two.",
    },
    assets: { districts: {}, districtReferenceOverlays: {} },
  };

  for (const [parentId, unsortedChildren] of [...parents.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const children = unsortedChildren.sort((a, b) => a.id.localeCompare(b.id));
    const collection = featureCollection(children);
    const topojsonPath = join(districtDir, `${parentId}.topo.json`);
    // 791 districts across 36 files share a far larger size budget than the 640-district
    // Census bundle's single combined file, so a much higher retained-vertex share still
    // lands comfortably small per file while keeping district shapes crisp.
    await writeJson(topojsonPath, optimizedTopology({ districts: collection }, 0.05));
    manifest.assets.districts[parentId] = {
      topojson: `districts/${parentId}.topo.json`,
      featureCount: children.length,
      bytes: await byteSize(topojsonPath),
      parentName: lgdToState.get(children[0].properties.lgdCode)?.name,
    };
  }

  for (const [parentId, asset] of Object.entries(manifest.assets.districts)) {
    asset.sha256 = await sha256(join(outputDir, asset.topojson));
  }

  if (pakistanAdministeredFeatures.length) {
    const referenceOverlayDir = join(outputDir, "district-reference-overlays");
    await mkdir(referenceOverlayDir, { recursive: true });
    const rawTopology = topology({ districts: featureCollection(pakistanAdministeredFeatures) });
    const mergedGeometry = merge(rawTopology, rawTopology.objects.districts.geometries);
    const overlayId = `${JK_CURRENT_STATE_ID}-pok-reference-outline`;
    const overlayFeature = {
      type: "Feature",
      id: overlayId,
      properties: {
        id: overlayId,
        parentId: JK_CURRENT_STATE_ID,
        name: "Pakistan-administered districts (Mirpur, Muzaffarabad)",
        status: "reference-outline; non-statistical; data-unavailable",
        source: "datta07/INDIAN-SHAPEFILES; merged Mirpur + Muzaffarabad, not Indian-administered territory",
      },
      geometry: mergedGeometry,
    };
    const overlayPath = join(referenceOverlayDir, `${JK_CURRENT_STATE_ID}.topo.json`);
    await writeJson(overlayPath, optimizedTopology({ outline: featureCollection([overlayFeature]) }, 0.05));
    manifest.assets.districtReferenceOverlays[JK_CURRENT_STATE_ID] = {
      topojson: `district-reference-overlays/${JK_CURRENT_STATE_ID}.topo.json`,
      object: "outline",
      id: overlayId,
      parentId: JK_CURRENT_STATE_ID,
      status: overlayFeature.properties.status,
      sourceFeatures: ["Mirpur", "Muzaffarabad"],
      statement: "Reference-only overlay for J&K's current district view. Mirpur and Muzaffarabad are Pakistan-administered and are not Indian districts; render hatched/data-unavailable and never assign a value, selection, or drill-down.",
      bytes: await byteSize(overlayPath),
      sha256: await sha256(overlayPath),
    };
  }

  await writeJson(join(outputDir, "manifest.json"), manifest);
  console.log(`Prepared ${districts.length} current districts across ${parents.size} states/UTs from ${sourceDir}.`);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
