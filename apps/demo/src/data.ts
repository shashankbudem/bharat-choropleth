import type { MapFeature, MapLayer, ReferenceOverlay } from "bharat-choropleth";
import statesTopology from "../../../data/generated/census-2011/states.topo.json";
import currentContextTopology from "../../../data/generated/datameet-current-claim-outline/outline.topo.json";

type FeatureProperties = { id: string; name: string };

const YEARS = { 2024: 0.83, 2025: 0.92, 2026: 1 } as const;
export type DemoYear = keyof typeof YEARS;

function hash(value: string) {
  return [...value].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 17);
}

export function sampleValue(id: string, year: DemoYear) {
  return Math.round((360 + (hash(id) % 6000)) * YEARS[year]);
}

export function properties(feature: MapFeature) {
  return feature.properties as FeatureProperties;
}

export function makeLayer(geometry: MapLayer["geometry"], year: DemoYear): MapLayer {
  return {
    geometry,
    getId: (feature) => properties(feature).id,
    getLabel: (feature) => properties(feature).name,
    // One stable no-data example lets consumers inspect the renderer's missing-value treatment.
    getValue: (feature) => properties(feature).id === "in-hs-31-lakshadweep" ? null : sampleValue(properties(feature).id, year),
  };
}

export function stateLayer(year: DemoYear) {
  return makeLayer({ topology: statesTopology as never, object: "states" }, year);
}

const districtModules = import.meta.glob("../../../data/generated/census-2011/districts/*.topo.json");
const districtReferenceModules = import.meta.glob("../../../data/generated/datameet-current-claim-outline/historical-parent-overlays/*.topo.json");

/** DataMeet CC BY 4.0 contemporary context geometry; it is not SoI geometry. */
export function currentContextOverlay(): ReferenceOverlay {
  return {
    geometry: { topology: currentContextTopology as never, object: "outline" },
    getId: (feature) => properties(feature).id,
    getLabel: (feature) => properties(feature).name,
    getDescription: () => "National reference outline; hatched portions outside the statistical layer have no data.",
  };
}

export async function loadDistrictLayer(stateId: string, _state: { id: string }, year: DemoYear): Promise<MapLayer> {
  const load = districtModules[`../../../data/generated/census-2011/districts/${stateId}.topo.json`];
  if (!load) return makeLayer({ type: "FeatureCollection", features: [] }, year);
  const module = await load();
  return makeLayer({ topology: (module as { default: unknown }).default as never, object: "districts" }, year);
}

/** Only historical J&K gets extra DataMeet current-context geometry behind its Census districts. */
export async function loadDistrictReferenceOverlay(stateId: string): Promise<ReferenceOverlay | null> {
  const load = districtReferenceModules[`../../../data/generated/datameet-current-claim-outline/historical-parent-overlays/${stateId}.topo.json`];
  if (!load) return null;
  const module = await load();
  return {
    geometry: { topology: (module as { default: unknown }).default as never, object: "outline" },
    getId: (feature) => properties(feature).id,
    getLabel: (feature) => properties(feature).name,
    getDescription: () => "Current reference outline; hatched portions outside the Census-2011 district layer have no data.",
  };
}
