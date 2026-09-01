import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { geoArea } from "d3-geo";
import { feature as topojsonFeature } from "topojson-client";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "..");
const generated = join(dataDir, "generated", "current-2019-districts");
const reportPath = join(dataDir, "metadata", "current-2019-districts-validation-report.json");
const expectedDistrictCount = 788;
const jkStateId = "in-cs-01-jammu-and-kashmir";
// The transformation settings the generated bundle is expected to have been built
// with. Asserted so that changing a simplification constant cannot quietly reshape
// published geometry while every other check here still passes.
const expectedMinFeatureVertices = 60;
const expectedTransformation = { retainedVertexShare: 0.05, minFeatureVertices: expectedMinFeatureVertices, minFeatureVertexShare: 0.08 };
// Shape fidelity. Nothing else in this file can tell a district from a polygon
// standing in for one — counts, ids, checksums, winding and bounds all stay valid
// while an outline degrades. An earlier revision simplified each file at a flat 5%
// retained-vertex share; because that share is a percentile over the whole file's arc
// weights, it was set by the districts carrying the most detail and then applied to
// those carrying the least, and 80 of 788 districts came out at 20 vertices or fewer
// (7 at 8 or fewer), with J&K and Himachal Pradesh worst hit.
//
// A total-vertex floor alone would not have caught that: 87,615 total vertices reads
// as healthy while a tenth of the features are blobs. The per-feature caps are what
// encode the floor; the total is a backstop against wholesale loss. The bundle holds
// 164,237 vertices.
const MIN_TOTAL_VERTICES = 150_000;
const DEGENERATE_VERTEX_COUNT = 30;
const MAX_DEGENERATE_FEATURES = 3;
// A district may fall below the prepare script's per-feature floor only where the
// source gives it less to keep. Five do — Shahadara (35), Dimapur (42), North East
// (43), Diu (49) and Mumbai (52) — and each is retained whole.
const MAX_BELOW_FEATURE_FLOOR = 12;
// The J&K reference overlay is built by the same simplification path as the districts,
// so it can degrade the same way. Its other checks — one feature, parentId, status,
// checksum — would all pass on a triangle, so its shape needs asserting too. It holds
// 75 vertices.
const MIN_OVERLAY_VERTICES = 40;

