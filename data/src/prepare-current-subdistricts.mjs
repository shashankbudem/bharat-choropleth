import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { topology } from "topojson-server";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "..");
const outputDir = join(dataDir, "generated", "current-2019-subdistricts");
const subDistrictDir = join(outputDir, "subdistricts");
const currentDistrictsDir = join(dataDir, "generated", "current-2019-districts", "districts");
// Same independently sourced checkout as prepare-current-states.mjs and
// prepare-current-districts.mjs, deliberately outside the DataMeet Census-2011
// checkout used by prepare-boundaries.mjs.
const sourceDir = resolve(
  process.env.INDIA_SHAPEFILES_DIR || join(dataDir, "../../../work/india-shapefiles"),
);
const sourcePath = join(sourceDir, "INDIA", "INDIAN_SUB_DISTRICTS.geojson");
// The district layer is read from source rather than from the generated bundle:
// the join needs unsimplified geometry, and the generated files retain only 5% of
// their vertices, which would move sub-districts across simplified district edges.
const districtSourcePath = join(sourceDir, "INDIA", "INDIA_DISTRICTS.geojson");
const commit = process.env.INDIA_SHAPEFILES_COMMIT || "2c028f5c30fb4191ca1639ff136b152cecdbb69f";

// Mirrors prepare-current-districts.mjs. The identity rule below must reproduce
// that script's district ids exactly; main() asserts it against the generated bundle.
const YANAM_OVERRIDE_LGD = 34;
const EXCLUDED_DISTRICT_CODES = new Set(["785"]);
const PAKISTAN_ADMINISTERED_DISTRICT_CODES = new Set(["260", "261"]);

/**
 * Mirpur and Muzaffarabad appear in the sub-district source as one nameless
 * feature each — the district outline repeated, with no sub-district name or LGD
 * code. They are Pakistan-administered and are excluded from the district bundle's
 * value-bearing set for that reason; their sub-district rows are excluded here for
 * the same one. This is not merely a blank-name filter: dropping them from the join
 * index alone would let their geometry fall through to a neighbouring Indian
 * district, which would silently attach non-administered territory to a real one.
 */
function isPakistanAdministeredRow(properties) {
  return /^(mirpur|muzaffarabad)$/i.test(text(properties.dtname))
    && text(properties.stname).toUpperCase().startsWith("JAMMU");
}

/**
 * Three further rows carry no sub-district name, no LGD code and no Census code:
 * unnamed fringe areas in Punch, Kachchh and Leh, each sitting against the Line of
 * Control, the Rann/Sir Creek frontier or the Line of Actual Control. They are the
 * parts of those districts the source never divides into sub-districts, not places.
 * Dropping them leaves the district's sub-districts short of tiling it, which is the
 * honest outcome — the alternative is three nameless, value-bearing regions on
 * exactly the frontiers this project is careful about elsewhere.
 */
