import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { geoArea } from "d3-geo";
import { feature as topojsonFeature } from "topojson-client";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "..");
const generated = join(dataDir, "generated", "census-2011");
const reportPath = join(dataDir, "metadata", "validation-report.json");
const maxInitialAssetBytes = 250_000;
const maxInitialAssetGzipBytes = 100_000;
const expectedCensus2011StateRegions = 35;
const expectedCensus2011Districts = 640;

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

async function validateTopoJson(path, objectName, expectedFeatures, label, errors) {
  const topo = await readJson(path);
  if (topo.type !== "Topology" || !topo.objects?.[objectName]) {
    errors.push(`${label}: missing expected Topology object ${objectName}.`);
    return;
  }
  const converted = topojsonFeature(topo, topo.objects[objectName]);
  const features = converted.type === "FeatureCollection" ? converted.features : [converted];
  if (features.length !== expectedFeatures.length) {
    errors.push(`${label}: TopoJSON feature count ${features.length} differs from GeoJSON ${expectedFeatures.length}.`);
  }
  const expectedIds = new Set(expectedFeatures.map((item) => item.properties.id));
  for (const item of features) {
    if (!expectedIds.has(item.properties?.id)) errors.push(`${label}: converted TopoJSON has an unknown/missing id.`);
    if (item.geometry?.type === "GeometryCollection") {
      for (const child of item.geometry.geometries) validateGeometry(child, `${label} ${item.properties?.id || "unknown"}`, errors);
    } else {
      validateGeometry(item.geometry, `${label} ${item.properties?.id || "unknown"}`, errors);
    }
  }
}

async function main() {
  const errors = [];
  const manifest = await readJson(join(generated, "manifest.json"));
  const states = await readJson(join(generated, "states.geojson"));
  const stateIds = new Set();
  for (const feature of states.features) {
    const { id, name, slug } = feature.properties || {};
    if (!id || !name || !slug) errors.push(`State feature missing identity fields: ${feature.id || "unknown"}.`);
    if (stateIds.has(id)) errors.push(`Duplicate state id: ${id}.`);
    stateIds.add(id);
    validateGeometry(feature.geometry, `state ${id}`, errors);
  }
  const statesTopoPath = join(generated, "states.topo.json");
  await validateTopoJson(statesTopoPath, "states", states.features, "states TopoJSON", errors);
  const statesTopo = await readJson(statesTopoPath);
  const decodedStates = topojsonFeature(statesTopo, statesTopo.objects.states).features;
  const nationalBounds = boundsOf({ type: "MultiPolygon", coordinates: decodedStates.flatMap((feature) => feature.geometry.coordinates) });
  for (const feature of decodedStates) {
    const sphericalArea = geoArea(feature);
    if (sphericalArea > 1) errors.push(`state ${feature.properties.id}: implausibly large spherical area (${sphericalArea}); likely inverted ring winding.`);
    const bounds = boundsOf(feature.geometry);
    if (bounds.width >= nationalBounds.width * 0.9 || bounds.height >= nationalBounds.height * 0.9) {
      errors.push(`state ${feature.properties.id}: bounds span nearly the complete national envelope.`);
    }
  }

  const allDistrictIds = new Set();
  const perState = {};
  const districtEntries = Object.entries(manifest.assets.districts);
  for (const [stateId, entry] of districtEntries) {
    if (!stateId.startsWith("in-hs-")) errors.push(`District asset key is not a historical parent id: ${stateId}.`);
    const collection = await readJson(join(generated, entry.geojson));
    perState[stateId] = collection.features.length;
    if (collection.features.length !== entry.featureCount) errors.push(`${stateId}: manifest feature count does not match GeoJSON.`);
    for (const feature of collection.features) {
      const { id, parentId, name, slug } = feature.properties || {};
      if (!id || !parentId || !name || !slug) errors.push(`District feature missing identity fields: ${feature.id || "unknown"}.`);
      if (parentId !== stateId) errors.push(`${id}: parentId ${parentId} conflicts with its lazy-load asset ${stateId}.`);
      if (allDistrictIds.has(id)) errors.push(`Duplicate district id: ${id}.`);
      allDistrictIds.add(id);
      validateGeometry(feature.geometry, `district ${id}`, errors);
    }
    await validateTopoJson(join(generated, entry.topojson), "districts", collection.features, `${stateId} TopoJSON`, errors);
  }

  const stateGeojsonBytes = (await stat(join(generated, "states.geojson"))).size;
  const stateTopojsonBytes = (await stat(join(generated, "states.topo.json"))).size;
  const stateTopojsonGzipBytes = gzipSync(await readFile(join(generated, "states.topo.json"))).byteLength;
  if (stateTopojsonBytes > maxInitialAssetBytes) errors.push(`Initial states TopoJSON exceeds ${maxInitialAssetBytes} bytes.`);
  if (stateTopojsonGzipBytes > maxInitialAssetGzipBytes) errors.push(`Initial states TopoJSON gzip exceeds ${maxInitialAssetGzipBytes} bytes.`);
  const diskDistrictFiles = (await readdir(join(generated, "districts"))).filter((file) => file.endsWith(".geojson"));
  if (diskDistrictFiles.length !== districtEntries.length) errors.push("District GeoJSON files and manifest entries differ.");

  if (states.features.length !== expectedCensus2011StateRegions) errors.push(`Expected ${expectedCensus2011StateRegions} Census-2011 state/UT regions; found ${states.features.length}.`);
  if (allDistrictIds.size !== expectedCensus2011Districts) errors.push(`Expected ${expectedCensus2011Districts} Census-2011 districts; found ${allDistrictIds.size}.`);
  const report = {
    validatedAt: new Date().toISOString(),
    result: errors.length === 0 ? "pass" : "fail",
    counts: { states: states.features.length, historicalDistrictParents: districtEntries.length, districts: allDistrictIds.size },
    bytes: { statesGeojson: stateGeojsonBytes, statesTopojson: stateTopojsonBytes, statesTopojsonGzip: stateTopojsonGzipBytes },
    districtsByParent: perState,
    errors,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
