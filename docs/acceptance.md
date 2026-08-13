# v0.1 acceptance criteria

This is the release gate for the first public version. It preserves the interaction model approved in the Atlas prototype while replacing the fictional geometry with versioned India administrative boundaries.

## Product behaviour

- The country view renders a state/union-territory choropleth with an explicit legend, metric label, and accessible map title.
- If a political-claim context overlay is displayed, it is a separately attributed, DataMeet-sourced non-metric reference layer checked against the cited SoI political-map depiction; it is never labelled or distributed as SoI geometry. Census-coverage gaps inside that overlay remain visible with a clear no-coverage treatment and cannot be selected or coloured as zero.
- A pointer hover or keyboard focus exposes the region name, formatted value, and available comparison metadata without requiring a click.
- Selecting a state/union territory with district geometry drills into a district choropleth and communicates the new level to assistive technology.
- Selecting historical Jammu & Kashmir renders its 22 Census-2011 districts while retaining the full J&K+Ladakh political-claim context outline behind them. The portion outside those statistical districts stays hatched/data-unavailable and never receives a value, selection, percentage, or drill-down.
- A visible, keyboard-operable breadcrumb/back control returns to the country view and restores focus to the selected state.
- The component never invents a number: `0` is rendered as zero, missing/`null` is rendered as “No data”, and negative values use a documented divergent scale or a caller-supplied formatter/scale.
- An aggregate is named for exactly the features that contribute to it (for example, “sample total across supplied Census-2011 features”), never “national” when any visible political-claim area has no contributing Census value.
- A state that has no district geometry or district data remains selectable and shows a clear empty-state panel with a country-level return action.
- Region matching is by stable identifiers, not display names. The bundled historical hierarchy uses deterministic Census-derived IDs recorded in its manifest; a consumer’s contemporary/official geometry defines its own stable ID scheme (LGD IDs are preferred where available). Aliases are opt-in and reported when unmatched.
- No data is fetched by default. District geometry is loaded only when a caller supplies or requests it, allowing consumers to control network, caching, and privacy.

## React API contract

- The package exports typed, tree-shakeable named exports and has no import-time browser side effects.
- It supports controlled drill-down (`drillDownId` + `onDrillDownChange`) and selection (`selectedId` + `onSelectedChange`), with `defaultDrillDownId` and `defaultSelectedId` for uncontrolled use.
- `onInspect`, `onInsight`, `onSelectedChange`, `onRegionClick`, and `onDrillDownChange` expose stable region objects containing `id`, `label`, `value`, and the raw feature; callbacks that depend on hierarchy also receive the current level.
- Values may be number, `null`, or omitted. Formatting, labels, colours, and tooltip content are customizable without replacing the map interaction layer.
- The country dataset and each district dataset are independently importable/lazy-loadable. A consumer can bring its own GeoJSON/TopoJSON instead of using bundled geometry.
- Server-side rendering does not access `window`, `document`, pointer APIs, or network resources during render.

## Accessibility and interaction

- Every interactive map region is reachable with Tab and has an accessible name that includes the region name and value/no-data status.
- Enter and Space activate a region; Escape dismisses transient tooltip content when it has focus; focus indicators meet WCAG 2.2 AA visibility expectations.
- The tooltip is not the sole way to access data: the focused/selected value is also exposed through an accessible status/summary area.
- Colour is not the sole data cue. The legend names the scale, and selected/focused states use a non-colour treatment.
- The map, breadcrumb, loading state, and no-data state work at 320 CSS px width, with no clipped controls or horizontal page scrolling.
- Pointer-only hover does not trap keyboard users or obscure the selected region at common zoom levels (200% and 400%).

## Quality gates

- Unit tests cover data joins, ID matching, zero/null/negative inputs, unknown IDs, drill-down selection, back navigation, and controlled callback payloads.
- Component tests cover pointer, keyboard, focus restoration, accessible names, live announcements, no-data states, and a district-load failure.
- A visual/demo smoke test covers country, district, selected, no-data, and narrow mobile states.
- `pnpm check` (type checks, renderer tests, renderer and demo builds, and data validation) passes; the package tarball contains only its declared runtime artifacts, license, and package metadata.
- The package has a documented browser support policy and a bundle-size baseline. Optional geometry data must not be pulled into the core renderer’s entry chunk.

## Data and release gate

- Every geometry release exposes a dataset version/vintage, source URL, checksum, coverage notes, and license/attribution text.
- Code and data licenses are distinct. A code release cannot imply that all bundled or optional boundary data is MIT-licensed.
- Documentation makes clear that administrative boundaries and names may be disputed, change over time, or differ from a consumer’s official source of record.
- Documentation and the demo distinguish (1) a DataMeet political-claim context overlay checked against a cited SoI political-map depiction, (2) any separately sourced administrative-control layer, and (3) Census statistical coverage. The first does not establish either of the latter two and is not represented as SoI data.
- The demo visibly includes the required geometry attribution and links to the full attribution and provenance document.
