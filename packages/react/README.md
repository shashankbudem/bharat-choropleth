# `bharat-choropleth`

An accessible React SVG choropleth for India state and district dashboards.
It renders a supplied state layer, supports keyboard and pointer inspection,
and can lazy-load district layers when a user selects a state, then sub-district
layers when a user selects a district.

## Install

```bash
npm install bharat-choropleth
```

Import the stylesheet once in the application that mounts the map:

```ts
import "bharat-choropleth/style.css";
```

## Use

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

`IndiaChoroplethProps` and its related layer/context types are exported for
TypeScript consumers. See the [repository](https://github.com/shashankbudem/bharat-choropleth)
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
