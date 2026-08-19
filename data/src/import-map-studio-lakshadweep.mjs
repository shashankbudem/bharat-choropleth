import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { feature as topoFeature } from "topojson-client";
import { topology } from "topojson-server";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "..");
const stateId = "in-cs-31-lakshadweep";
const sourceCommit = "db2745512365d194a7c4cabdf7ded79e1c777922";
const sourceUrl = `https://raw.githubusercontent.com/nikhilsawantse/india-map-studio/${sourceCommit}/assets/maps/states/lakshadweep.svg`;
const outputPath = join(dataDir, "generated", "current-2019-districts", "districts", `${stateId}.topo.json`);
const manifestPath = join(dataDir, "generated", "current-2019-districts", "manifest.json");
const statesPath = join(dataDir, "generated", "current-2019-states", "states.topo.json");

function parsePathData(pathData) {
  const tokens = pathData.match(/[MLZ]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const polygons = [];
  let index = 0;
  let ring = [];
  while (index < tokens.length) {
    const command = tokens[index++].toUpperCase();
    if (command === "Z") {
      if (ring.length >= 3) {
        const [firstX, firstY] = ring[0];
        const [lastX, lastY] = ring.at(-1);
        if (firstX !== lastX || firstY !== lastY) ring.push([firstX, firstY]);
        polygons.push([ring]);
      }
      ring = [];
      continue;
    }
    if (command !== "M" && command !== "L") throw new Error(`Unsupported SVG command ${command}.`);
    const x = Number(tokens[index++]);
    const y = Number(tokens[index++]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Invalid SVG coordinate.");
    if (command === "M" && ring.length) throw new Error("An SVG subpath was not closed.");
    ring.push([x, y]);
  }
  if (ring.length) throw new Error("SVG path ended before closing a subpath.");
  return polygons;
}

function boundsOfCoordinates(coordinates, bounds = [Infinity, Infinity, -Infinity, -Infinity]) {
  if (typeof coordinates[0] === "number") {
    const [x, y] = coordinates;
    bounds[0] = Math.min(bounds[0], x);
    bounds[1] = Math.min(bounds[1], y);
    bounds[2] = Math.max(bounds[2], x);
    bounds[3] = Math.max(bounds[3], y);
    return bounds;
  }
  for (const child of coordinates) boundsOfCoordinates(child, bounds);
  return bounds;
}

function fitSvgCoordinates(polygons, targetBounds) {
  const [sourceMinX, sourceMinY, sourceMaxX, sourceMaxY] = boundsOfCoordinates(polygons);
  const [targetMinX, targetMinY, targetMaxX, targetMaxY] = targetBounds;
  const sourceWidth = sourceMaxX - sourceMinX;
  const sourceHeight = sourceMaxY - sourceMinY;
  if (!sourceWidth || !sourceHeight) throw new Error("Map Studio SVG has an empty Lakshadweep extent.");

  // SVG y grows downward; geographic latitude grows upward.  This keeps the
  // source's island layout and orientation while returning valid lon/lat data.
  return polygons.map((polygon) => polygon.map((ring) => ring.map(([x, y]) => [
    targetMinX + ((x - sourceMinX) / sourceWidth) * (targetMaxX - targetMinX),
    targetMaxY - ((y - sourceMinY) / sourceHeight) * (targetMaxY - targetMinY),
  ]).reverse()));
}

async function main() {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Map Studio SVG responded ${response.status}.`);
  const svg = await response.text();
  const pathData = svg.match(/<g id="district-lakshadweep"[\s\S]*?<path d="([^"]+)"/i)?.[1];
  if (!pathData) throw new Error("Could not find Map Studio's Lakshadweep district path.");

  const previous = JSON.parse(await readFile(outputPath, "utf8"));
  const previousDistrict = previous.objects.districts.geometries[0];
  const states = JSON.parse(await readFile(statesPath, "utf8"));
  const stateFeature = topoFeature(states, states.objects.states)
    .features
    .find((candidate) => candidate.id === stateId);
  if (!stateFeature) throw new Error(`Could not find ${stateId} in current state boundaries.`);
  const sourcePolygons = parsePathData(pathData);
  const district = {
    type: "Feature",
    id: previousDistrict.id,
    properties: {
      ...previousDistrict.properties,
      geometryOverride: {
        provider: "India Map Studio",
        repository: "https://github.com/nikhilsawantse/india-map-studio",
        commit: sourceCommit,
        input: "assets/maps/states/lakshadweep.svg#district-lakshadweep",
        license: "MIT (upstream geometry declared from datta07/INDIAN-SHAPEFILES)",
      },
    },
    geometry: {
      type: "MultiPolygon",
      coordinates: fitSvgCoordinates(sourcePolygons, boundsOfCoordinates(stateFeature.geometry.coordinates)),
    },
  };
  const output = topology({ districts: { type: "FeatureCollection", features: [district] } }, 20000);
  await writeFile(outputPath, `${JSON.stringify(output)}\n`);

  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.source.geometryOverrides = {
    ...manifest.source.geometryOverrides,
    lakshadweep: {
      provider: "India Map Studio",
      repository: "https://github.com/nikhilsawantse/india-map-studio",
      commit: sourceCommit,
      input: "assets/maps/states/lakshadweep.svg#district-lakshadweep",
      license: "MIT; source repository declares the same datta07/INDIAN-SHAPEFILES MIT upstream for its public state/UT district SVGs.",
      reason: "Fit the source SVG's higher-detail Lakshadweep island paths into the existing geographic state envelope for the drilled district view.",
    },
  };
  const asset = manifest.assets.districts[stateId];
  const bytes = await readFile(outputPath);
  asset.bytes = bytes.length;
  asset.sha256 = createHash("sha256").update(bytes).digest("hex");
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
}

await main();
