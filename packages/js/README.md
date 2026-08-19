# `bharat-choropleth-js`

An accessible SVG India state-to-district choropleth with no framework dependency. Drop one `<script>` tag into any HTML page, or import it as an ES module from a bundler. Same behavior, same CSS classes and same stylesheet as the React [`bharat-choropleth`](../react).

![Bharat Choropleth national map](https://raw.githubusercontent.com/shashankbudem/bharat-choropleth/main/previews/country-desktop.png)

## One script tag

```html
<div id="map"></div>

<script src="https://cdn.jsdelivr.net/npm/bharat-choropleth-js@0.1.0"></script>
<script>
  var map = new BharatChoropleth("#map");

  map.fontColor = "maroon";
  map.colorScale = ["#ffffff", "#800000"];

  map.goa = 6;
  map.gujarat = 7;
  map.tamil_nadu = 18;
  map.states["Jammu & Kashmir"] = 2;
</script>
```

That's the whole setup. No stylesheet link, no build step, no `await`, no boundary files to find:

- **The script tag injects its own CSS.** (Bundler users import `bharat-choropleth-js/style.css` instead, so their pipeline can extract and hash it — see [From a bundler](#from-a-bundler).)
- **Boundary data is fetched, not bundled.** The package ships no geometry; the prepared current-vintage state bundle is downloaded from `dataBaseUrl` on construction. Set `dataBaseUrl` to self-host — see [Boundary data](#boundary-data).
- **Values set before the data arrives are applied when it arrives.** Every line above runs while the download is still in flight; nothing is dropped and nothing needs awaiting. `map.ready` is a promise if you want one.
- **Clicking a state drills into its districts**, fetched from the same base URL. Pass `districts: false` to turn that off.

Run [`example/bharat-choropleth.html`](./example/bharat-choropleth.html) for a complete working page: serve the **repo root** over HTTP (`npx serve`), then open `/packages/js/example/bharat-choropleth.html`.

## Setting values

Every one of these reaches the same state, so you can use whichever your data already has:

```js
map.goa = 6;                        // dot-notation slug
map.tamil_nadu = 18;                // underscores
map.states["Tamil Nadu"] = 18;      // display name
map.states["tamilnadu"] = 18;       // no separators
map.states["in-cs-33-tamil-nadu"]   // LGD id
map.orissa = 8;                     // former name → Odisha
```

Names are matched case-insensitively, with `&` treated as `and`. `Orissa`, `Pondicherry`, `Uttaranchal`, `NCT of Delhi`, `J&K` and similar former or colloquial names resolve to their current state. A name that matches nothing logs a console warning naming the property you typed — it never throws, and never silently does nothing. (The warning waits until the boundary data has loaded, since that is the first moment an unknown name can be told apart from one that just hasn't been matched yet.)

Other value APIs:

- `map.setValues({ Goa: 6, Gujarat: 7 })` — many values, one re-render.
- `map.getValues()` — everything currently set, keyed by display name.
- `values: { Goa: 6 }` as a constructor option — same thing, before first paint.
- District values work through the same accessor once you drill in: `map.states["North Goa"] = 3`.

## Options

```js
var map = new BharatChoropleth("#map", { showRegionValues: true, districts: false });
// or, equivalently:
var map = new BharatChoropleth({ container: "#map", showRegionValues: true });
```

| Option | Default | Purpose |
| --- | --- | --- |
| `container` | `#bharat-choropleth`, then `#map` | Element or CSS selector. Also the first constructor argument. |
| `geometry` | fetched from `dataBaseUrl` | Inline GeoJSON/TopoJSON, a URL string, or a promise of either. |
| `dataBaseUrl` | jsDelivr copy of `data/generated` | Base URL for the prepared bundles. Point at your own copy to self-host. |
| `districts` | `true` with default data, else `false` | Click-to-drill-down into districts. |
| `fontColor` / `borderColor` | — | Sets the `--india-map-text` / `--india-map-stroke` CSS variables. |
| `borderWidth` | `2.5` | Region border thickness in px. Sets `--india-map-border-width`. |
| `selectionWidth` | `3` | Selection ring thickness in px; its halo is drawn at twice this. Sets `--india-map-selection-width`. |
| `colorScale` | built-in teal ramp | Ordered low-to-high colors, or a `(value, context) => color` function. |
| `values` | `{}` | Initial values, keyed by any accepted spelling. |
| `onReady` / `onError` | — | Called after the data renders, or if it fails to load. |
| `getId` / `getLabel` | `properties.id` / `properties.name` | Only needed for custom `geometry` with different property keys. |

Options can also be set as properties after construction, in either case style — `map.fontColor = "maroon"` and `map.font_color = "maroon"` are the same assignment, and neither is mistaken for a state name.

Every thickness is a CSS variable, so you can theme without touching the renderer. Strokes are `non-scaling`, meaning these are true on-screen pixels no matter how far the map is scaled down:

```css
.india-choropleth {
  --india-map-border-width: 2.5;         /* region borders */
  --india-map-border-width-active: 2;    /* hovered/focused region */
  --india-map-selection-width: 3;        /* selection ring; halo is 2x this */
}
```

Every other [`IndiaChoroplethOptions`](./src/types.ts) field (`referenceOverlay`, `loadDistricts`, `onRegionClick`, `formatValue`, `renderTooltip`, `showLegend`, ...) is accepted and forwarded.

Methods: `setValues`, `getValues`, `select(id)`, `drillDown(name | null)`, `getSelected()`, `getInspected()`, `destroy()`. The full engine is at `map.engine` (`null` until the data loads — `await map.ready` first).

## Hover and focus detail

Pointing at (or tabbing to) a region shows a tooltip with the region name, its formatted value, a share bar, and `26.3% of total · 1st of 36`. Regions with no value say `No data` and show neither share nor rank — the same wording the region's `aria-label` uses.

- **Rank** counts only regions that have a value, highest first, and ties share the better rank (`1st` twice, then `3rd`).
- **Placement** is anchored to the region's centroid, not the cursor, because hover and keyboard focus run through the same path and a focused region has no cursor to follow. The box shifts horizontally and flips below the centroid as needed so it never leaves the map.
- **Announcement** happens on focus, via `aria-describedby`. The tooltip is not an `aria-live` region; it would otherwise re-read itself on every hover, and the region's `aria-label` already carries name and value.

Replace the whole thing with `renderTooltip`, which receives `{ label, value, total, share, rank, rankedCount, level, feature, id, meta }` and returns a string or a DOM node:

```js
var map = new BharatChoropleth("#map", {
  renderTooltip: function (c) {
    return c.value === null ? c.label + ": no data" : c.label + ": " + c.value + " (" + c.rank + " of " + c.rankedCount + ")";
  },
});
```

## Boundary data

The package deliberately bundles no geographic boundaries; it downloads them. By default that means the prepared bundles in this repo's `data/generated`, served over jsDelivr, which must be attributed as:

> State/UT and district boundaries derived from datta07/INDIAN-SHAPEFILES (MIT).

For production, offline or air-gapped use, copy `data/generated/current-2019-states/` and `data/generated/current-2019-districts/` next to your app and point at them — no third-party CDN request at runtime:

```js
var map = new BharatChoropleth("#map", { dataBaseUrl: "/maps" });
```

Or supply geometry directly and skip the fetch entirely, in which case the map renders synchronously:

```js
var map = new BharatChoropleth("#map", { geometry: myTopoJson });   // or a URL string
```

See [`data/ATTRIBUTION.md`](../../data/ATTRIBUTION.md) for the licence and attribution of every bundle. Each asset keeps its own source's terms — don't blend the notices.

## From a bundler

```bash
npm add bharat-choropleth-js
```

```ts
import { BharatChoropleth } from "bharat-choropleth-js";
import "bharat-choropleth-js/style.css"; // the ESM build does not inject CSS

const map = new BharatChoropleth("#map");
map.states["Goa"] = 6;
```

The ESM entry also exports the full `IndiaChoropleth` engine, the `STATES` registry, `resolveState`, `ATTRIBUTION` and `DEFAULT_DATA_BASE_URL`, plus every type.

## `IndiaChoropleth` (full-featured engine)

`BharatChoropleth` is a facade for the common case. `IndiaChoropleth` is the engine underneath, for controlled selection, custom tooltips, reference overlays and data that isn't one-number-per-state:

```ts
const map = new IndiaChoropleth(container, options);
```

- `container`: an `HTMLElement`, or a CSS selector string resolved via `document.querySelector`.
- `options`: the same shape as the React `IndiaChoroplethProps` — see [`src/types.ts`](./src/types.ts). Two slots differ because there's no JSX:
  - `renderTooltip?: (context) => string | Node` — return a string (set as `textContent`) or a DOM node to mount directly. Omit for the built-in tooltip.
  - `renderInsights?: (context, container: HTMLElement) => void` — imperatively populate the given container; called on every hover/selection change. Omit to skip the insights panel entirely.

It requires an explicit `states` layer with `getId`/`getLabel`/`getValue` accessors, and never fetches anything on your behalf. Under a script tag it is available as `window.IndiaChoropleth`; see [`example/index.html`](./example/index.html).

### Instance methods

- `update(partialOptions)` — merge new options (new data, controlled `selectedId`/`drillDownId`, swapped callbacks) and re-render.
- `select(id | null)` — select a region at the current level without changing drill-down.
- `drillDown(id | null)` — drill into a state, or pass `null` to return to the state view.
- `getSelected()` / `getInspected()` — read the current `MapRegion | null`.
- `destroy()` — remove all DOM content and cancel any in-flight loads. Call this before discarding the instance.

Controlled vs. uncontrolled state works the same way as the React version: pass `selectedId`/`drillDownId` (and keep passing them via `update()`) for controlled usage, or `defaultSelectedId`/`defaultDrillDownId` to let the instance manage its own.

## Design notes

- Hover/focus updates never rebuild the DOM — only class names, ARIA attributes, and the tooltip/insights content change. A full rebuild only happens when the underlying region set changes (drill-down navigation, new district data arriving, or an `update()` with new data). This matters in practice: rebuilding on every hover would drop keyboard focus mid-interaction.
- Load-attempt tracking is keyed by drill-down id, not by "do we have data yet" — a failed `loadDistricts` call intentionally does not retry on every re-render (see the comment on `attemptedDistrictLoadForId` in `src/IndiaChoropleth.ts`).
- `src/states.ts` carries state *identities* (id, name, slug) but no coordinates. It's what lets `map.goa = 6` be recognized and validated before any boundary file has downloaded — the geometry itself still never ships in the package.
- The script-tag build has its own entry (`src/iife.ts`) because it does two things the ESM build must not: inject the stylesheet, and assign the constructors to `window` by hand. Bundlers' `globalName` would have exposed the module *namespace*, making the call `new BharatChoropleth.BharatChoropleth(...)`.

## Build

```bash
pnpm build      # ESM (dist/index.js) + script-tag IIFE (dist/bharat-choropleth.min.js) + style.css
pnpm test
pnpm typecheck
```
