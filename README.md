# Bharat Choropleth

`bharat-choropleth` is an open-source React renderer for accessible India state-to-district choropleths — a zero-config `BharatChoropleth` component over a full `IndiaChoropleth` renderer — with a framework-free `bharat-choropleth-js` port for non-React use — same behavior, same CSS, either an ES module or a single `<script>` tag. A native `bharat_choropleth` Flutter package provides the same map interaction without a WebView, and the Python `bharat_choropleth` package produces static SVG or optional Matplotlib output. This workspace also includes the current (2019) state, district and sub-district boundary bundles the packages load by default.

The package turns a state GeoJSON/TopoJSON layer into an accessible SVG map, then loads a selected state's district layer on demand — and, below that, a selected district's sub-districts (tehsils / taluks / mandals / blocks). It follows the approved Atlas UX: hover/focus inspection, activation/drill-down, a breadcrumb return, optional legend and host-owned insight content. The legend also filters — picking a swatch highlights the regions painted in it and dulls the rest, picked again or Escape to clear.

![Bharat Choropleth current 2019-boundary dashboard](./previews/country-desktop.png)

**[Try the live demo →](https://shashankbudem.is-a.dev/bharat-choropleth/)** — the
same dashboard built three times, once per ecosystem, on published Indian
statistics plus a live temperature feed that drills to sub-district.

## Examples

### National view

![National state and union-territory choropleth using the current 2019 boundaries](./previews/country-desktop.png)

### District drill-down

![Maharashtra district choropleth drill-down using the current 2019 boundaries](./previews/maharashtra-districts-desktop.png)

Activating a district goes one level further, into its sub-districts — see [Sub-district drill-down](#sub-district-drill-down).

### Sub-district level, on live data

![Sub-districts of Pune district coloured by current temperature, with a breadcrumb reading All states / Maharashtra / Pune](./previews/observatory-subdistrict-desktop.png)

The third level, in the [observatory example](./examples/observatory). Published
statistics stop where their source stops — a figure is collected on particular
administrative units — so the indicator that reaches sub-district is read live
from a weather API, which answers for a coordinate.

### Responsive layout

![Mobile national choropleth view using the current 2019 boundaries](./previews/country-mobile.png)

## Package layout

```text
packages/react    React: zero-config `<BharatChoropleth values={...} />` over the full `IndiaChoropleth` renderer
packages/js       Framework-free library: `new BharatChoropleth("#map")` from a <script> tag, or ESM
packages/flutter  Native Dart/Flutter renderer (CustomPainter) — full parity with the web packages, no WebView
packages/python   Dependency-light Python renderer: accessible SVG by default, optional Matplotlib
data              Reproducible preparation, manifests and attribution for the 2019 boundary bundles
apps/demo         Documentation/demo application on the current 2019 boundaries
```

`pnpm check` covers the JavaScript workspace only. The Flutter and Python packages are independently packaged — run `pnpm check:flutter` for the Dart one, and the Python checks from `packages/python`.

The Flutter example's boundary assets are generated data and are not committed, so a fresh clone has an empty `packages/flutter/example/assets/`. `pnpm check:flutter` and `pnpm build:pages` populate it themselves; run `pnpm prepare:flutter-assets` by hand before invoking `flutter` directly. Without it `flutter analyze` exits non-zero on the missing asset directory.

## Availability

The packages are versioned independently — a fix in one does not oblige the
others to move — so check the registry rather than assuming they match.

| Target | Package | Registry | Source |
| --- | --- | --- | --- |
| React | [`bharat-choropleth@0.3.1`](https://www.npmjs.com/package/bharat-choropleth) | npm | [`packages/react`](./packages/react) |
| Plain JavaScript | [`bharat-choropleth-js@0.3.1`](https://www.npmjs.com/package/bharat-choropleth-js) | npm | [`packages/js`](./packages/js) |
| Flutter | [`bharat_choropleth@0.3.0`](https://pub.dev/packages/bharat_choropleth) | pub.dev | [`packages/flutter`](./packages/flutter) |
| Python | [`bharat-choropleth@0.3.0`](https://pypi.org/project/bharat-choropleth/) | PyPI | [`packages/python`](./packages/python) |

The Grafana panel is released separately as
[`shashankbudem-bharatchoropleth-panel`](https://github.com/shashankbudem/shashankbudem-bharatchoropleth-panel),
which vendors its own copy of the boundaries so it installs without this repository.

Install with:

```bash
# React
npm add bharat-choropleth

# Framework-free JavaScript
npm add bharat-choropleth-js

# Flutter
flutter pub add bharat_choropleth

# Python
pip install bharat-choropleth
```

Maintainers: see [Publishing the packages](./docs/PUBLISHING.md) for the release checklist. Do not put registry credentials in this repository or in committed configuration.

## Persistent hosted parity demos (Cloudflare Pages)

Build the three current-vintage parity demos as one static Cloudflare Pages
artifact; unlike a Quick Tunnel, it remains online after the local
`cloudflared` process exits:

```bash
pnpm install --frozen-lockfile
pnpm build:pages
pnpm dlx wrangler@4 login
pnpm dlx wrangler@4 pages project create bharat-choropleth-demos --production-branch main
CLOUDFLARE_PAGES_PROJECT_NAME=bharat-choropleth-demos pnpm deploy:pages -- --branch=main
```

The artifact is `dist/cloudflare-pages/`, with stable `/react/`, `/js/`, and
`/flutter/` routes. A Direct Upload project is separate from Cloudflare Pages
Git integration; use a separate Git-integrated project if automatic GitHub or
GitLab builds are needed.

The code and boundary data have different licences. The packages are MIT licensed. The boundary bundles (`data/generated/current-2019-states/`, `current-2019-districts/` and `current-2019-subdistricts/`) are MIT-licensed assets derived from [`datta07/INDIAN-SHAPEFILES`](https://github.com/datta07/INDIAN-SHAPEFILES) — the same source and commit used by [india-map-studio](https://github.com/nikhilsawantse/india-map-studio) — and require the attribution in [data/ATTRIBUTION.md](./data/ATTRIBUTION.md). They are display geometry, not a current administrative register.

The bundles have 36 fully interactive, value-bearing state/UT regions (including Jammu & Kashmir and Ladakh as separate UTs), a full 788-district drill-down and a 5,950-feature sub-district level beneath it. Two Pakistan-administered J&K district features (Mirpur, Muzaffarabad) are excluded from the value-bearing set and rendered as a non-interactive reference overlay instead, because no value is ever assigned to claimed-but-unadministered territory. See [data/README.md](./data/README.md#stateut-bundle).

## Design decisions

- Stable feature IDs are mandatory. The included bundles use LGD-derived IDs; for consumer-supplied geometry, use its own stable identifiers (prefer LGD codes where available). Display names are only labels.
- The `MapLayer` requires explicit ID, label, and value accessors. It does not assume a provider's property names or a business metric.
- `drillDownId`, `subDistrictDrillDownId` and `selectedId` support controlled usage; `defaultDrillDownId`, `defaultSubDistrictDrillDownId` and `defaultSelectedId` are the ergonomic uncontrolled path. A district id means nothing outside its state, so changing `drillDownId` clears the level below it.
- `loadDistricts` is lazy and runs only after state activation. The host can use a dynamic import, fetch, or local cache. `loadSubDistricts` is the same one level down, and may return `null` for a district that has no sub-district level — that district is left as a leaf rather than opening an empty view, and stops offering the level once it has answered. Without the loader, a district is a leaf and activation only selects it.
- Geometry accepts GeoJSON `FeatureCollection` or TopoJSON with an object key. `d3-geo` projects each level into a responsive SVG viewBox.
- `referenceOverlay` accepts separate national-only reference geometry—such as an outline or claimed area—that must never be coloured, selected, drilled into, or counted. It renders in a neutral hatch; the host provides its exact accessible description instead of the renderer assuming the whole outline lacks data.
- Tooltip and insight UI are slots. Default copy contains only generic data concepts; a dashboard owns its metric/year wording and surrounding chrome.
- Regions are keyboard focusable and activate with Enter/Space. Focus and pointer hover have the same inspection callback. CSS includes a reduced-motion mode and public CSS variables.

## Without a framework: one script tag

For plain JavaScript — or any framework that can load a plain JS library — [`bharat-choropleth-js`](./packages/js) needs a single script tag and no build step:

```html
<div id="map"></div>
<script src="https://cdn.jsdelivr.net/npm/bharat-choropleth-js@0.3.1"></script>
<script>
  var map = new BharatChoropleth("#map");
  map.fontColor = "maroon";
  map.goa = 6;
  map.gujarat = 7;
</script>
```

The stylesheet is injected by the script, boundary data is fetched on construction (never bundled — set `dataBaseUrl` to self-host), and values written before it arrives are applied when it does. Clicking a state drills into its districts, and a district into its sub-districts. See [packages/js/README.md](./packages/js/README.md).

## React install

```bash
pnpm add bharat-choropleth
```

Import the default stylesheet once:

```ts
import "bharat-choropleth/style.css";
```

## React: one prop

`BharatChoropleth` is the React counterpart of the script-tag facade above — map
state names to numbers and you have a map, with boundary data fetched for you and
drill-down already wired:

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

Keys resolve through the same state registry the JavaScript facade uses, so
`Goa`, `goa`, `tamilnadu`, `Jammu & Kashmir`, `Orissa` and `in-cs-30-goa` all
land where you would expect; an unrecognized name is ignored with a warning
rather than throwing. Row-shaped data works too, via
`data` + `regionKey` + `valueKey`, and district numbers nest under their state
with `districtValues={{ Telangana: { Hyderabad: 90 } }}`. Every `IndiaChoropleth` prop except `states`
passes straight through. See [packages/react/README.md](./packages/react/README.md).

## Minimal usage

Everything below uses `IndiaChoropleth`, the core renderer that
`BharatChoropleth` wraps. Use it directly when you own the geometry — it is the
full API and is not going anywhere.

```tsx
import { IndiaChoropleth, type MapLayer } from "bharat-choropleth";
import "bharat-choropleth/style.css";
import states from "./data/generated/current-2019-states/states.topo.json";

const stateLayer: MapLayer = {
  geometry: { topology: states, object: "states" },
  getId: (feature) => String(feature.properties?.id),
  getLabel: (feature) => String(feature.properties?.name),
  getValue: (feature) => valuesById[String(feature.properties?.id)] ?? null,
};

export function Map() {
  return (
    <IndiaChoropleth
      states={stateLayer}
      loadDistricts={async (stateId, state) => {
        const module = await import(`./data/generated/current-2019-districts/districts/${stateId}.topo.json`);
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

## Sub-district drill-down

A third level below districts. `loadSubDistricts` receives the district ID, the
district region, and the state ID it sits in:

```tsx
<IndiaChoropleth
  states={stateLayer}
  loadDistricts={loadDistrictLayer}
  loadSubDistricts={async (districtId) => {
    const module = await import(`./data/generated/current-2019-subdistricts/subdistricts/${districtId}.topo.json`)
      .catch(() => null);
    // No asset means this district has no sub-district level — leave it a leaf.
    if (!module) return null;
    return {
      geometry: { topology: module.default, object: "subdistricts" },
      getId: (feature) => String(feature.properties?.id),
      getLabel: (feature) => String(feature.properties?.name),
      getValue: (feature) => valuesById[String(feature.properties?.id)] ?? null,
    };
  }}
/>
```

The bundled current-vintage sub-district layer has 5,950 sub-districts across 785 of
the 788 districts. Three districts deliberately have no asset — Delhi's Nazul, which is
a land-tenure artifact rather than a district, and Rajasthan's urban Jaipur and Jodhpur,
whose source polygons sit inside their own rural halves. See
[data/README.md](./data/README.md#sub-district-bundle).

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

When a district layer needs non-statistical context beside it — the bundled J&K view shows the two Pakistan-administered districts this way — load it only for the matching parent ID. The overlay is independently fetched, stale-safe, shares the district projection, and is unavailable as a metric or a drill-down target.

```tsx
<IndiaChoropleth
  states={stateLayer}
  loadDistricts={loadDistricts}
  loadDistrictReferenceOverlay={async (stateId) => {
    if (stateId !== "in-cs-01-jammu-and-kashmir") return null;
    return { geometry: contextGeometry, getId, getLabel, getDescription };
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
pnpm build:data # requires a datta07/INDIAN-SHAPEFILES checkout (INDIA_SHAPEFILES_DIR); not part of pnpm check
pnpm build:demo
pnpm validate:data

# Runs all of the above release checks.
pnpm check

# Release preflight: fetches one asset per level from the pinned data source.
# Network-dependent, so deliberately outside pnpm check.
pnpm verify:data-pin

# Rebuilds the fixture that holds the Dart state registry to the TypeScript one.
# Only needed after changing packages/js/src/states.ts.
pnpm generate:state-cases

# The Dart package is checked on its own; this populates the example's
# gitignored boundary assets first, which analyze needs to exist.
pnpm check:flutter

# Populate packages/flutter/example/assets from data/generated on its own.
pnpm prepare:flutter-assets
```

## Release status

The JavaScript packages are published at `0.3.1`, and the Flutter and Python ones at `0.3.0` — see [Availability](#availability) for the registry links, and trust the registry over this sentence. Future releases follow the [publishing guide](./docs/PUBLISHING.md); increment a package's version before publishing because registries do not permit reusing one, and run `pnpm verify:data-pin` so the release does not repeat the 0.2.0 mistake of shipping a renderer whose default data source predates the level it renders. The boundary datasets are deliberately not published as a single generic dependency: preserve each generated bundle's manifest, source attribution and licence when redistributing it.
