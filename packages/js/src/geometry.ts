import { feature as topoFeature } from "topojson-client";
import type { GeometryObject } from "topojson-specification";
import type { GeometrySource, MapFeatureCollection } from "./types";

export function asFeatureCollection(source: GeometrySource): MapFeatureCollection {
  if ("type" in source && source.type === "FeatureCollection") {
    return source;
  }

  const topoSource = source as Exclude<GeometrySource, MapFeatureCollection>;

  const object = (typeof topoSource.object === "string"
    ? topoSource.topology.objects[topoSource.object]!
    : topoSource.object) as unknown as GeometryObject;
  if (!object) {
    throw new Error("The named TopoJSON object does not exist in this topology.");
  }

  const unpacked = topoFeature(topoSource.topology, object);
  return unpacked.type === "FeatureCollection"
    ? (unpacked as MapFeatureCollection)
    : { type: "FeatureCollection", features: [unpacked] };
}

export function totalOf(values: readonly (number | null)[]) {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}
