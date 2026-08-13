import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as shapefile from "shapefile";
import { topology } from "topojson-server";
import { feature as topoFeature, merge } from "topojson-client";
import { presimplify, quantile, simplify } from "topojson-simplify";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "..");
const outputDir = join(dataDir, "generated", "census-2011");
const districtDir = join(outputDir, "districts");
const sourceDir = resolve(
  process.env.DATAMEET_MAPS_DIR || join(dataDir, "../../../work/datameet-maps"),
);

const inputs = {
  currentStates: join(sourceDir, "States", "Admin2.shp"),
  districts: join(sourceDir, "Districts", "Census_2011", "2011_Dist.shp"),
};

const commit = process.env.DATAMEET_COMMIT || "b3fbbde595310b397a55d718e0958ce249a4fa1f";
const excludedSentinels = [{ stateCode: "99", districtCode: "99", districtName: "Data Not Available" }];

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function pick(properties, candidates) {
  for (const field of candidates) {
    const value = text(properties[field]);
    if (value) return value;
  }
  return "";
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

function paddedCode(value, width = 2) {
  const code = text(value);
  if (!/^\d+$/.test(code)) throw new Error(`Expected a numeric Census code, got “${code}”.`);
  return code.padStart(width, "0");
}

function selectState(feature) {
  const stateName = pick(feature.properties, ["ST_NM", "STATE", "STATE_NAME", "NAME_1", "st_nm"]);
  if (!stateName) {
    throw new Error(`State feature lacks a name: ${JSON.stringify(feature.properties)}`);
  }
  return {
    id: `in-s-${normalizedSlug(stateName)}`,
    name: stateName,
    slug: normalizedSlug(stateName),
  };
}

function selectDistrict(feature) {
  const stateName = pick(feature.properties, ["ST_NM", "STATE", "STATE_NAME", "st_nm"]);
  const stateCode = pick(feature.properties, ["ST_CEN_CD", "ST_CODE", "STATE_CODE", "st_cen_cd"]);
  const districtName = pick(feature.properties, ["DISTRICT", "DIST_NAME", "DIST_NAME_", "DISTRICT_N", "district"]);
  const districtCode = pick(feature.properties, ["DT_CEN_CD", "DT_CODE", "DIST_CODE", "dt_cen_cd"]);
  if (!stateName || !stateCode || !districtName || !districtCode) {
    throw new Error(`District feature lacks expected Census fields: ${JSON.stringify(feature.properties)}`);
  }
  // This is intentionally a historical source partition, not a current state/UT id.
  // DataMeet's district layer is Census-2011 vintage and cannot safely be merged into
  // newer entities (notably Telangana, Ladakh, and the merged DNHDD UT).
  const parentId = `in-hs-${paddedCode(stateCode)}-${normalizedSlug(stateName)}`;
  return {
    id: `in-d${paddedCode(stateCode)}-${paddedCode(districtCode)}`,
    parentId,
    name: districtName,
    slug: normalizedSlug(districtName),
    sourceStateName: stateName,
    sourceStateCode: text(stateCode),
    sourceDistrictCode: text(districtCode),
  };
}

function isExcludedSentinel(feature) {
  const stateCode = paddedCode(pick(feature.properties, ["ST_CEN_CD", "ST_CODE", "STATE_CODE", "st_cen_cd"]));
  const districtCode = paddedCode(pick(feature.properties, ["DT_CEN_CD", "DT_CODE", "DIST_CODE", "dt_cen_cd"]));
  const districtName = normalizedSlug(pick(feature.properties, ["DISTRICT", "DIST_NAME", "DIST_NAME_", "DISTRICT_N", "district"]));
  return stateCode === "99" && districtCode === "99" && districtName === "data-not-available";
}

async function readFeatures(path) {
  const source = await shapefile.open(path);
  const features = [];
  while (true) {
    const result = await source.read();
    if (result.done) return features;
    features.push(result.value);
  }
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
  const area = ringArea(deduplicated);
  if (Math.abs(area) < 1e-8) return null;
  // D3's spherical polygon convention expects exteriors to wind clockwise.
  return area > 0 ? deduplicated.reverse() : deduplicated;
}

function cleanSimplifiedGeometry(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const cleaned = polygons
    .map((polygon) => {
      const exterior = cleanExteriorRing(polygon[0]);
      // Holes are excluded from the display asset. This prevents topological
      // simplification from turning tiny internal rings into inverted exteriors.
      return exterior ? [exterior] : null;
    })
    .filter(Boolean);
  return { type: "MultiPolygon", coordinates: cleaned };
}

function optimizedTopology(objects, retainedVertexShare = 0.005) {
  // 20,000-step quantization, 0.5% retained vertices: display-grade geometry. Originals remain
  // reproducible from the pinned source and are deliberately not published as assets.
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
  const unpacked = topoFeature(simplified, simplified.objects[objectName]);
  const features = (unpacked.type === "FeatureCollection" ? unpacked.features : [unpacked]).map((feature) => ({
    ...feature,
    geometry: cleanSimplifiedGeometry(feature.geometry),
  }));
  // Re-topologise the cleaned result: zero-area rings and invalid windings are
  // removed before emitting the distributable TopoJSON.
  return topology({ [objectName]: featureCollection(features) }, 20000);
}

async function main() {
  await mkdir(districtDir, { recursive: true });
  // Migrate outputs from pre-`census-2011` layouts without deleting them: this is
  // intentionally a recoverable move because workspaces can contain user artifacts.
  const legacyDir = join(dataDir, "work", "legacy-generated-artifacts");
  const legacyNames = ["districts", "manifest.json", "states.geojson", "states.topo.json"];
  for (const name of legacyNames) {
    try {
      await stat(join(dataDir, "generated", name));
      await mkdir(legacyDir, { recursive: true });
      await writeFile(join(legacyDir, "README.txt"), "Moved automatically by data preparation. These pre-census-2011 artifacts are not part of the release bundle.\n");
      // Do not overwrite a previous recovery copy. A collision preserves both the
      // legacy source and its recovery directory so a human can resolve it safely.
      try {
        await stat(join(legacyDir, name));
        continue;
      } catch (legacyError) {
        if (legacyError.code !== "ENOENT") throw legacyError;
      }
      const { rename } = await import("node:fs/promises");
      await rename(join(dataDir, "generated", name), join(legacyDir, name));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const rawDistricts = await readFeatures(inputs.districts);
  const filteredRawDistricts = rawDistricts.filter((feature) => !isExcludedSentinel(feature));
  const districts = filteredRawDistricts.map((feature) => {
    const identity = selectDistrict(feature);
    return {
      type: "Feature",
      id: identity.id,
      properties: {
        id: identity.id,
        parentId: identity.parentId,
        name: identity.name,
        slug: identity.slug,
        sourceStateName: identity.sourceStateName,
        sourceStateCode: identity.sourceStateCode,
        sourceDistrictCode: identity.sourceDistrictCode,
        source: feature.properties,
      },
      geometry: feature.geometry,
    };
  });

  const parents = new Map();
  for (const district of districts) {
    const { parentId } = district.properties;
    if (!parents.has(parentId)) parents.set(parentId, []);
    parents.get(parentId).push(district);
  }
  const expectedDistrictOutputNames = new Set(
    [...parents.keys()].flatMap((parentId) => [`${parentId}.geojson`, `${parentId}.topo.json`]),
  );
  for (const file of await readdir(districtDir)) {
    if (!expectedDistrictOutputNames.has(file)) {
      const recoveryDir = join(dataDir, "work", "legacy-generated-artifacts", "census-2011-districts");
      await mkdir(recoveryDir, { recursive: true });
      const destination = join(recoveryDir, file);
      try {
        await stat(destination);
        continue;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const { rename } = await import("node:fs/promises");
      await rename(join(districtDir, file), destination);
    }
  }

  // Build one topology before merging: `merge` removes arcs shared by districts, so
  // the country asset has genuine state/UT outlines rather than visible internal seams.
  const districtTopology = topology({ districts: featureCollection(districts) });
  const districtGeometryById = new Map(
    districtTopology.objects.districts.geometries.map((geometry) => [geometry.properties.id, geometry]),
  );
  const historicalStates = [...parents.entries()]
    .map(([id, children]) => ({
      type: "Feature",
      id,
      properties: {
        id,
        name: children[0].properties.sourceStateName,
        slug: normalizedSlug(children[0].properties.sourceStateName),
        sourceStateCode: children[0].properties.sourceStateCode,
        administrativeVintage: "Census 2011",
      },
      geometry: merge(
        districtTopology,
        children.map((child) => districtGeometryById.get(child.properties.id)),
      ),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const stateCollection = featureCollection(historicalStates);
  const stateGeoJson = join(outputDir, "states.geojson");
  const stateTopoJson = join(outputDir, "states.topo.json");
  await writeJson(stateGeoJson, stateCollection);
  await writeJson(stateTopoJson, optimizedTopology({ states: stateCollection }));

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      provider: "DataMeet India community",
      repository: "https://github.com/datameet/maps",
      commit,
      districtInput: "Districts/Census_2011/2011_Dist.shp",
      attribution: "India boundaries by DataMeet India community",
      districtLicense: "CC BY 2.5 India (Districts/README.md explicit override)",
      administrativeVintage: {
        states: "Census 2011; state/UT display regions are built from the same Census-2011 district source geometry.",
        districts: "Census 2011 (source path Districts/Census_2011); unsuitable as a current administrative register.",
        compatibility: "Coherent historical state-to-district drill-down. It intentionally does not represent later state/UT or district changes.",
      },
      inputSha256: {
        districtsShp: await sha256(inputs.districts),
      },
      processing: {
        output: "TopoJSON",
        quantization: 20000,
        retainedVertexShare: 0.005,
        method: "topojson-server topology → topojson-simplify presimplify → finite-weight percentile threshold → simplify",
      },
      excludedSourceFeatures: {
        count: rawDistricts.length - filteredRawDistricts.length,
        rule: "Exclude only the documented non-geographic sentinel ST_CEN_CD=99, DT_CEN_CD=99, DISTRICT='Data Not Available'.",
        features: excludedSentinels,
      },
    },
    identity: {
      state: "in-hs-{zero-padded source ST_CEN_CD}-{normalized source-native state name}",
      district: "in-d{zero-padded source ST_CEN_CD}-{zero-padded source DT_CEN_CD}",
      districtParent: "in-hs-{zero-padded source ST_CEN_CD}-{normalized source-native state name}; historical Census-2011 partition, not a current state/UT id",
      warning: "Use id / parentId for joins. slug is for display/search only; source-native names and codes are retained in properties.source. This default bundle is historical Census-2011, not a current administrative register.",
    },
    assets: {
      states: { topojson: "states.topo.json", debugGeojson: "states.geojson", featureCount: historicalStates.length },
      districts: {},
    },
  };

  for (const [parentId, unSortedChildren] of [...parents.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const children = unSortedChildren.sort((a, b) => a.id.localeCompare(b.id));
    const collection = featureCollection(children);
    const fileBase = parentId;
    const geojson = join(districtDir, `${fileBase}.geojson`);
    const topojson = join(districtDir, `${fileBase}.topo.json`);
    await writeJson(geojson, collection);
    await writeJson(topojson, optimizedTopology({ districts: collection }));
    manifest.assets.districts[parentId] = {
      geojson: `districts/${basename(geojson)}`,
      topojson: `districts/${basename(topojson)}`,
      featureCount: children.length,
      bytes: { geojson: await byteSize(geojson), topojson: await byteSize(topojson) },
      sourceParent: {
        id: parentId,
        name: children[0].properties.sourceStateName,
        sourceStateCode: children[0].properties.sourceStateCode,
      },
    };
  }

  manifest.outputSha256 = {
    statesGeojson: await sha256(stateGeoJson),
    statesTopojson: await sha256(stateTopoJson),
  };
  for (const [stateId, asset] of Object.entries(manifest.assets.districts)) {
    asset.sha256 = {
      geojson: await sha256(join(outputDir, asset.geojson)),
      topojson: await sha256(join(outputDir, asset.topojson)),
    };
  }
  await writeJson(join(outputDir, "manifest.json"), manifest);
  console.log(`Prepared ${historicalStates.length} Census-2011 state/UT regions and ${districts.length} districts from ${sourceDir}.`);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