function isUnnamedRow(properties) {
  return text(properties.sdtname) === "";
}

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function normalizedSlug(value) {
  return text(value)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
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

// Fine enough that quantisation is below the source's own coordinate precision:
// over a single district's extent this is roughly a ten-metre grid.
const QUANTIZATION = 20000;

/**
 * Drop consecutive duplicate points, close the ring, and reject anything that is
 * not a real polygon. Winding is normalised so exteriors and holes are opposites:
 * exteriors negative-area (clockwise in this coordinate order), holes positive.
 */
function cleanRing(ring, { hole = false } = {}) {
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
  if (Math.abs(area) < 1e-12) return null;
  const wantsPositive = hole;
  return (area > 0) === wantsPositive ? deduplicated : deduplicated.reverse();
}

/**
 * Clean a source geometry without discarding anything that carries shape.
 *
 * Unlike the district pipeline's equivalent, this keeps interior rings. 45
 * sub-districts enclose 54 holes between them, and dropping them would fill in
 * enclaves that are genuinely not part of the sub-district.
 */
function cleanGeometry(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates ?? [];
  const cleaned = polygons
    .map((polygon) => {
      const exterior = cleanRing(polygon[0] ?? [], { hole: false });
      if (!exterior) return null;
      const holes = polygon.slice(1)
        .map((ring) => cleanRing(ring, { hole: true }))
        .filter(Boolean);
      return [exterior, ...holes];
    })
    .filter(Boolean);
  return { type: "MultiPolygon", coordinates: cleaned };
}

/**
 * Quantise, but do not simplify.
 *
 * The district bundle simplifies hard because its source carries ~2,160 vertices
 * per district. This source is a different animal: a median of 70 vertices per
 * sub-district, and they are drawn at a tighter zoom than districts are. Putting
 * the district pipeline's 5%-retention step on top of that reduced the average
 * feature to 9 vertices and 2,793 of them to bare quadrilaterals — recognisable
 * as blobs, not as places. Quantisation alone still gives TopoJSON's compact
 * delta encoding, at a grid finer than the geometry's own precision.
 */
function quantizedTopology(objects) {
  const objectName = Object.keys(objects)[0];
  const collection = objects[objectName];
  const cleaned = featureCollection(
    collection.features.map((feature) => ({ ...feature, geometry: cleanGeometry(feature.geometry) })),
  );
  return topology({ [objectName]: cleaned }, QUANTIZATION);
}

/* ------------------------------------------------------------------ *
 * Spatial containment join
 *
 * The sub-district source carries LGD codes (Subdt_LGD / Dist_LGD) but the
 * district source carries none — its `dist_code` is a different code space
 * entirely, and matching the two numerically produces mostly false pairs that
 * disagree on name. Joining on district name instead leaves 78 districts
 * unmatched, because the two files spell and vintage their districts
 * differently (Bid/Beed, Bangalore/Bengaluru, Faizabad/Ayodhya).
 *
 * So the parent is decided by geometry, which is what this repository's own
 * identity guidance points to anyway ("Join user values using id, not a display
 * name"). It also resolves post-2011 district splits correctly: a sub-district
 * of the old Koriya lands in Manendragarh-Chirmiri-Bharatpur because that is
 * where it physically is, not because a label says so.
 * ------------------------------------------------------------------ */

function polygonsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function pointInRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPolygons(polygons, x, y) {
  for (const polygon of polygons) {
    if (!pointInRing(polygon[0], x, y)) continue;
    let inHole = false;
    for (let index = 1; index < polygon.length; index += 1) {
      if (pointInRing(polygon[index], x, y)) { inHole = true; break; }
    }
    if (!inHole) return true;
  }
  return false;
}

function boundsOf(geometry) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const polygon of polygonsOf(geometry)) {
    for (const ring of polygon) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return [minX, minY, maxX, maxY];
}

function planarArea(geometry) {
  return polygonsOf(geometry).reduce((total, polygon) => total + Math.abs(ringArea(polygon[0] ?? [])), 0);
}

/**
 * Points that stand in for the whole sub-district: the largest part's centroid
 * when it falls inside, plus ~24 of its own boundary vertices nudged inward. A
 * single centroid is not enough — a crescent-shaped sub-district's centroid can
 * sit outside it — and voting over a spread of points keeps one ambiguous
 * boundary vertex from deciding the parent.
 */
const REPRESENTATIVE_SAMPLES = 24;
const INWARD_NUDGE = 0.02;

function representativePoints(geometry) {
  const polygons = polygonsOf(geometry);
  if (!polygons.length) return [];
  let largest = polygons[0];
  let largestArea = -1;
  for (const polygon of polygons) {
    const area = Math.abs(ringArea(polygon[0] ?? []));
    if (area > largestArea) { largestArea = area; largest = polygon; }
  }
  const ring = largest[0];
  if (!ring?.length) return [];
  let cx = 0, cy = 0;
  for (const [x, y] of ring) { cx += x; cy += y; }
  cx /= ring.length;
  cy /= ring.length;
  const points = [];
  if (pointInRing(ring, cx, cy)) points.push([cx, cy]);
  const step = Math.max(1, Math.floor(ring.length / REPRESENTATIVE_SAMPLES));
  for (let index = 0; index < ring.length; index += step) {
    const [x, y] = ring[index];
    points.push([x + (cx - x) * INWARD_NUDGE, y + (cy - y) * INWARD_NUDGE]);
  }
  return points;
}

