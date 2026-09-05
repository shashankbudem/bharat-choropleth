import type { MapFeature, MapFeatureCollection, MapLayer, ReferenceOverlay } from "bharat-choropleth";
import { feature as topoFeature } from "topojson-client";
import statesTopology from "../../../data/generated/census-2011/states.topo.json";
import currentContextTopology from "../../../data/generated/datameet-current-claim-outline/outline.topo.json";
import jkCurrentClaimTopology from "../../../data/generated/datameet-current-claim-outline/historical-parent-overlays/in-hs-01-jammu-and-kashmir.topo.json";
import currentStatesTopology from "../../../data/generated/current-2019-states/states.topo.json";

type FeatureProperties = { id: string; name: string };

const YEARS = { 2024: 0.83, 2025: 0.92, 2026: 1 } as const;
export type DemoYear = keyof typeof YEARS;

function hash(value: string) {
  return [...value].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 17);
}

/**
 * Which synthetic indicator the map is showing. Three, because between them they
 * cover the presentation surface a real dashboard exercises: a plain count, a
 * bounded percentage, and a signed change that needs a divergent ramp and is the
 * only one here that produces negative values.
 */
export type DemoMetric = "index" | "coverage" | "change";

export function sampleValue(id: string, year: DemoYear, metric: DemoMetric = "index") {
  // Salting the hash with the metric keeps every series deterministic while
  // making them genuinely different numbers rather than one relabelled series.
  const base = hash(id + metric);
  if (metric === "coverage") return Math.round((42 + (base % 5600) / 100) * YEARS[year] * 10) / 10;
  if (metric === "change") return Math.round(((base % 2400) / 100 - 12) * 10) / 10;
  return Math.round((360 + (base % 6000)) * YEARS[year]);
}

export function properties(feature: MapFeature) {
  return feature.properties as FeatureProperties;
}

export function makeLayer(geometry: MapLayer["geometry"], year: DemoYear, metric: DemoMetric = "index"): MapLayer {
  return {
    geometry,
    getId: (feature) => properties(feature).id,
    getLabel: (feature) => properties(feature).name,
    // One stable no-data example lets consumers inspect the renderer's missing-value treatment.
    getValue: (feature) => properties(feature).id === "in-hs-31-lakshadweep" ? null : sampleValue(properties(feature).id, year, metric),
  };
}

const JK_STATE_ID = "in-hs-01-jammu-and-kashmir";

/**
 * The Census-2011 J&K feature only covers Indian-administered districts. For the
 * top-level state view we swap in DataMeet's current-claim outline (J&K + Ladakh,
 * matching the Survey of India political-map extent) so J&K renders as one normal
 * interactive state, same as every other state — no separate reference patch.
 * District drill-down still uses the Census-2011 boundary; only the 22 historical
 * districts carry real values there.
 */
function statesWithJkCurrentClaimExtent(): MapFeatureCollection {
  const statesTopo = statesTopology as never as { objects: Record<string, never> };
  const claimTopo = jkCurrentClaimTopology as never as { objects: Record<string, never> };
  const states = topoFeature(statesTopo as never, statesTopo.objects.states) as unknown as MapFeatureCollection;
  const claim = topoFeature(claimTopo as never, claimTopo.objects.outline) as unknown as MapFeatureCollection;
  const claimGeometry = claim.features[0]?.geometry;
  if (!claimGeometry) return states;
  return {
    ...states,
    features: states.features.map((stateFeature) =>
      properties(stateFeature).id === JK_STATE_ID
        ? { ...stateFeature, geometry: claimGeometry }
        : stateFeature,
    ),
  };
}

export function stateLayer(year: DemoYear, metric: DemoMetric = "index") {
  return makeLayer(statesWithJkCurrentClaimExtent(), year, metric);
}

/**
 * The independently sourced current-vintage (~2019) state/UT bundle: J&K and Ladakh
 * are already separate, full-extent regions in the source geometry, so no reference
 * overlay or id swap is needed here.
 */
