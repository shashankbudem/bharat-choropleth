import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { topology } from "topojson-server";
import { feature as topoFeature, merge } from "topojson-client";
import { presimplify, simplify } from "topojson-simplify";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "..");
const outputDir = join(dataDir, "generated", "current-2019-states");
// This is an independently sourced current-vintage layer, deliberately outside
// the DataMeet Census-2011 checkout used by prepare-boundaries.mjs.
const sourceDir = resolve(
  process.env.INDIA_SHAPEFILES_DIR || join(dataDir, "../../../work/india-shapefiles"),
);
const sourcePath = join(sourceDir, "INDIA", "INDIA_STATES.geojson");
const commit = process.env.INDIA_SHAPEFILES_COMMIT || "2c028f5c30fb4191ca1639ff136b152cecdbb69f";

// Dadra & Nagar Haveli (source State_LGD 26) and Daman & Diu (source State_LGD 25) were
// merged into one union territory in 2020. The source file predates that merger and still
// carries them as two features; this bundle dissolves them into the current single UT.
const mergedUnionTerritory = {
  sourceLgdCodes: [25, 26],
  lgdCode: 26,
  name: "Dadra and Nagar Haveli and Daman and Diu",
};

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

function paddedLgdCode(value) {
  const code = String(value);
  if (!/^\d+$/.test(code)) throw new Error(`Expected a numeric State_LGD code, got “${code}”.`);
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
  // D3's spherical polygon convention expects exteriors to wind clockwise.
  return ringArea(deduplicated) > 0 ? deduplicated.reverse() : deduplicated;
}

