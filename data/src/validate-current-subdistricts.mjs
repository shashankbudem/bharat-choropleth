import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { geoArea } from "d3-geo";
import { feature as topojsonFeature } from "topojson-client";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "..");
const generated = join(dataDir, "generated", "current-2019-subdistricts");
const districtsDir = join(dataDir, "generated", "current-2019-districts", "districts");
const reportPath = join(dataDir, "metadata", "current-2019-subdistricts-validation-report.json");
const expectedSubDistrictCount = 5950;
const expectedParentCount = 785;
// Delhi's NAZUL is a land-tenure artifact rather than a district; Rajasthan's urban
// JAIPUR and JODHPUR are the smaller halves of the source's overlapping urban/rural
// district pairs, and the Census-2011 sub-district layer predates that split. These
// three deliberately have no asset and must stay non-drillable.
const expectedDistrictsWithoutSubDistricts = ["in-cd-07-169", "in-cd-08-569", "in-cd-08-575"];

function walkCoordinates(coordinates, visit) {
  if (typeof coordinates[0] === "number") {
    visit(coordinates);
    return;
  }
  for (const item of coordinates) walkCoordinates(item, visit);
}

function ringIsClosed(ring) {
  const first = ring[0];
  const last = ring.at(-1);
  return first?.[0] === last?.[0] && first?.[1] === last?.[1];
}

