# Bharat Choropleth

`bharat-choropleth` is an open-source React renderer for accessible India state-to-district choropleths. This workspace also includes a separately documented, historical Census-2011 state/UT-to-district boundary bundle for the reference implementation.

The package turns a state GeoJSON/TopoJSON layer into an accessible SVG map, then loads a selected state's district layer on demand. It follows the approved Atlas UX: hover/focus inspection, activation/drill-down, a breadcrumb return, optional legend and host-owned insight content.

![Bharat Choropleth reference dashboard](./previews/country-full-claimed-outline-desktop.png)

## Package layout

```text
packages/react    Published SVG React renderer, styles, types, and tests
data              Reproducible Census-2011 boundary preparation, manifest, and attribution
apps/demo         Documentation/demo application using the included historical bundle
```

The code and boundary data have different licences. The React renderer is MIT licensed. The included Census-2011 geometry is derived from DataMeet’s district dataset and is licensed CC BY 2.5 India; it requires attribution and is not a current administrative register. See [data/README.md](./data/README.md), [data/ATTRIBUTION.md](./data/ATTRIBUTION.md), and [the generated manifest](./data/generated/census-2011/manifest.json) before redistributing it.

An optional political-claim context overlay is a separate contemporary DataMeet state-derived asset, attributed under DataMeet’s CC BY 4.0 repository terms and checked against the [Survey of India political-map depiction](https://surveyofindia.gov.in/pages/political-map-of-india). It is a non-statistical reference layer—not Survey of India geometry, not a statement of administrative control, and not an input to any metric or total. The package does not reproduce or redistribute Survey of India geometry; see [the boundary-source note](./data/official-outline.md).

## Design decisions

- Stable feature IDs are mandatory. The included historical bundle uses deterministic Census-derived IDs; for consumer-supplied contemporary geometry, use its stable identifiers (prefer LGD codes where available). Display names are only labels.
- The `MapLayer` requires explicit ID, label, and value accessors. It does not assume a provider's property names or a business metric.
- `drillDownId` and `selectedId` support controlled usage; `defaultDrillDownId` and `defaultSelectedId` are the ergonomic uncontrolled path.
- `loadDistricts` is lazy and runs only after state activation. The host can use a dynamic import, fetch, or local cache.
- Geometry accepts GeoJSON `FeatureCollection` or TopoJSON with an object key. `d3-geo` projects each level into a responsive SVG viewBox.
- `referenceOverlay` accepts separate national-only reference geometry—such as an outline or claimed area—that must never be coloured, selected, drilled into, or counted. It renders in a neutral hatch; the host provides its exact accessible description instead of the renderer assuming the whole outline lacks data.
- Tooltip and insight UI are slots. Default copy contains only generic data concepts; a dashboard owns its metric/year wording and surrounding chrome.
- Regions are keyboard focusable and activate with Enter/Space. Focus and pointer hover have the same inspection callback. CSS includes a reduced-motion mode and public CSS variables.

## Install

```bash
pnpm add bharat-choropleth
```

Import the default stylesheet once:

```ts
import "bharat-choropleth/style.css";
```

## Minimal usage

```tsx
import { IndiaChoropleth, type MapLayer } from "bharat-choropleth";
import "bharat-choropleth/style.css";
import census2011States from "./data/generated/census-2011/states.topo.json";

const stateLayer: MapLayer = {
  geometry: { topology: census2011States, object: "states" },
  getId: (feature) => String(feature.properties?.id),
  getLabel: (feature) => String(feature.properties?.name),
  getValue: (feature) => valuesById[String(feature.properties?.id)] ?? null,
};

export function Map() {
  return (
    <IndiaChoropleth
      states={stateLayer}
      loadDistricts={async (stateId, state) => {
        const module = await import(`./data/generated/census-2011/districts/${stateId}.topo.json`);
        return {
          geometry: { topology: module.default, object: "districts" },
          getId: (feature) => String(feature.properties?.id),
          getLabel: (feature) => String(feature.properties?.name),
          getValue: (feature) => valuesById[String(feature.properties?.id)] ?? null,
        };
      }}
      formatValue={(value) => new Intl.NumberFormat("en-IN").format(value)}
      renderTooltip={({ label, value, share }) => (
        <><strong>{label}</strong><b>{value ?? "No data"}</b><small>{share?.toFixed(1)}% share</small></>
      )}
    />
  );
}
```

## Controlled drill-down

```tsx
const [drillDownId, setDrillDownId] = useState<string | null>(null);

<IndiaChoropleth
  states={stateLayer}
  drillDownId={drillDownId}
  onDrillDownChange={setDrillDownId}
  loadDistricts={loadDistrictLayer}
/>
```

## Non-statistical national reference geometry

Keep any non-statistical claim or outline separate from state metrics. This API deliberately has no value accessor, so it cannot accidentally inherit a choropleth colour or aggregate.

```tsx
<IndiaChoropleth
  states={stateLayer}
  referenceOverlay={{
    geometry: referenceGeoJson,
    getId: (feature) => String(feature.properties?.id),
    getLabel: (feature) => String(feature.properties?.name),
    getDescription: () => "National reference outline; hatched portions outside the statistical layer have no data.",
  }}
/>
```

The overlay appears only at the national level. Its neutral hatch and legend key distinguish it from reportable regions; it is non-interactive and exposed to assistive technology with the host-provided coverage context.

## District reference context

When an historic district layer needs a newer non-statistical context outline, load it only for the matching parent ID. The overlay is independently fetched, stale-safe, shares the district projection, and is unavailable as a metric or a drill-down target.

```tsx
<IndiaChoropleth
  states={stateLayer}
  loadDistricts={loadDistricts}
  loadDistrictReferenceOverlay={async (stateId) => {
    if (stateId !== "historical-parent-id") return null;
    return { geometry: historicalContextGeometry, getId, getLabel, getDescription };
  }}
/>
```

When controlled, update `drillDownId` in `onDrillDownChange`; the callback is a notification, not an internal override. The same controlled/uncontrolled convention applies to selection.

## Commands

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm build:data # requires the pinned DataMeet source checkout; not part of pnpm check
pnpm build:demo
pnpm validate:data

# Runs all of the above release checks.
pnpm check
```

## Before public release

- Publish the renderer and the historical data bundle as separately versioned artifacts, retaining the data manifest and CC BY 2.5 India attribution.
- Add visual regression and screen-reader testing using the included Census-2011 bundle and every future source edition.
- Establish public package scope, release automation, security reporting, and a policy for future official/current boundary editions.
