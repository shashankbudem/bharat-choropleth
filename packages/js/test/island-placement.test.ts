import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { geoMercator } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import { describe, expect, it } from "vitest";
import { placeIslandGroup, type Point } from "../src/small-regions";

/**
 * The island placement's constants are tuned against the real national map,
 * so this checks them there: projected the way the renderer projects the
 * bundled states, each magnified group has to stay in open sea.
 */
const topology = JSON.parse(
  readFileSync(resolve(__dirname, "../../../data/generated/current-2019-states/states.topo.json"), "utf8"),
) as Topology;
const states = feature(topology, Object.values(topology.objects)[0]!) as unknown as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
const VIEWBOX = { width: 960, height: 640, padding: 28 };
const projection = geoMercator().fitExtent(
  [[VIEWBOX.padding, VIEWBOX.padding], [VIEWBOX.width - VIEWBOX.padding, VIEWBOX.height - VIEWBOX.padding]],
  states,
);
const ringsOf = (region: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>): Point[][] =>
  (region.geometry.type === "Polygon" ? [region.geometry.coordinates] : region.geometry.coordinates)
    .flatMap((polygon) => polygon.map((ring) => ring.map((position) => projection(position as [number, number]) as Point)));
const bounds = [
  VIEWBOX.padding / 2,
  VIEWBOX.padding / 2,
  VIEWBOX.width - VIEWBOX.padding / 2,
  VIEWBOX.height - VIEWBOX.padding / 2,
] as const;

/** The shortest distance from any point of [rings] to any other region's outline. */
function clearance(name: string, rings: Point[][]): number {
  const mainland = states.features.filter((region) => region.properties?.name !== name).flatMap(ringsOf).flat();
  let best = Infinity;
  for (const [x, y] of rings.flat()) {
    for (const [mx, my] of mainland) best = Math.min(best, Math.hypot(x - mx, y - my));
  }
  return best;
}

describe("island groups on the real national map", () => {
  for (const name of ["Lakshadweep", "Andaman & Nicobar"]) {
    it(`keeps ${name} magnified, in open sea and inside the map`, () => {
      const region = states.features.find((candidate) => candidate.properties?.name === name)!;
      const trueRings = ringsOf(region);
      const placed = placeIslandGroup(String(region.properties?.id), name, trueRings, 22, bounds)!;

      const extent = (rings: Point[][]) => Math.max(...rings.flat().map(([x]) => x)) - Math.min(...rings.flat().map(([x]) => x));
      expect(extent(placed)).toBeGreaterThan(extent(trueRings) * 1.4);
      // Clear of every other region by a margin a reader can see.
      expect(clearance(name, placed)).toBeGreaterThan(20);
      for (const [x, y] of placed.flat()) {
        expect(x).toBeGreaterThanOrEqual(bounds[0]);
        expect(y).toBeGreaterThanOrEqual(bounds[1]);
        expect(x).toBeLessThanOrEqual(bounds[2]);
        expect(y).toBeLessThanOrEqual(bounds[3]);
      }
    });
  }
});