function countVertices(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates ?? [];
  return polygons.reduce((total, polygon) => total + polygon.reduce((sum, ring) => sum + ring.length, 0), 0);
}

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

  const districtEntries = Object.entries(manifest.assets.districts);
  const allDistrictIds = new Set();
  const perState = {};
  let totalVertices = 0;
  let degenerateFeatures = 0;
  let belowFeatureFloor = 0;

  for (const [parentId, entry] of districtEntries) {
    if (!parentId.startsWith("in-cs-")) errors.push(`District asset key is not a current-state id: ${parentId}.`);
    const topoPath = join(generated, entry.topojson);
    const topo = await readJson(topoPath);
    if (topo.type !== "Topology" || !topo.objects?.districts) {
      errors.push(`${parentId}: missing expected Topology object districts.`);
      continue;
    }
    const converted = topojsonFeature(topo, topo.objects.districts);
    const features = converted.type === "FeatureCollection" ? converted.features : [converted];
    if (features.length !== entry.featureCount) {
      errors.push(`${parentId}: TopoJSON feature count ${features.length} differs from manifest ${entry.featureCount}.`);
    }
    perState[parentId] = features.length;
    for (const item of features) {
      const { id, parentId: featureParentId, name, slug, lgdCode } = item.properties || {};
      if (!id || !featureParentId || !name || !slug || lgdCode === undefined) errors.push(`District feature missing identity fields: ${item.id || "unknown"}.`);
      if (!id?.startsWith("in-cd-")) errors.push(`District id is not in the current-district namespace: ${id}.`);
      if (featureParentId !== parentId) errors.push(`${id}: parentId ${featureParentId} conflicts with its lazy-load asset ${parentId}.`);
      if (allDistrictIds.has(id)) errors.push(`Duplicate district id: ${id}.`);
      allDistrictIds.add(id);
      const sphericalArea = geoArea(item);
      if (sphericalArea > 1) errors.push(`district ${id}: implausibly large spherical area (${sphericalArea}); likely inverted ring winding.`);
      const vertices = countVertices(item.geometry);
      totalVertices += vertices;
      if (vertices <= DEGENERATE_VERTEX_COUNT) degenerateFeatures += 1;
      if (vertices < expectedMinFeatureVertices) belowFeatureFloor += 1;
      validateGeometry(item.geometry, `district ${id}`, errors);
    }
    const checksum = await sha256(topoPath);
    if (entry.sha256 !== checksum) errors.push(`${parentId}: checksum does not match manifest.`);
  }

  // Every current-state must have a matching district asset — this bundle has no
  // district-less states, unlike the historical Census-2011 bundle's Lakshadweep gap.
  const currentStatesTopo = await readJson(join(dataDir, "generated", "current-2019-states", "states.topo.json"));
  const currentStatesFeatures = topojsonFeature(currentStatesTopo, currentStatesTopo.objects.states);
  const allCurrentStateIds = new Set(currentStatesFeatures.features.map((f) => f.properties.id));
  for (const stateId of allCurrentStateIds) {
    if (!manifest.assets.districts[stateId]) errors.push(`current-state ${stateId} has no matching district asset.`);
  }
  for (const parentId of Object.keys(manifest.assets.districts)) {
    if (!allCurrentStateIds.has(parentId)) errors.push(`District asset ${parentId} has no matching current-state feature.`);
  }

  const diskDistrictFiles = (await readdir(join(generated, "districts"))).filter((file) => file.endsWith(".topo.json"));
  if (diskDistrictFiles.length !== districtEntries.length) errors.push("District TopoJSON files and manifest entries differ.");

  const totalBytes = await Promise.all(districtEntries.map(([, entry]) => stat(join(generated, entry.topojson)).then((info) => info.size)));
  const totalGzipBytes = await Promise.all(districtEntries.map(([, entry]) => readFile(join(generated, entry.topojson)).then((buffer) => gzipSync(buffer).byteLength)));

  if (allDistrictIds.size !== expectedDistrictCount) errors.push(`Expected ${expectedDistrictCount} current districts; found ${allDistrictIds.size}.`);
  // Mirpur and Muzaffarabad (Pakistan-administered) must never appear as ordinary
  // value-bearing districts in J&K's district set.
  if (allDistrictIds.has("in-cd-01-260") || allDistrictIds.has("in-cd-01-261")) {
    errors.push("Mirpur/Muzaffarabad (Pakistan-administered) must not appear as value-bearing districts.");
  }

  const overlayEntry = manifest.assets.districtReferenceOverlays?.[jkStateId];
  if (!overlayEntry) {
    errors.push(`Missing J&K district reference overlay manifest entry for ${jkStateId}.`);
  } else {
    const overlayPath = join(generated, overlayEntry.topojson);
    const overlayTopology = await readJson(overlayPath);
    const overlayDecodedSource = topojsonFeature(overlayTopology, overlayTopology.objects.outline);
    const overlayDecoded = overlayDecodedSource.type === "FeatureCollection" ? overlayDecodedSource.features[0] : overlayDecodedSource;
    if (!Array.isArray(overlayTopology.objects.outline?.geometries) || overlayTopology.objects.outline.geometries.length !== 1) errors.push("J&K district reference overlay must contain exactly one merged feature.");
    if (overlayDecoded.properties?.parentId !== jkStateId) errors.push("J&K district reference overlay parentId is invalid.");
    if (overlayDecoded.properties?.status !== "reference-outline; non-statistical; data-unavailable") errors.push("J&K district reference overlay must remain value-free/data-unavailable.");
    if (!["Polygon", "MultiPolygon"].includes(overlayDecoded.geometry?.type)) errors.push("J&K district reference overlay must be a merged Polygon or MultiPolygon.");
    const overlayChecksum = await sha256(overlayPath);
    if (overlayEntry.sha256 !== overlayChecksum) errors.push("J&K district reference overlay checksum does not match manifest.");
    if (!overlayEntry.sourceFeatures?.includes("Mirpur") || !overlayEntry.sourceFeatures?.includes("Muzaffarabad")) errors.push("J&K district reference overlay source features must explicitly include Mirpur and Muzaffarabad.");
    const overlayVertices = overlayDecoded.geometry ? countVertices(overlayDecoded.geometry) : 0;
    if (overlayVertices < MIN_OVERLAY_VERTICES) {
      errors.push(`J&K district reference overlay holds ${overlayVertices} vertices, under the ${MIN_OVERLAY_VERTICES} floor; its outline has been simplified away.`);
    }
  }

  // Shape fidelity — see MIN_TOTAL_VERTICES. These are the only checks here that can
  // see geometry being simplified away underneath an otherwise valid bundle.
  if (totalVertices < MIN_TOTAL_VERTICES) {
    errors.push(`Bundle holds ${totalVertices} vertices, under the ${MIN_TOTAL_VERTICES} floor; geometry has been simplified away.`);
  }
  if (degenerateFeatures > MAX_DEGENERATE_FEATURES) {
    errors.push(`${degenerateFeatures} districts have ${DEGENERATE_VERTEX_COUNT} or fewer vertices, over the ${MAX_DEGENERATE_FEATURES} allowed.`);
  }
  if (belowFeatureFloor > MAX_BELOW_FEATURE_FLOOR) {
    errors.push(`${belowFeatureFloor} districts fall below the ${expectedMinFeatureVertices}-vertex per-feature floor, over the ${MAX_BELOW_FEATURE_FLOOR} the source itself accounts for.`);
  }
  for (const [field, expected] of Object.entries(expectedTransformation)) {
    if (manifest.transformation?.[field] !== expected) errors.push(`manifest.transformation.${field} is ${manifest.transformation?.[field]}; expected ${expected}.`);
  }

  const report = {
    validatedAt: new Date().toISOString(),
    result: errors.length === 0 ? "pass" : "fail",
    counts: { currentStates: allCurrentStateIds.size, districtParents: districtEntries.length, districts: allDistrictIds.size },
    bytes: { totalTopojson: totalBytes.reduce((sum, value) => sum + value, 0), totalTopojsonGzip: totalGzipBytes.reduce((sum, value) => sum + value, 0) },
    shape: { totalVertices, degenerateFeatures, belowFeatureFloor },
    districtsByParent: perState,
    districtReferenceOverlay: manifest.assets.districtReferenceOverlays?.[jkStateId] ? "present" : "missing",
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
