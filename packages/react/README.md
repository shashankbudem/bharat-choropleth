# `bharat-choropleth`

An accessible React SVG choropleth for India state and district dashboards.
It supports keyboard and pointer inspection, and lazy-loads district layers when
a user selects a state, then sub-district layers when a user selects a district.

Two entry points, same renderer:

- **`BharatChoropleth`** — map state names to numbers and you have a map. Fetches
  boundary data for you. Start here.
- **`IndiaChoropleth`** — the core renderer. You supply every layer, accessor and
  piece of navigation state. Everything below the quick start uses it.

## Install

```bash
npm install bharat-choropleth
```

Import the stylesheet once in the application that mounts the map:

```ts
import "bharat-choropleth/style.css";
```

## Quick start

```tsx
import { BharatChoropleth } from "bharat-choropleth";
import "bharat-choropleth/style.css";

export function Map() {
  return (
    <BharatChoropleth
      values={{
        Telangana: 82,
        Karnataka: 74,
        Maharashtra: 91,
      }}
    />
  );
}
```

That is the whole setup. Boundary data is fetched from the prepared bundle (this
package still ships none), states you omit render as "no data", and clicking a
state drills into its districts, then into that district's sub-districts.

Keys are resolved through the state registry, so every spelling of a state that
a reader might reasonably type lands on the same region — display name, slug,
LGD id, case-insensitive, separator-free, and former names:

```tsx
<BharatChoropleth
  values={{
    Goa: 6,
    "Tamil Nadu": 18,
    tamilnadu: 18,          // separator-free
    "Jammu & Kashmir": 2,   // & normalizes to "and"
    Orissa: 8,              // former name → Odisha
    "in-cs-30-goa": 6,      // LGD id
  }}
/>
```

A name it does not recognize is ignored with one console warning naming what you
typed; it never throws, and the rest of the map still renders. `0` is a value,
not missing data — only `null` or an omitted state reads as "no data".

Row-shaped data works without reshaping it first:

```tsx
<BharatChoropleth
  data={[
    { state: "Telangana", value: 82 },
    { state: "Karnataka", value: 74 },
  ]}
  regionKey="state"
  valueKey="value"
/>
```

`regionKey` and `valueKey` default to `"region"` and `"value"`. `values` is the
primary API: if you pass both, `values` wins and `data` is ignored rather than
merged.

Every `IndiaChoropleth` prop except `states` passes straight through, so reaching
for the full renderer's behaviour is a prop rather than a rewrite:

```tsx
<BharatChoropleth
  values={values}
  colorScale={["#eef7f5", "#075b55"]}
  formatValue={(value) => `${value}%`}
  renderTooltip={(context) => <MyTooltip {...context} />}
  onSelectedChange={(region, level) => track(region, level)}
  showLegend={false}
/>
```

Point `dataBaseUrl` at your own copy of `data/generated` to self-host the
boundary bundles, or pass `geometry` to supply the state layer yourself — which
also turns drill-down off, since the district files are no longer known to sit
beside it. Turn it back on explicitly with `districts` / `subDistricts` plus your
own `loadDistricts` / `loadSubDistricts`.

### Values below the state level

`values` is state-level. Sub-state numbers go through the loader that fetches
that level's geometry, which is where the ids for those regions actually exist:

```tsx
<BharatChoropleth
  values={stateValues}
  loadDistricts={async (stateId) => ({
    ...(await loadDistrictGeometry(stateId)),
    getValue: (feature) => districtValues[String(feature.properties?.id)] ?? null,
  })}
/>
```

There is deliberately no `districtValues` prop keyed by district name. District
names repeat across states — Aurangabad, Bilaspur and Hamirpur each name
districts in two — and unlike states there is no district registry to resolve a
name against, so such a prop could not be validated or warned about until the
state it belongs to had been drilled into.

## Advanced usage

`IndiaChoropleth` is the core renderer and is not going anywhere — the component
above is sugar over it. Use it directly when you own the geometry.

The package intentionally contains no geographic boundary data. Provide a
GeoJSON feature collection or TopoJSON object plus stable IDs, labels, and
values from your data source:

```tsx
import { IndiaChoropleth, type MapLayer } from "bharat-choropleth";
import statesTopology from "./states.topo.json";

const states: MapLayer = {
  geometry: { topology: statesTopology, object: "states" },
  getId: (feature) => String(feature.properties?.id),
  getLabel: (feature) => String(feature.properties?.name),
  getValue: (feature) => valuesByStateId[String(feature.properties?.id)] ?? null,
};

export function IndiaMap() {
  return <IndiaChoropleth states={states} />;
}
```

For lazy state-to-district navigation, add `loadDistricts`. It receives the
selected stable state ID and returns another `MapLayer`:

```tsx
<IndiaChoropleth
  states={states}
  loadDistricts={async (stateId) => {
    const topology = await import(`./districts/${stateId}.topo.json`);
    return {
      geometry: { topology: topology.default, object: "districts" },
      getId: (feature) => String(feature.properties?.id),
      getLabel: (feature) => String(feature.properties?.name),
      getValue: (feature) => districtValues[String(feature.properties?.id)] ?? null,
    };
  }}
/>
```

Add `loadSubDistricts` for a third level below districts. It receives the district
ID, the district region, and the state ID it sits in:

```tsx
<IndiaChoropleth
  states={states}
  loadDistricts={loadDistricts}
  loadSubDistricts={async (districtId) => {
    const topology = await import(`./subdistricts/${districtId}.topo.json`);
    return {
      geometry: { topology: topology.default, object: "subdistricts" },
      getId: (feature) => String(feature.properties?.id),
      getLabel: (feature) => String(feature.properties?.name),
      getValue: (feature) => subDistrictValues[String(feature.properties?.id)] ?? null,
    };
  }}
/>
```

Return `null` for a district that has no sub-district level. Not every district has
one, and a district that returns `null` is left as a leaf — the map stays on the
district view and selects it, rather than opening a level with nothing in it. Once a
district has answered `null` it stops offering the level and is not asked again.

Without `loadSubDistricts`, a district is a leaf and activation only selects it,
exactly as before.

The breadcrumb gains a third segment. Its back step goes up exactly one level;
"All states" is the one-step return to the national map. Controlled usage adds
`subDistrictDrillDownId` / `onSubDistrictDrillDownChange`, with
`defaultSubDistrictDrillDownId` as the uncontrolled path — and because a district ID
means nothing outside the state it came from, changing `drillDownId` clears it.

## Features

- Keyboard-accessible regions with Enter/Space activation and focus inspection.
- Tooltip, legend, breadcrumb, formatting, and insight render slots.
- Controlled or uncontrolled selection and drill-down state.
- Optional neutral reference overlays kept outside statistical values.
- GeoJSON and TopoJSON inputs, with `d3-geo` projection sized to the SVG.
- `BharatChoropleth` for name-keyed values, fetched boundary data, and drill-down
  configured for you.

`BharatChoroplethProps`, `IndiaChoroplethProps` and the related layer/context
types are exported for TypeScript consumers, along with the state registry
(`STATES`, `resolveState`, `normalizeStateKey`) if you want to resolve names
yourself. See the [repository](https://github.com/shashankbudem/bharat-choropleth)
for the full API, examples, boundary-data attribution, and the framework-free
[`bharat-choropleth-js`](https://www.npmjs.com/package/bharat-choropleth-js)
package.

## Local development

```bash
pnpm build
pnpm typecheck
pnpm test
```

## Licence

MIT. This npm package contains renderer code only. Geographic data used with
it may have separate licence and attribution requirements.
