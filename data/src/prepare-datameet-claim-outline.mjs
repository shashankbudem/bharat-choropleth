import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as shapefile from "shapefile";
import { feature as topoFeature, merge } from "topojson-client";
import { topology } from "topojson-server";
import { presimplify, simplify } from "topojson-simplify";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "..");
const sourceDir = resolve(process.env.DATAMEET_MAPS_DIR || join(dataDir, "../../../work/datameet-maps"));
const sourcePath = join(sourceDir, "States", "Admin2.shp");
const outputDir = join(dataDir, "generated", "datameet-current-claim-outline");
const commit = process.env.DATAMEET_COMMIT || "b3fbbde595310b397a55d718e0958ce249a4fa1f";

function ringArea(ring) {
  return ring.slice(0, -1).reduce((area, point, index) => {
    const next = ring[index + 1];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

function cleanExteriorRing(ring) {
  const points = ring.reduce((deduplicated, point) => {
    const prior = deduplicated.at(-1);
    if (!prior || prior[0] !== point[0] || prior[1] !== point[1]) deduplicated.push(point);
    return deduplicated;
  }, []);
  if (points.length < 3) return null;
  const first = points[0];
  const last = points.at(-1);
  if (first[0] !== last[0] || first[1] !== last[1]) points.push([...first]);
  if (new Set(points.slice(0, -1).map((point) => point.join(","))).size < 3 || Math.abs(ringArea(points)) < 1e-8) return null;
  return ringArea(points) > 0 ? points.reverse() : points;
}

function cleanGeometry(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return {
    type: "MultiPolygon",
    coordinates: polygons.map((polygon) => cleanExteriorRing(polygon[0])).filter(Boolean).map((ring) => [ring]),
  };
}

function optimizedOutline(feature) {
  const raw = topology({ outline: { type: "FeatureCollection", features: [feature] } }, 20000);
  const weighted = presimplify(raw);
  const weights = weighted.arcs.flat().map((point) => point[2]).filter(Number.isFinite).sort((a, b) => a - b);
  const threshold = weights[Math.max(0, Math.floor(weights.length * 0.995) - 1)] || 0;
  const simplified = simplify(weighted, threshold);
  const decoded = topoFeature(simplified, simplified.objects.outline);
  const outlineFeature = decoded.type === "FeatureCollection" ? decoded.features[0] : decoded;
  const cleaned = {
    ...outlineFeature,
    geometry: cleanGeometry(outlineFeature.geometry),
  };
  return topology({ outline: { type: "FeatureCollection", features: [cleaned] } }, 20000);
}

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

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function main() {
  const reader = await shapefile.open(sourcePath);
  const states = [];
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    states.push(result.value);
  }
  const stateTopology = topology({ states: { type: "FeatureCollection", features: states } });
  const claimGeometry = merge(stateTopology, stateTopology.objects.states.geometries);
  const sourceFeature = {
    type: "Feature",
    id: "in-datameet-current-claim-outline",
    properties: {
      id: "in-datameet-current-claim-outline",
      name: "India claimed-territory outline (DataMeet current-state overlay)",
      status: "reference-outline; non-statistical; data-unavailable",
      source: "DataMeet maps / States/Admin2.shp",
    },
    geometry: claimGeometry,
  };
  const output = optimizedOutline(sourceFeature);
  const decodedOutput = topoFeature(output, output.objects.outline);
  const feature = decodedOutput.type === "FeatureCollection" ? decodedOutput.features[0] : decodedOutput;
  const bounds = boundsOf(feature.geometry);
  await mkdir(outputDir, { recursive: true });
  const topologyPath = join(outputDir, "outline.topo.json");
  await writeFile(topologyPath, `${JSON.stringify(output)}\n`);
  const currentJammuKashmirAndLadakh = stateTopology.objects.states.geometries.filter((geometry) => (
    ["Jammu & Kashmir", "Ladakh"].includes(geometry.properties.ST_NM)
  ));
  if (currentJammuKashmirAndLadakh.length !== 2) {
    throw new Error(`Expected current Jammu & Kashmir and Ladakh source features; found ${currentJammuKashmirAndLadakh.length}.`);
  }
  const historicalParentId = "in-hs-01-jammu-and-kashmir";
  const historicalReferenceFeature = {
    type: "Feature",
    id: `${historicalParentId}-current-claim-reference-outline`,
    properties: {
      id: `${historicalParentId}-current-claim-reference-outline`,
      parentId: historicalParentId,
      name: "Jammu & Kashmir Census-2011 parent current-claim reference outline",
      status: "reference-outline; non-statistical; data-unavailable",
      source: "DataMeet maps / States/Admin2.shp; merged current Jammu & Kashmir + Ladakh",
    },
    geometry: merge(stateTopology, currentJammuKashmirAndLadakh),
  };
  const historicalReferenceTopology = optimizedOutline(historicalReferenceFeature);
  const historicalReferenceDecodedSource = topoFeature(historicalReferenceTopology, historicalReferenceTopology.objects.outline);
  const historicalReferenceDecoded = historicalReferenceDecodedSource.type === "FeatureCollection"
    ? historicalReferenceDecodedSource.features[0]
    : historicalReferenceDecodedSource;
  const historicalReferenceBounds = boundsOf(historicalReferenceDecoded.geometry);
  const historicalReferencePath = join(outputDir, "historical-parent-overlays", `${historicalParentId}.topo.json`);
  await mkdir(dirname(historicalReferencePath), { recursive: true });
  await writeFile(historicalReferencePath, `${JSON.stringify(historicalReferenceTopology)}\n`);
  await writeFile(join(outputDir, "manifest.json"), `${JSON.stringify({
    schemaVersion: 1,
    source: {
      provider: "DataMeet India community",
      repository: "https://github.com/datameet/maps",
      commit,
      input: "States/Admin2.shp",
      inputSha256: await sha256(sourcePath),
      license: "CC BY 4.0 (DataMeet repository default; no state-specific override found)",
      attribution: "India boundaries by DataMeet India community (CC BY 4.0)",
      statement: "This is DataMeet geometry selected as an openly licensed reference overlay aligned to the official Indian depiction; it is not Survey of India data and is not an administrative/statistical data layer.",
    },
    transformation: {
      method: "topojson-server topology of the 36 current state/UT source features → topojson-client merge (eliminates internal state arcs) → topology-preserving simplification → degenerate-ring removal and exterior-winding cleanup → final topology output",
      quantization: 20000,
      retainedVertexShare: 0.005,
    },
    output: {
      topology: "outline.topo.json",
      object: "outline",
      id: feature.properties.id,
      status: feature.properties.status,
      featureCount: 1,
      sha256: await sha256(topologyPath),
      bytes: (await stat(topologyPath)).size,
      bounds,
    },
    historicalParentOverlays: {
      [historicalParentId]: {
        topology: `historical-parent-overlays/${historicalParentId}.topo.json`,
        object: "outline",
        id: historicalReferenceDecoded.properties.id,
        parentId: historicalParentId,
        status: historicalReferenceDecoded.properties.status,
        sourceFeatures: ["Jammu & Kashmir", "Ladakh"],
        statement: "Reference-only current claim overlay for the historical Census-2011 Jammu & Kashmir parent. The 22 Census district features remain the only value-bearing districts; this overlay must be hatched/data-unavailable.",
        sha256: await sha256(historicalReferencePath),
        bytes: (await stat(historicalReferencePath)).size,
        bounds: historicalReferenceBounds,
      },
    },
  }, null, 2)}\n`);
  console.log(`Prepared DataMeet current claim outline from ${states.length} states/UTs.`);
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