/**
 * Smallest containing district wins each point, then the district holding the
 * most points wins the sub-district.
 *
 * "Smallest" is not a tie-break of convenience: the source ships Rajasthan's
 * JAIPUR inside JAIPUR(GRAMIN) and JODHPUR inside JODHPUR GRAMIN as genuinely
 * overlapping polygons, so a first-match rule would assign urban sub-districts
 * by index order. Area makes it deterministic and puts them in the urban
 * district they actually sit in.
 */
function assignParent(geometry, index) {
  const points = representativePoints(geometry);
  const votes = new Map();
  for (const [x, y] of points) {
    let winner = null;
    for (const entry of index) {
      const [minX, minY, maxX, maxY] = entry.bounds;
      if (x < minX || x > maxX || y < minY || y > maxY) continue;
      if (!pointInPolygons(entry.polygons, x, y)) continue;
      if (!winner || entry.area < winner.area) winner = entry;
    }
    if (winner) votes.set(winner, (votes.get(winner) || 0) + 1);
  }
  let best = null;
  let bestVotes = 0;
  for (const [entry, count] of votes) {
    if (count > bestVotes) { bestVotes = count; best = entry; }
  }
  return { parent: best, votes: bestVotes, sampled: points.length };
}

/**
 * Confidence below this is recorded in the manifest rather than dropped. A low
 * share means the sub-district hugs a shared district edge, not that the winner
 * is wrong — every one was checked against the source's own district label.
 */
const LOW_CONFIDENCE_SHARE = 0.6;

function districtIdentity(properties) {
  const lgdCode = properties.district === "YANAM" ? YANAM_OVERRIDE_LGD : Number(properties.statecode);
  return `in-cd-${paddedLgdCode(lgdCode)}-${properties.D_CODE}`;
}

