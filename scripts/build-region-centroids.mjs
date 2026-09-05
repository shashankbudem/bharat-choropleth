#!/usr/bin/env node
/**
 * Writes `examples/observatory/data/region-centroids.json` — one lat/lon per
 * region, at every level of the current (2019) bundle.
 *
 * The live-temperature case needs a coordinate to ask a weather API about. It
 * could decode the boundary files in the browser to find one, but that would
 * mean shipping a TopoJSON decoder and a projection library to a page whose
 * whole point is that it needs neither. Computing them once here keeps that page
 * dependency-free.
 *
 *     pnpm build:centroids
 *
 * ## Inside the region, not merely near it
 *
 * `geoCentroid` returns the spherical centre of mass, which for a crescent or a
 * scattered island group can fall outside the region entirely — asking a weather
 * API about a point in the sea and labelling it a district would be quietly
 * wrong. Every centroid is therefore tested with `geoContains`, and anything
 * outside is replaced by a point found by scanning the region's own bounding
 * box. The count of regions that needed that is reported, and recorded in the
 * file, because it says how much to trust the method.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

// d3-geo and topojson-client belong to the packages, not to the workspace root,
// so they are resolved from a package that depends on them rather than added as
// root dependencies for the sake of one build script.
const require = createRequire(resolve(root, "packages/js/package.json"));
const { geoCentroid, geoContains } = require("d3-geo");
const { feature: topoFeature } = require("topojson-client");
const out = resolve(root, "examples/observatory/data");

function features(path, object) {
  const topology = JSON.parse(readFileSync(path, "utf8"));
  const name = object in topology.objects ? object : Object.keys(topology.objects)[0];
  const unpacked = topoFeature(topology, topology.objects[name]);
  return unpacked.type === "FeatureCollection" ? unpacked.features : [unpacked];
}

let rescued = 0;

/**
 * A representative point strictly inside the region.
 *
 * The bounding-box scan starts coarse and refines, so a sliver still finds a
 * point without walking a fine grid over every region.
 */
function pointInside(feature) {
  const centroid = geoCentroid(feature);
  if (centroid.every(Number.isFinite) && geoContains(feature, centroid)) return centroid;

  const [[west, south], [east, north]] = bounds(feature);
  for (const steps of [8, 24, 64]) {
    for (let x = 1; x < steps; x++) {
      for (let y = 1; y < steps; y++) {
        const point = [west + ((east - west) * x) / steps, south + ((north - south) * y) / steps];
        if (geoContains(feature, point)) {
          rescued += 1;
          return point;
        }
      }
    }
  }
  // Nothing inside was found at any resolution — keep the centroid and say so
  // rather than dropping the region silently.
  rescued += 1;
  return centroid;
}

function bounds(feature) {
  let west = 180;
  let south = 90;
  let east = -180;
  let north = -90;
  const visit = (coordinates) => {
    if (typeof coordinates[0] === "number") {
      const [lon, lat] = coordinates;
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
      return;
    }
    for (const part of coordinates) visit(part);
  };
  visit(feature.geometry.coordinates);
  return [[west, south], [east, north]];
}

const round = (value) => Number(value.toFixed(4));

const centroids = { states: {}, districts: {}, subdistricts: {} };

for (const item of features(resolve(root, "data/generated/current-2019-states/states.topo.json"), "states")) {
  const [lon, lat] = pointInside(item);
  centroids.states[item.properties.id] = [round(lat), round(lon)];
}

const districtDir = resolve(root, "data/generated/current-2019-districts/districts");
for (const file of readdirSync(districtDir).filter((name) => name.endsWith(".topo.json"))) {
  for (const item of features(resolve(districtDir, file), "districts")) {
    const [lon, lat] = pointInside(item);
    centroids.districts[item.properties.id] = [round(lat), round(lon)];
  }
}

const subDir = resolve(root, "data/generated/current-2019-subdistricts/subdistricts");
for (const file of readdirSync(subDir).filter((name) => name.endsWith(".topo.json"))) {
  for (const item of features(resolve(subDir, file), "subdistricts")) {
    const [lon, lat] = pointInside(item);
    centroids.subdistricts[item.properties.id] = [round(lat), round(lon)];
  }
}

mkdirSync(out, { recursive: true });
const counts = {
  states: Object.keys(centroids.states).length,
  districts: Object.keys(centroids.districts).length,
  subdistricts: Object.keys(centroids.subdistricts).length,
};
writeFileSync(
  resolve(out, "region-centroids.json"),
  `${JSON.stringify(
    {
      generatedBy: "scripts/build-region-centroids.mjs",
      edition: "current (2019) boundaries",
      note:
        "One representative [lat, lon] per region, guaranteed inside it where a point inside could be found. " +
        "Derived from the boundary bundles in this repository; it is geometry, not a measurement.",
      counts,
      centroidOutsideRegion: rescued,
      centroids,
    },
    null,
    0,
  )}\n`,
);

console.log(`  states        ${counts.states}`);
console.log(`  districts     ${counts.districts}`);
console.log(`  subdistricts  ${counts.subdistricts}`);
console.log(`\n  ${rescued} region(s) needed a point other than the centroid.`);
console.log(`\nWrote ${resolve(out, "region-centroids.json")}`);
