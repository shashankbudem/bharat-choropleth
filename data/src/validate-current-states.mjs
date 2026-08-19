import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { geoArea } from "d3-geo";
import { feature as topojsonFeature } from "topojson-client";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "..");
const generated = join(dataDir, "generated", "current-2019-states");
const reportPath = join(dataDir, "metadata", "current-2019-states-validation-report.json");
const maxAssetBytes = 250_000;
const maxAssetGzipBytes = 100_000;
const expectedStateRegions = 36;

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

function boundsOf(geometry) {
  let minLongitude = Infinity;
  let minLatitude = Infinity;
  let maxLongitude = -Infinity;
  let maxLatitude = -Infinity;
  walkCoordinates(geometry.coordinates, ([longitude, latitude]) => {
    minLongitude = Math.min(minLongitude, longitude);
    maxLongitude = Math.max(maxLongitude, longitude);
    minLatitude = Math.min(minLatitude, latitude);
    maxLatitude = Math.max(maxLatitude, latitude);
  });
  return { minLongitude, minLatitude, maxLongitude, maxLatitude, width: maxLongitude - minLongitude, height: maxLatitude - minLatitude };
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
  const topoPath = join(generated, manifest.assets.states.topojson);
  const topo = await readJson(topoPath);
  if (topo.type !== "Topology" || !topo.objects?.states) errors.push("Missing expected Topology object states.");
  const converted = topojsonFeature(topo, topo.objects.states);
  const features = converted.type === "FeatureCollection" ? converted.features : [converted];
  if (features.length !== manifest.assets.states.featureCount) {
    errors.push(`TopoJSON feature count ${features.length} differs from manifest ${manifest.assets.states.featureCount}.`);
  }
  if (features.length !== expectedStateRegions) {
    errors.push(`Expected ${expectedStateRegions} current state/UT regions; found ${features.length}.`);
  }

  const stateIds = new Set();
  const lgdCodes = new Set();
  for (const item of features) {
    const { id, name, slug, lgdCode } = item.properties || {};
    if (!id || !name || !slug || lgdCode === undefined) errors.push(`State feature missing identity fields: ${item.id || "unknown"}.`);
    if (!id?.startsWith("in-cs-")) errors.push(`State id is not in the current-states namespace: ${id}.`);
    if (stateIds.has(id)) errors.push(`Duplicate state id: ${id}.`);
    stateIds.add(id);
    if (lgdCodes.has(lgdCode)) errors.push(`Duplicate LGD code: ${lgdCode}.`);
    lgdCodes.add(lgdCode);
    // A feature with no rings passes every other check here — it has a valid id,
    // a name, plausible (empty) bounds — and then renders as nothing at all.
    // Lakshadweep shipped that way until simplification stopped erasing it.
    if ((item.geometry?.coordinates?.length ?? 0) === 0) {
      errors.push(`state ${id}: has no geometry; it would render as nothing.`);
    }
    validateGeometry(item.geometry, `state ${id}`, errors);
  }

  const nationalBounds = boundsOf({ type: "MultiPolygon", coordinates: features.flatMap((item) => item.geometry.coordinates) });
  for (const item of features) {
    const sphericalArea = geoArea(item);
    if (sphericalArea > 1) errors.push(`state ${item.properties.id}: implausibly large spherical area (${sphericalArea}); likely inverted ring winding.`);
    const bounds = boundsOf(item.geometry);
    if (bounds.width >= nationalBounds.width * 0.9 || bounds.height >= nationalBounds.height * 0.9) {
      errors.push(`state ${item.properties.id}: bounds span nearly the complete national envelope.`);
    }
  }
  // Cross-checked against the same official political-outline extent used to validate
  // the DataMeet claim overlay: current-vintage source geometry should reach it too.
  if (nationalBounds.minLongitude > 69) errors.push(`Western extent too truncated: ${nationalBounds.minLongitude}.`);
  if (nationalBounds.maxLongitude < 97) errors.push(`Eastern extent too truncated: ${nationalBounds.maxLongitude}.`);
  if (nationalBounds.maxLatitude < 37) errors.push(`Northern extent too truncated: ${nationalBounds.maxLatitude}.`);
  if (nationalBounds.minLatitude > 7) errors.push(`Southern extent too truncated: ${nationalBounds.minLatitude}.`);

  const jkFeature = features.find((item) => item.properties.id === "in-cs-01-jammu-and-kashmir");
  if (!jkFeature) errors.push("Expected a current Jammu & Kashmir feature (in-cs-01-jammu-and-kashmir).");
  const ladakhFeature = features.find((item) => item.properties.id === "in-cs-37-ladakh");
  if (!ladakhFeature) errors.push("Expected a current Ladakh feature (in-cs-37-ladakh).");
  const dnhddFeature = features.find((item) => item.properties.id === "in-cs-26-dadra-and-nagar-haveli-and-daman-and-diu");
  if (!dnhddFeature) errors.push("Expected the merged Dadra & Nagar Haveli and Daman & Diu feature (in-cs-26-...).");

  const bytes = await stat(topoPath).then((info) => info.size);
  const gzipBytes = gzipSync(await readFile(topoPath)).byteLength;
  if (bytes > maxAssetBytes) errors.push(`states TopoJSON exceeds ${maxAssetBytes} bytes.`);
  if (gzipBytes > maxAssetGzipBytes) errors.push(`states TopoJSON gzip exceeds ${maxAssetGzipBytes} bytes.`);

  const checksum = await sha256(topoPath);
  if (manifest.outputSha256?.statesTopojson !== checksum) errors.push("states TopoJSON checksum does not match manifest.");

  const report = {
    validatedAt: new Date().toISOString(),
    result: errors.length === 0 ? "pass" : "fail",
    counts: { states: features.length },
    bytes: { statesTopojson: bytes, statesTopojsonGzip: gzipBytes },
    bounds: nationalBounds,
    checksum,
    errors,
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