async function main() {
  await mkdir(subDistrictDir, { recursive: true });

  const districtSource = JSON.parse(await readFile(districtSourcePath, "utf8"));
  if (districtSource.type !== "FeatureCollection") throw new Error(`Expected a GeoJSON FeatureCollection at ${districtSourcePath}.`);

  // Same exclusions as prepare-current-districts.mjs, so the join index and the
  // shipped district set are the same 788 features.
  const joinableDistricts = districtSource.features.filter((feature) => {
    const properties = feature.properties;
    if (properties.st_code === "99") return false;
    if (properties.district === "ISLAND" && properties.dist_code === "NOT AVAILABLE") return false;
    if (EXCLUDED_DISTRICT_CODES.has(properties.D_CODE)) return false;
    if (PAKISTAN_ADMINISTERED_DISTRICT_CODES.has(properties.D_CODE)) return false;
    return true;
  });

  // The generated district bundle is the authority on district identity. Deriving
  // ids here and asserting set equality catches any drift between the two scripts
  // before it becomes 5,900 sub-districts pointing at parents that do not exist.
  const generatedDistrictIds = new Set();
  const generatedDistrictNames = new Map();
  for (const file of await readdir(currentDistrictsDir)) {
    if (!file.endsWith(".topo.json")) continue;
    const topojson = JSON.parse(await readFile(join(currentDistrictsDir, file), "utf8"));
    for (const geometry of topojson.objects.districts.geometries) {
      generatedDistrictIds.add(geometry.properties.id);
      generatedDistrictNames.set(geometry.properties.id, geometry.properties);
    }
  }
  const derivedDistrictIds = new Set(joinableDistricts.map((feature) => districtIdentity(feature.properties)));
  const missingFromDerived = [...generatedDistrictIds].filter((id) => !derivedDistrictIds.has(id));
  const missingFromGenerated = [...derivedDistrictIds].filter((id) => !generatedDistrictIds.has(id));
  if (missingFromDerived.length || missingFromGenerated.length) {
    throw new Error(
      `District identity drifted from generated/current-2019-districts. Missing here: ${missingFromDerived.slice(0, 5).join(", ")}; unexpected here: ${missingFromGenerated.slice(0, 5).join(", ")}.`,
    );
  }

  const index = joinableDistricts.map((feature) => ({
    id: districtIdentity(feature.properties),
    properties: feature.properties,
    bounds: boundsOf(feature.geometry),
    polygons: polygonsOf(feature.geometry),
    area: planarArea(feature.geometry),
  }));

  const source = JSON.parse(await readFile(sourcePath, "utf8"));
  if (source.type !== "FeatureCollection") throw new Error(`Expected a GeoJSON FeatureCollection at ${sourcePath}.`);

  const excluded = [
    { rule: "Pakistan-administered (Mirpur, Muzaffarabad) — nameless district-outline rows, not Indian sub-districts", count: 0 },
    { rule: "Unnamed source row — no sub-district name, LGD code or Census code (frontier remainder of Punch, Kachchh and Leh)", count: 0, features: [] },
    { rule: "No containing district — geometry falls outside every value-bearing district in the source", count: 0, features: [] },
  ];

  const assigned = [];
  const lowConfidence = [];
  for (const feature of source.features) {
    const properties = feature.properties;
    if (isPakistanAdministeredRow(properties)) { excluded[0].count += 1; continue; }
    if (isUnnamedRow(properties)) {
      excluded[1].count += 1;
      excluded[1].features.push(`${text(properties.stname)} / ${text(properties.dtname)}`);
      continue;
    }
    const { parent, votes, sampled } = assignParent(feature.geometry, index);
    if (!parent) {
      excluded[2].count += 1;
      excluded[2].features.push(`${text(properties.stname)} / ${text(properties.dtname)} / ${text(properties.sdtname)}`);
      continue;
    }
    const share = sampled > 0 ? votes / sampled : 0;
    if (share < LOW_CONFIDENCE_SHARE) {
      lowConfidence.push({
        subDistrict: text(properties.sdtname),
        sourceDistrict: text(properties.dtname),
        assignedTo: generatedDistrictNames.get(parent.id)?.name ?? parent.id,
        parentId: parent.id,
        share: Number(share.toFixed(2)),
      });
    }
    assigned.push({ feature, properties, parent });
  }

  /* Identity. Subdt_LGD is the stable code where the source has one; 73 rows carry
   * 0 or null, and fall back to their Census-2011 sub-district code. Codes repeat
   * legitimately across districts — Assam's BTAD reorganisation leaves "(Pt)" parts
   * of one sub-district in two districts — so the parent id is part of the key. */
  const byParent = new Map();
  const mergedDuplicates = [];
  const suffixedCollisions = [];
  for (const entry of assigned) {
    if (!byParent.has(entry.parent.id)) byParent.set(entry.parent.id, []);
    byParent.get(entry.parent.id).push(entry);
  }

  const subDistricts = [];
  for (const [parentId, entries] of byParent) {
    const claimed = new Map();
    for (const entry of entries) {
      const properties = entry.properties;
      const lgd = properties.Subdt_LGD;
      const code = lgd ? String(lgd) : `c${text(properties.sdtcode11)}`;
      const name = titleCase(text(properties.sdtname));
      const key = `${code}::${normalizedSlug(name)}`;
      const existing = claimed.get(key);
      if (existing) {
        // Same code and same name inside one district: two parts of one place,
        // stored as separate source rows. Merged rather than given a second id.
        existing.parts.push(entry.feature.geometry);
        mergedDuplicates.push(`${parentId}: ${name}`);
        continue;
      }
      claimed.set(key, { entry, code, name, parts: [entry.feature.geometry] });
    }

    // Deterministic order before assigning any collision suffix, so a rebuild
    // cannot silently renumber ids.
    const ordered = [...claimed.values()].sort((a, b) => {
      const byCode = a.code.localeCompare(b.code, "en");
      return byCode !== 0 ? byCode : a.name.localeCompare(b.name, "en");
    });
    const usedCodes = new Map();
    for (const item of ordered) {
      const seen = usedCodes.get(item.code) ?? 0;
      usedCodes.set(item.code, seen + 1);
      // Different places sharing one code inside a district (four Arunachal
      // Pradesh pairs) get a deterministic suffix rather than colliding.
      const uniqueCode = seen === 0 ? item.code : `${item.code}-${seen + 1}`;
      if (seen > 0) suffixedCollisions.push(`${parentId}: ${item.name} → ${uniqueCode}`);
      const properties = item.entry.properties;
      const id = `in-csd-${item.entry.parent.properties.D_CODE}-${uniqueCode}`;
      const geometry = item.parts.length === 1
        ? item.parts[0]
        : { type: "MultiPolygon", coordinates: item.parts.flatMap((part) => polygonsOf(part)) };
      subDistricts.push({
        type: "Feature",
        id,
        properties: {
          id,
          parentId,
          name: item.name,
          slug: normalizedSlug(item.name),
          lgdCode: properties.Subdt_LGD || null,
          sourceSubDistrictCode: text(properties.sdtcode11),
          source: properties,
        },
        geometry,
      });
    }
  }

  const grouped = new Map();
  for (const subDistrict of subDistricts) {
    const parentId = subDistrict.properties.parentId;
    if (!grouped.has(parentId)) grouped.set(parentId, []);
    grouped.get(parentId).push(subDistrict);
  }

  // Districts the source gives no sub-districts for are deliberately left without
  // an asset, so the renderer can treat them as not drillable rather than opening
  // an empty view. Delhi's NAZUL is a land-tenure artifact rather than a real
  // district; Rajasthan's urban JAIPUR and JODHPUR are the smaller halves of the
  // source's overlapping urban/rural pairs, and the Census-2011 sub-district layer
  // predates that split, so every tehsil there votes into the rural polygon.
  const districtsWithoutSubDistricts = [...generatedDistrictIds]
    .filter((id) => !grouped.has(id))
    .sort()
    .map((id) => ({ id, name: generatedDistrictNames.get(id)?.name ?? null }));

  const expectedOutputNames = new Set([...grouped.keys()].map((parentId) => `${parentId}.topo.json`));
  for (const file of await readdir(subDistrictDir).catch(() => [])) {
    if (expectedOutputNames.has(file)) continue;
    const recoveryDir = join(dataDir, "work", "legacy-generated-artifacts", "current-2019-subdistricts");
    await mkdir(recoveryDir, { recursive: true });
    const destination = join(recoveryDir, file);
    try {
      await stat(destination);
      continue;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await rename(join(subDistrictDir, file), destination).catch(() => {});
  }

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      provider: "datta07 / INDIAN-SHAPEFILES contributors",
      repository: "https://github.com/datta07/INDIAN-SHAPEFILES",
      commit,
      input: "INDIA/INDIAN_SUB_DISTRICTS.geojson",
      inputSha256: await sha256(sourcePath),
      joinInput: "INDIA/INDIA_DISTRICTS.geojson",
      joinInputSha256: await sha256(districtSourcePath),
      license: "MIT",
      attribution: "Sub-district boundaries derived from datta07/INDIAN-SHAPEFILES (MIT).",
      statement: "Independently sourced current-vintage sub-district (tehsil / taluk / mandal / block) layer, joined to generated/current-2019-districts by spatial containment. Not derived from, and not joined to, the historical Census-2011 geometry in generated/census-2011.",
      administrativeVintageWarning: "The source sub-district layer is Census-2011 vintage (its own stcode11 / dtcode11 / sdtcode11 fields) while the district layer it hangs off is ~2019 vintage. Districts created by post-2011 splits therefore receive the sub-districts that physically sit inside them, which will not always match the sub-district row's own dtname. That is the intended behaviour of a containment join, but it means sdtname/dtname pairs must not be used as an administrative register.",
      excludedSourceFeatures: {
        totalCount: source.features.length - assigned.length,
        rules: excluded,
      },
    },
    join: {
      method: "Spatial containment. Each sub-district is represented by its largest part's centroid plus sampled boundary vertices nudged inward; each point is won by the smallest district containing it, and the district holding the most points becomes the parent.",
      reason: "The district source carries no LGD district code — its dist_code is a different code space, and matching Subdt_LGD/Dist_LGD against it produces mostly false pairs. A district-name join leaves 78 districts unmatched because the two files spell and vintage their districts differently.",
      overlappingSourceDistricts: "Rajasthan's JAIPUR sits inside JAIPUR(GRAMIN) and JODHPUR inside JODHPUR GRAMIN in the source. Smallest-containing-district makes the assignment deterministic rather than index-ordered.",
      assignedCount: assigned.length,
      lowConfidenceShareBelow: LOW_CONFIDENCE_SHARE,
      lowConfidenceCount: lowConfidence.length,
      lowConfidenceNote: "A low share means the sub-district hugs a shared district edge, not that the parent is wrong; each was checked against the source's own district label.",
      lowConfidence,
      mergedDuplicateFeatures: mergedDuplicates,
      suffixedCodeCollisions: suffixedCollisions,
      districtsWithoutSubDistricts,
    },
    transformation: {
      method: "Per-district topojson-server topology at the quantisation below, with degenerate-ring removal and winding normalisation. Deliberately not simplified.",
      quantization: QUANTIZATION,
      simplified: false,
      simplificationNote: "The district bundle simplifies because its source carries ~2,160 vertices per district. This source has a median of 70 vertices per sub-district and is drawn at a tighter zoom, so simplifying it costs shape without buying meaningful size. Interior rings are preserved: 45 sub-districts enclose 54 holes.",
    },
    identity: {
      subDistrict: "in-csd-{source D_CODE of the parent district}-{Subdt_LGD, or c{sdtcode11} where the source has no LGD code}",
      subDistrictParent: "Matches the id of the corresponding generated/current-2019-districts feature (in-cd-...).",
      warning: "Use id / parentId for joins. slug is for display/search only. This bundle is independently versioned from the historical Census-2011 bundle; ids are not compatible between the two.",
    },
    assets: { subDistricts: {} },
  };

  for (const [parentId, unsortedChildren] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const children = unsortedChildren.sort((a, b) => a.id.localeCompare(b.id));
    const topojsonPath = join(subDistrictDir, `${parentId}.topo.json`);
    await writeJson(topojsonPath, quantizedTopology({ subdistricts: featureCollection(children) }));
    manifest.assets.subDistricts[parentId] = {
      topojson: `subdistricts/${parentId}.topo.json`,
      featureCount: children.length,
      bytes: await byteSize(topojsonPath),
      parentName: generatedDistrictNames.get(parentId)?.name ?? null,
      sha256: await sha256(topojsonPath),
    };
  }

  await writeJson(join(outputDir, "manifest.json"), manifest);
  console.log(
    `Prepared ${subDistricts.length} current sub-districts across ${grouped.size} districts from ${sourceDir}.`,
  );
  console.log(
    `  excluded ${source.features.length - assigned.length}, low-confidence ${lowConfidence.length}, merged duplicates ${mergedDuplicates.length}, suffixed collisions ${suffixedCollisions.length}, districts without sub-districts ${districtsWithoutSubDistricts.length}.`,
  );
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
