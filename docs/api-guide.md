# Integration guide and target API

The component owns map interaction and rendering. Your application owns the metric, labels, colour semantics, and boundary choice.

The snippets below describe the public contract intended for v0.1. Keep the final names aligned with the exported TypeScript declarations.

## Country map with a controlled drill-down

```tsx
import {
  IndiaChoropleth,
  type MapLayer,
  type MapRegion,
} from "bharat-choropleth";
import stateGeometry from "./boundaries/states.topo.json";

const values = new Map([
  ["in-hs-27-maharashtra", 1520],
  ["in-hs-29-karnataka", 980],
  ["in-hs-07-nct-of-delhi", null], // No data, distinct from zero.
]);

const states: MapLayer = {
  geometry: { topology: stateGeometry, object: "states" },
  getId: (feature) => String(feature.properties?.id),
  getLabel: (feature) => String(feature.properties?.name),
  getValue: (feature) => values.get(String(feature.properties?.id)) ?? null,
};

function PerformanceMap() {
  const [drillDownId, setDrillDownId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <IndiaChoropleth
      states={states}
      drillDownId={drillDownId}
      selectedId={selectedId}
      formatValue={(value) => value.toLocaleString("en-IN")}
      onSelectedChange={(region) => setSelectedId(region.id)}
      onDrillDownChange={(stateId) => setDrillDownId(stateId)}
    />
  );
}
```

`id` must use the identifier scheme published by the geometry package. Avoid matching on `name`; labels can change, be transliterated, or be duplicated. The bundled historical hierarchy uses deterministic Census-derived IDs: parent states/UTs are `in-hs-{zero-padded ST_CEN_CD}-{normalised source name}`, and districts are `in-d{zero-padded ST_CEN_CD}-{zero-padded DT_CEN_CD}`. The full source-native code and exact mapping are recorded in `data/generated/census-2011/manifest.json`.

This historical hierarchy is intended to be used together at both levels. It is not a crosswalk to newer state/UT boundaries. For contemporary official geometry, supply your own layer and stable IDs (prefer LGD IDs where available).

## Lazy district geometry

```tsx
const [districtLayer, setDistrictLayer] = useState<MapLayer | null>(null);

async function loadDistricts(stateId: string, state: MapRegion): Promise<MapLayer> {
  const module = await districtLoaders[stateId](); // A bundler-safe explicit loader map.
  const values = valuesForState(state.id);
  const layer = {
    geometry: { topology: module.default, object: "districts" },
    getId: (feature) => String(feature.properties?.id),
    getLabel: (feature) => String(feature.properties?.name),
    getValue: (feature) => values.get(String(feature.properties?.id)) ?? null,
  } satisfies MapLayer;
  setDistrictLayer(layer);
  return layer;
}

<IndiaChoropleth
  states={states}
  loadDistricts={loadDistricts}
  drillDownId={drillDownId}
  onDrillDownChange={setDrillDownId}
/>
```

The reference demo uses a bundler-safe explicit loader map rather than an unrestricted runtime import.

## Supply your own geometry

```tsx
import officialStateGeometry from "./boundaries/state-2026.geojson";

<IndiaChoropleth
  states={{
    geometry: officialStateGeometry,
    getId: (feature) => String(feature.properties?.lgd_code),
    getLabel: (feature) => String(feature.properties?.state_name),
    getValue: (feature) => beneficiaryCount.get(String(feature.properties?.lgd_code)) ?? null,
  }}
  ariaLabel="Beneficiaries by state"
/>
```

Do not remove the source’s required notices when supplying alternative geometry. See [data and attribution](./data-and-attribution.md).

## Value semantics

| Input | Required presentation |
| --- | --- |
| `0` | A valid zero-value region; never a missing value. |
| `null` or omitted | A labelled no-data fill and tooltip/summary text. |
| Positive number | Sequential scale by default. |
| Negative number | Caller supplies a divergent scale or explicitly opts into the library’s divergent scale. |
