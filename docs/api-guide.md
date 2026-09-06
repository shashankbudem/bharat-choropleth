# Integration guide and target API

The component owns map interaction and rendering. Your application owns the metric, labels, colour semantics, and boundary choice.

The snippets below describe the public contract as published. Keep the names aligned with the exported TypeScript declarations.

There are two React entry points. `BharatChoropleth` is the short path: names to
numbers, boundary data fetched for you. `IndiaChoropleth` is the renderer under
it, which you drive yourself — everything from *Country map with a controlled
drill-down* onward uses it. Neither replaces the other, and moving from one to
the other is a prop change rather than a rewrite, because the facade forwards
every `IndiaChoropleth` prop except `states`.

## The short path

```tsx
import { BharatChoropleth } from "bharat-choropleth";
import "bharat-choropleth/style.css";

<BharatChoropleth values={{ Telangana: 82, Karnataka: 74, Maharashtra: 91 }} />
```

Keys go through the state registry, so display names, slugs, LGD ids, former
names (`Orissa`), separator-free forms (`tamilnadu`) and any casing all land on
the same region. A key it does not recognize is ignored with one console warning
naming what you typed, once the boundary data has arrived and the real label set
is known — never a throw, and never a guess before the data is in.

District numbers nest under the state they belong to, because district names
repeat across states and, unlike states, have no registry to resolve a bare name
against:

```tsx
<BharatChoropleth
  values={{ Telangana: 82 }}
  districtValues={{ Telangana: { Hyderabad: 90, "Ranga Reddy": 76 } }}
/>
```

There is no `subDistrictValues`; supply those through `loadSubDistricts`.

Row-shaped input is read with `data` + `regionKey` + `valueKey`. When both
`values` and `data` are given, `values` wins and `data` is ignored — they are not
merged.

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

## Lazy sub-district geometry

A third level below districts. `loadSubDistricts` receives the district ID, the
district region, and the state ID it sits in:

```tsx
async function loadSubDistricts(districtId: string, district: MapRegion, stateId: string): Promise<MapLayer | null> {
  const load = subDistrictLoaders[districtId]; // A bundler-safe explicit loader map.
  // No loader means this district has no sub-district level. Returning null leaves
  // it a leaf: the map stays on the district view and selects it.
  if (!load) return null;
  const module = await load();
  const values = valuesForDistrict(district.id);
  return {
    geometry: { topology: module.default, object: "subdistricts" },
    getId: (feature) => String(feature.properties?.id),
    getLabel: (feature) => String(feature.properties?.name),
    getValue: (feature) => values.get(String(feature.properties?.id)) ?? null,
  } satisfies MapLayer;
}

<IndiaChoropleth
  states={states}
  loadDistricts={loadDistricts}
  loadSubDistricts={loadSubDistricts}
  drillDownId={drillDownId}
  onDrillDownChange={setDrillDownId}
  subDistrictDrillDownId={subDistrictDrillDownId}
  onSubDistrictDrillDownChange={setSubDistrictDrillDownId}
/>
```

Omit `loadSubDistricts` and a district stays a leaf, exactly as before. A district
id means nothing outside the state it came from, so changing `drillDownId` clears
`subDistrictDrillDownId`; when controlled, mirror that in your own state.

The renderer cannot know which districts are leaves without asking, so every district
offers the level until its loader answers `null` — after which that district stops
offering it and is not asked again.

**Renderer parity:** the sub-district level is implemented in the React, plain-JS and
Flutter packages. In Flutter the loader is `loadSubDistricts`, with the same
null-means-leaf contract, alongside `subDistrictDrillDownId` and
`onSubDistrictDrillDownChange`; its breadcrumb gains a third crumb whose middle link
returns to the districts rather than to the national map. In Python the notebook
control takes `sub_district_loader` under the same contract, adds a district selector
beside the state one, and steps `Back` one level at a time. Every renderer in the
repository now offers the level; each keeps its two-level behaviour when the loader is
omitted.

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

A value only ever means something against the other regions at its own level:
colour bands and the legend filter are derived per level, so a district's number
is scaled against the other districts in its state, not against the states.

## Key semantics across the packages

`values` keys resolve identically in all four packages — the same 36 states, the
same 15 aliases, the same normalization. React and plain JS share one
`states.ts` as a byte-identical copy checked by a test; Flutter and Python carry
translations held to the same behaviour by a generated fixture of every accepted
spelling (`pnpm generate:state-cases`), replayed by a test in each. Below the
state level there is no registry anywhere: district and sub-district keys match
by id or by a normalized name, which is still case- and separator-insensitive.

| Written | React / JS | Flutter | Python |
| --- | --- | --- | --- |
| `in-cs-30-goa` (id) | ✅ | ✅ | ✅ |
| `Goa` (display name) | ✅ | ✅ | ✅ |
| `goa`, `GOA` | ✅ | ✅ | ✅ |
| `tamilnadu`, `tamil_nadu` | ✅ | ✅ | ✅ |
| `Orissa` → Odisha | ✅ | ✅ | ✅ |
| `jammu-and-kashmir` for `Jammu & Kashmir` | ✅ | ✅ | ✅ |

Every package tries an exact id first, then an exact display name, and only then
the registry — so a layer keyed by the ids in its own bundle behaves exactly as
it did before any of this existed.

In every package an unmatched key is ignored and its region reads as "No data".
React and plain JS warn on the console when they can tell a state name is
unrecognized; Flutter and Python do not warn, so a typo there is silent.