function validateGeometry(geometry, label, errors) {
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) {
    errors.push(`${label}: expected Polygon or MultiPolygon geometry.`);
    return;
  }
  walkCoordinates(geometry.coordinates, ([longitude, latitude]) => {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) errors.push(`${label}: non-finite coordinate.`);
    if (longitude < 60 || longitude > 105 || latitude < 5 || latitude > 40) {
      errors.push(`${label}: coordinate is outside the expected India envelope.`);
    }
  });
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      if (ring.length < 4 || !ringIsClosed(ring)) errors.push(`${label}: invalid unclosed linear ring.`);
    }
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function main() {
  const errors = [];
  const manifest = await readJson(join(generated, "manifest.json"));

  // Every parent must be a real district in the bundle this one hangs off. That is
  // the whole contract of a spatial join: the geometry decided the parent, so
  // nothing else guarantees the parent id exists.
  const allDistrictIds = new Set();
  const districtNames = new Map();
  for (const file of await readdir(districtsDir)) {
    if (!file.endsWith(".topo.json")) continue;
    const topojson = await readJson(join(districtsDir, file));
    for (const geometry of topojson.objects.districts.geometries) {
      allDistrictIds.add(geometry.properties.id);
      districtNames.set(geometry.properties.id, geometry.properties.name);
    }
  }

  const entries = Object.entries(manifest.assets.subDistricts);
  const allSubDistrictIds = new Set();
  const perDistrict = {};

  for (const [parentId, entry] of entries) {
    if (!parentId.startsWith("in-cd-")) errors.push(`Sub-district asset key is not a current-district id: ${parentId}.`);
    if (!allDistrictIds.has(parentId)) errors.push(`Sub-district asset ${parentId} has no matching current-district feature.`);
    const topoPath = join(generated, entry.topojson);
    const topo = await readJson(topoPath);
    if (topo.type !== "Topology" || !topo.objects?.subdistricts) {
      errors.push(`${parentId}: missing expected Topology object subdistricts.`);
      continue;
    }
    const converted = topojsonFeature(topo, topo.objects.subdistricts);
    const features = converted.type === "FeatureCollection" ? converted.features : [converted];
    if (features.length !== entry.featureCount) {
      errors.push(`${parentId}: TopoJSON feature count ${features.length} differs from manifest ${entry.featureCount}.`);
    }
    perDistrict[parentId] = features.length;
    for (const item of features) {
      const { id, parentId: featureParentId, name, slug } = item.properties || {};
      if (!id || !featureParentId || !name || !slug) errors.push(`Sub-district feature missing identity fields: ${item.id || "unknown"}.`);
      if (!id?.startsWith("in-csd-")) errors.push(`Sub-district id is not in the current-sub-district namespace: ${id}.`);
      if (featureParentId !== parentId) errors.push(`${id}: parentId ${featureParentId} conflicts with its lazy-load asset ${parentId}.`);
      if (allSubDistrictIds.has(id)) errors.push(`Duplicate sub-district id: ${id}.`);
      allSubDistrictIds.add(id);
      const sphericalArea = geoArea(item);
      if (sphericalArea > 1) errors.push(`sub-district ${id}: implausibly large spherical area (${sphericalArea}); likely inverted ring winding.`);
      validateGeometry(item.geometry, `sub-district ${id}`, errors);
    }
    const checksum = await sha256(topoPath);
    if (entry.sha256 !== checksum) errors.push(`${parentId}: checksum does not match manifest.`);
  }

  const diskFiles = (await readdir(join(generated, "subdistricts"))).filter((file) => file.endsWith(".topo.json"));
  if (diskFiles.length !== entries.length) errors.push("Sub-district TopoJSON files and manifest entries differ.");

  if (allSubDistrictIds.size !== expectedSubDistrictCount) {
    errors.push(`Expected ${expectedSubDistrictCount} current sub-districts; found ${allSubDistrictIds.size}.`);
  }
  if (entries.length !== expectedParentCount) {
    errors.push(`Expected ${expectedParentCount} districts with a sub-district asset; found ${entries.length}.`);
  }

  // Districts without sub-districts are a deliberate, enumerated set: the renderer
  // treats a missing asset as "not drillable", so an unnoticed gap would silently
  // remove a district's third level rather than fail.
  const withoutAssets = [...allDistrictIds].filter((id) => !manifest.assets.subDistricts[id]).sort();
  const unexpectedGaps = withoutAssets.filter((id) => !expectedDistrictsWithoutSubDistricts.includes(id));
  const missingExpectedGaps = expectedDistrictsWithoutSubDistricts.filter((id) => !withoutAssets.includes(id));
  for (const id of unexpectedGaps) errors.push(`District ${id} (${districtNames.get(id) ?? "?"}) unexpectedly has no sub-district asset.`);
  for (const id of missingExpectedGaps) errors.push(`District ${id} was expected to have no sub-district asset, but one exists.`);
  const manifestGaps = (manifest.join?.districtsWithoutSubDistricts ?? []).map((item) => item.id).sort();
  if (manifestGaps.join(",") !== withoutAssets.join(",")) {
    errors.push("manifest.join.districtsWithoutSubDistricts does not match the districts that actually lack an asset.");
  }

  // Mirpur and Muzaffarabad are Pakistan-administered; their source rows must never
  // reach the value-bearing set, and must not have bled into a neighbouring district.
  for (const [parentId, entry] of entries) {
    const topo = await readJson(join(generated, entry.topojson));
    for (const geometry of topo.objects.subdistricts?.geometries ?? []) {
      const sourceDistrict = String(geometry.properties?.source?.dtname ?? "");
      if (/^(mirpur|muzaffarabad)$/i.test(sourceDistrict.trim())) {
        errors.push(`${parentId}: sub-district ${geometry.properties?.id} derives from Pakistan-administered ${sourceDistrict}.`);
      }
    }
  }

  const totalBytes = await Promise.all(entries.map(([, entry]) => stat(join(generated, entry.topojson)).then((info) => info.size)));
  const totalGzipBytes = await Promise.all(entries.map(([, entry]) => readFile(join(generated, entry.topojson)).then((buffer) => gzipSync(buffer).byteLength)));
  const largest = Math.max(...totalBytes);
  // Each asset is one district's sub-districts and is fetched on its own, so the
  // budget that matters is the largest single lazy load, not the bundle total.
  const LARGEST_ASSET_BUDGET_BYTES = 200_000;
  if (largest > LARGEST_ASSET_BUDGET_BYTES) {
    errors.push(`Largest sub-district asset is ${largest} bytes, over the ${LARGEST_ASSET_BUDGET_BYTES}-byte per-drill budget.`);
  }

  const report = {
    validatedAt: new Date().toISOString(),
    result: errors.length === 0 ? "pass" : "fail",
    counts: {
      districts: allDistrictIds.size,
      subDistrictParents: entries.length,
      subDistricts: allSubDistrictIds.size,
      districtsWithoutSubDistricts: withoutAssets.length,
    },
    bytes: {
      totalTopojson: totalBytes.reduce((sum, value) => sum + value, 0),
      totalTopojsonGzip: totalGzipBytes.reduce((sum, value) => sum + value, 0),
      largestAsset: largest,
    },
    join: {
      assigned: manifest.join?.assignedCount ?? null,
      lowConfidence: manifest.join?.lowConfidenceCount ?? null,
      districtsWithoutSubDistricts: withoutAssets,
    },
    errors,
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, join: { ...report.join } }, null, 2));
  if (errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
