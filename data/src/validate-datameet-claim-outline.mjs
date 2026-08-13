import { readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { geoArea } from "d3-geo";
import { feature as topoFeature } from "topojson-client";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "..");
const outputDir = join(dataDir, "generated", "datameet-current-claim-outline");
const historicalParentId = "in-hs-01-jammu-and-kashmir";

function walkCoordinates(coordinates, visit) {
  if (typeof coordinates[0] === "number") return visit(coordinates);
  coordinates.forEach((coordinate) => walkCoordinates(coordinate, visit));
}
function boundsOf(geometry) {
  const bounds = { minLongitude: Infinity, minLatitude: Infinity, maxLongitude: -Infinity, maxLatitude: -Infinity };
  walkCoordinates(geometry.coordinates, ([longitude, latitude]) => {
    bounds.minLongitude = Math.min(bounds.minLongitude, longitude);
    bounds.minLatitude = Math.min(bounds.minLatitude, latitude);
    bounds.maxLongitude = Math.max(bounds.maxLongitude, longitude);
    bounds.maxLatitude = Math.max(bounds.maxLatitude, latitude);
  });
  return bounds;
}

async function main() {
  const errors = [];
  const topologyPath = join(outputDir, "outline.topo.json");
  const topology = JSON.parse(await readFile(topologyPath, "utf8"));
  const decodedSource = topoFeature(topology, topology.objects.outline);
  const decoded = decodedSource.type === "FeatureCollection" ? decodedSource.features[0] : decodedSource;
  if (decoded.type !== "Feature" || decoded.properties?.id !== "in-datameet-current-claim-outline") errors.push("Expected a single correctly identified claim-outline feature.");
  const bounds = boundsOf(decoded.geometry);
  // Cross-checked with the current official SoI outline: these guards cover the
  // required western/northern extent without claiming the DataMeet line is official.
  if (bounds.minLongitude > 69) errors.push(`Western extent too truncated: ${bounds.minLongitude}.`);
  if (bounds.maxLongitude < 97) errors.push(`Eastern extent too truncated: ${bounds.maxLongitude}.`);
  if (bounds.maxLatitude < 37) errors.push(`Northern extent too truncated: ${bounds.maxLatitude}.`);
  if (bounds.minLatitude > 7) errors.push(`Southern extent too truncated: ${bounds.minLatitude}.`);
  const area = geoArea(decoded);
  if (area <= 0 || area > 1) errors.push(`Implausible spherical area: ${area}.`);
  const bytes = (await stat(topologyPath)).size;
  const gzipBytes = gzipSync(await readFile(topologyPath)).byteLength;
  if (bytes > 250_000 || gzipBytes > 100_000) errors.push("Claim outline exceeds overlay budget.");
  const manifest = JSON.parse(await readFile(join(outputDir, "manifest.json"), "utf8"));
  const checksum = createHash("sha256").update(await readFile(topologyPath)).digest("hex");
  if (manifest.output?.sha256 !== checksum) errors.push("Claim outline checksum does not match manifest.");
  if (!Array.isArray(topology.objects.outline?.geometries) || topology.objects.outline.geometries.length !== 1) errors.push("Claim outline TopoJSON must contain exactly one feature.");
  // A single merged feature must not retain state borders: a single polygon outline
  // may be multipart for islands, but not a GeometryCollection or state feature set.
  if (!["Polygon", "MultiPolygon"].includes(decoded.geometry?.type)) errors.push("Claim outline must decode to Polygon or MultiPolygon, not a state collection.");
  const historicalEntry = manifest.historicalParentOverlays?.[historicalParentId];
  if (!historicalEntry) {
    errors.push(`Missing historical parent overlay manifest entry for ${historicalParentId}.`);
  } else {
    const historicalPath = join(outputDir, historicalEntry.topology);
    const historicalTopology = JSON.parse(await readFile(historicalPath, "utf8"));
    const historicalDecodedSource = topoFeature(historicalTopology, historicalTopology.objects.outline);
    const historicalDecoded = historicalDecodedSource.type === "FeatureCollection" ? historicalDecodedSource.features[0] : historicalDecodedSource;
    const historicalBounds = boundsOf(historicalDecoded.geometry);
    const historicalArea = geoArea(historicalDecoded);
    const historicalChecksum = createHash("sha256").update(await readFile(historicalPath)).digest("hex");
    if (!Array.isArray(historicalTopology.objects.outline?.geometries) || historicalTopology.objects.outline.geometries.length !== 1) errors.push("Historical Jammu & Kashmir reference outline must contain exactly one merged feature.");
    if (historicalDecoded.properties?.id !== `${historicalParentId}-current-claim-reference-outline` || historicalDecoded.properties?.parentId !== historicalParentId) errors.push("Historical parent reference outline identity is invalid.");
    if (historicalDecoded.properties?.status !== "reference-outline; non-statistical; data-unavailable") errors.push("Historical parent reference outline must remain value-free/data-unavailable.");
    if (!["Polygon", "MultiPolygon"].includes(historicalDecoded.geometry?.type)) errors.push("Historical parent reference outline must be a merged Polygon or MultiPolygon.");
    if (historicalBounds.minLongitude > 73 || historicalBounds.maxLongitude < 80 || historicalBounds.maxLatitude < 37 || historicalBounds.minLatitude > 32.5) errors.push(`Historical Jammu & Kashmir reference outline fails current J&K + Ladakh extent checks: ${JSON.stringify(historicalBounds)}.`);
    if (historicalArea <= 0 || historicalArea > 1) errors.push(`Historical Jammu & Kashmir reference outline has implausible spherical area: ${historicalArea}.`);
    if (historicalEntry.sha256 !== historicalChecksum) errors.push("Historical parent reference outline checksum does not match manifest.");
    if (!historicalEntry.sourceFeatures?.includes("Jammu & Kashmir") || !historicalEntry.sourceFeatures?.includes("Ladakh")) errors.push("Historical parent reference source features must explicitly include Jammu & Kashmir and Ladakh.");
    historicalEntry.validation = { featureCount: historicalTopology.objects.outline?.geometries?.length, bounds: historicalBounds, sphericalArea: historicalArea, checksum: historicalChecksum };
  }
  const report = { result: errors.length ? "fail" : "pass", featureCount: topology.objects.outline?.geometries?.length, bounds, sphericalArea: area, bytes, gzipBytes, checksum, historicalParentOverlay: manifest.historicalParentOverlays?.[historicalParentId]?.validation, errors };
  await writeFile(join(outputDir, "validation-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (errors.length) process.exitCode = 1;
}
main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