function cleanSimplifiedGeometry(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const cleaned = polygons
    .map((polygon) => {
      const exterior = cleanExteriorRing(polygon[0]);
      // Holes are excluded from the display asset, matching the Census-2011 bundle's treatment.
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
 * Below this share of its original area, a feature has been simplified into
 * something unrecognisable and the unsimplified outline is kept instead.
 * Andaman & Nicobar and Lakshadweep were coming through as four- to nine-point
 * blobs, which look crude on the map and grotesque if a renderer scales them up.
 */
const MIN_RETAINED_AREA_SHARE = 0.5;

function featuresOf(unpacked) {
  return unpacked.type === "FeatureCollection" ? unpacked.features : [unpacked];
}

function optimizedTopology(objects, retainedVertexShare = 0.005) {
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

  // The unsimplified (quantization-only) geometry, kept as a fallback below.
  const unsimplifiedById = new Map(
    featuresOf(topoFeature(raw, raw.objects[objectName])).map((feature) => [feature.properties.id, feature.geometry]),
  );
  // And the true source geometry, for anything quantization alone also erases.
  const sourceById = new Map(objects[objectName].features.map((feature) => [feature.properties.id, feature.geometry]));

  const features = featuresOf(topoFeature(simplified, simplified.objects[objectName])).map((feature) => {
    const id = feature.properties.id;
    let geometry = cleanSimplifiedGeometry(feature.geometry);

    // A whole feature must never be simplified out of existence. Lakshadweep is
    // 35 islands averaging five vertices each: every ring collapses below three
    // distinct points at this threshold, the degenerate-ring cleanup drops them
    // all, and the UT silently ships with no geometry at all. Falling back keeps
    // the vertex budget for the mainland while never losing a region — the same
    // intent as the retained-vertex share chosen for the Nicobar islands.
    if (geometry.coordinates.length === 0) {
      geometry = cleanSimplifiedGeometry(unsimplifiedById.get(id));
    }
    // Not erased, but crushed: keep the fuller outline for island groups whose
    // shape simplification has all but thrown away.
    const originalArea = totalRingArea(unsimplifiedById.get(id));
    if (originalArea > 0 && totalRingArea(geometry) < originalArea * MIN_RETAINED_AREA_SHARE) {
      geometry = cleanSimplifiedGeometry(unsimplifiedById.get(id));
    }
    if (geometry.coordinates.length === 0) {
      geometry = cleanSimplifiedGeometry(sourceById.get(id));
    }
    if (geometry.coordinates.length === 0) {
      throw new Error(`Feature ${id} has no usable geometry even before simplification — check the source data.`);
    }
    return { ...feature, geometry };
  });

  // Re-topologise the cleaned result: zero-area rings and invalid windings are
  // removed before emitting the distributable TopoJSON.
  return topology({ [objectName]: featureCollection(features) }, 20000);
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const sourceCollection = JSON.parse(await readFile(sourcePath, "utf8"));
  if (sourceCollection.type !== "FeatureCollection") {
    throw new Error(`Expected a GeoJSON FeatureCollection at ${sourcePath}.`);
  }

  const rawTopology = topology({ source: sourceCollection });
  const sourceGeometries = rawTopology.objects.source.geometries;
  const byLgd = new Map(sourceGeometries.map((geometry) => [geometry.properties.State_LGD, geometry]));

  const toMerge = mergedUnionTerritory.sourceLgdCodes.map((lgd) => {
    const geometry = byLgd.get(lgd);
    if (!geometry) throw new Error(`Expected source feature with State_LGD ${lgd} for the merged union territory.`);
    return geometry;
  });
  const mergedGeometry = merge(rawTopology, toMerge);
  const mergedFeature = {
    type: "Feature",
    id: `in-cs-${paddedLgdCode(mergedUnionTerritory.lgdCode)}-${normalizedSlug(mergedUnionTerritory.name)}`,
    properties: {
      id: `in-cs-${paddedLgdCode(mergedUnionTerritory.lgdCode)}-${normalizedSlug(mergedUnionTerritory.name)}`,
      name: mergedUnionTerritory.name,
      slug: normalizedSlug(mergedUnionTerritory.name),
      lgdCode: mergedUnionTerritory.lgdCode,
      administrativeVintage: "current (source mergers: Dadra & Nagar Haveli LGD 25/26 dissolved into one UT)",
    },
    geometry: mergedGeometry,
  };

  const standaloneFeatures = sourceGeometries
    .filter((geometry) => !mergedUnionTerritory.sourceLgdCodes.includes(geometry.properties.State_LGD))
    .map((geometry) => {
      const decoded = topoFeature(rawTopology, geometry);
      const name = text(geometry.properties.STNAME_SH) || text(geometry.properties.STNAME);
      const lgdCode = geometry.properties.State_LGD;
      const id = `in-cs-${paddedLgdCode(lgdCode)}-${normalizedSlug(name)}`;
      return {
        type: "Feature",
        id,
        properties: {
          id,
          name,
          slug: normalizedSlug(name),
          lgdCode,
          administrativeVintage: "current",
          source: geometry.properties,
        },
        geometry: decoded.geometry,
      };
    });

  const states = [...standaloneFeatures, mergedFeature].sort((a, b) => a.id.localeCompare(b.id));
  const stateCollection = featureCollection(states);
  const stateGeoJsonPath = join(outputDir, "states.geojson");
  const stateTopoJsonPath = join(outputDir, "states.topo.json");
  await writeJson(stateGeoJsonPath, stateCollection);
  // This bundle has only 36 features sharing the size budget (versus 640 Census
  // districts), so a much higher retained-vertex share still lands well under
  // budget while keeping the small southern Nicobar islands intact.
  const retainedVertexShare = 0.08;
  await writeJson(stateTopoJsonPath, optimizedTopology({ states: stateCollection }, retainedVertexShare));

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      provider: "datta07 / INDIAN-SHAPEFILES contributors",
      repository: "https://github.com/datta07/INDIAN-SHAPEFILES",
      commit,
      input: "INDIA/INDIA_STATES.geojson",
      inputSha256: await sha256(sourcePath),
      license: "MIT",
      attribution: "State/UT boundaries derived from datta07/INDIAN-SHAPEFILES (MIT).",
      statement: "Independently sourced current (~2019-vintage per upstream) state/UT boundary layer. It is not derived from, and must not be joined by name to, the Census-2011 district geometry in generated/census-2011.",
    },
    transformation: {
      method: "topojson-server topology of the 37 source features → merge Dadra & Nagar Haveli + Daman & Diu into one current UT → topology-preserving simplification → degenerate-ring removal and exterior-winding cleanup → per-feature fallback to unsimplified geometry for any region simplification would erase entirely (Lakshadweep) → final topology output",
      quantization: 20000,
      retainedVertexShare,
      mergedUnionTerritory,
    },
    identity: {
      state: "in-cs-{zero-padded State_LGD code}-{normalized short state/UT name}",
      warning: "Use id for joins; slug is for display/search only. lgdCode is the source's official Local Government Directory code. This bundle is independently versioned from the historical in-hs- Census-2011 bundle; ids are not compatible between the two.",
    },
    assets: {
      states: { topojson: "states.topo.json", debugGeojson: "states.geojson", featureCount: states.length },
    },
    outputSha256: {
      statesGeojson: await sha256(stateGeoJsonPath),
      statesTopojson: await sha256(stateTopoJsonPath),
    },
    bytes: {
      statesTopojson: await byteSize(stateTopoJsonPath),
    },
  };
  await writeJson(join(outputDir, "manifest.json"), manifest);
  console.log(`Prepared ${states.length} current state/UT regions from ${sourceDir}.`);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
