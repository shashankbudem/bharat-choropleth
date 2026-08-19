# `bharat-choropleth`

An accessible React SVG choropleth for India state and district dashboards.
It renders a supplied state layer, supports keyboard and pointer inspection,
and can lazy-load district layers when a user selects a state.

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