export function currentStateLayer(year: DemoYear, metric: DemoMetric = "index") {
  return makeLayer({ topology: currentStatesTopology as never, object: "states" }, year, metric);
}

const districtModules = import.meta.glob("../../../data/generated/census-2011/districts/*.topo.json");
const districtReferenceModules = import.meta.glob("../../../data/generated/datameet-current-claim-outline/historical-parent-overlays/*.topo.json");
const currentDistrictModules = import.meta.glob("../../../data/generated/current-2019-districts/districts/*.topo.json");
const currentDistrictReferenceModules = import.meta.glob("../../../data/generated/current-2019-districts/district-reference-overlays/*.topo.json");
const currentSubDistrictModules = import.meta.glob("../../../data/generated/current-2019-subdistricts/subdistricts/*.topo.json");

/** DataMeet CC BY 4.0 contemporary context geometry; it is not SoI geometry. */
export function currentContextOverlay(): ReferenceOverlay {
  return {
    geometry: { topology: currentContextTopology as never, object: "outline" },
    getId: (feature) => properties(feature).id,
    getLabel: (feature) => properties(feature).name,
    getDescription: () => "National reference outline; hatched portions outside the statistical layer have no data.",
  };
}

export async function loadDistrictLayer(stateId: string, _state: { id: string }, year: DemoYear, metric: DemoMetric = "index"): Promise<MapLayer> {
  const load = districtModules[`../../../data/generated/census-2011/districts/${stateId}.topo.json`];
  if (!load) return makeLayer({ type: "FeatureCollection", features: [] }, year, metric);
  const module = await load();
  return makeLayer({ topology: (module as { default: unknown }).default as never, object: "districts" }, year, metric);
}

export async function loadCurrentDistrictLayer(stateId: string, _state: { id: string }, year: DemoYear, metric: DemoMetric = "index"): Promise<MapLayer> {
  const load = currentDistrictModules[`../../../data/generated/current-2019-districts/districts/${stateId}.topo.json`];
  if (!load) return makeLayer({ type: "FeatureCollection", features: [] }, year, metric);
  const module = await load();
  return makeLayer({ topology: (module as { default: unknown }).default as never, object: "districts" }, year, metric);
}

/**
 * Sub-districts (tehsils / taluks / mandals / blocks) for one current-edition
 * district, or null where the bundle has none.
 *
 * Three of the 788 districts have no sub-district asset — Delhi's Nazul, which is
 * a land-tenure artifact rather than a district, and Rajasthan's urban Jaipur and
 * Jodhpur, whose source polygons sit inside their own rural halves. Returning null
 * leaves those as leaves instead of opening an empty view.
 */
export async function loadCurrentSubDistrictLayer(districtId: string, _district: { id: string }, _stateId: string, year: DemoYear, metric: DemoMetric = "index"): Promise<MapLayer | null> {
  const load = currentSubDistrictModules[`../../../data/generated/current-2019-subdistricts/subdistricts/${districtId}.topo.json`];
  if (!load) return null;
  const module = await load();
  return makeLayer({ topology: (module as { default: unknown }).default as never, object: "subdistricts" }, year, metric);
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

/**
 * Only current-edition J&K gets this: Mirpur and Muzaffarabad are Pakistan-administered
 * districts in the source, not Indian districts, so they're kept out of the value-bearing
 * district set and rendered here as non-interactive reference context instead.
 */
export async function loadCurrentDistrictReferenceOverlay(stateId: string): Promise<ReferenceOverlay | null> {
  const load = currentDistrictReferenceModules[`../../../data/generated/current-2019-districts/district-reference-overlays/${stateId}.topo.json`];
  if (!load) return null;
  const module = await load();
  return {
    geometry: { topology: (module as { default: unknown }).default as never, object: "outline" },
    getId: (feature) => properties(feature).id,
    getLabel: (feature) => properties(feature).name,
    getDescription: () => "Pakistan-administered districts; not Indian territory and have no metric or district coverage.",
  };
}
