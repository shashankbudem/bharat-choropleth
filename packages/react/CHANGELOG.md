# Changelog

## 0.3.0 - 2026-09-05

### Added

- `IndiaChoropleth` warns when `loadDistricts` or `loadSubDistricts` has been a
  different function on three renders running while the level it loads has not
  moved. That is the signature of an inline arrow: the loaders are compared by
  identity because a genuinely different loader must refetch, so an unstable one
  silently refetches the level over the network on every unrelated re-render
  while still rendering correctly. One deliberate swap does not warn.

### Changed

- Documented `renderInsights` as a pure render slot and pointed at `onInsight`
  for reacting to the inspected region. Calling `setState` from `renderInsights`
  is a state update during render; the two props carry the same payload.

### Changed

- The default data source now points at the `v0.3.0` boundary bundle. A release
  pins the geometry a consumer receives, not only the renderer that draws it.

### Fixed

- Changing values no longer reloads the level below. Repainting means handing
  the renderer a new `MapLayer`, and the district and sub-district loaders keyed
  their effects on the prepared regions — which carry values — so every number
  that moved called the loader again and blanked the level while the promise was
  in flight. A map drilled into a state, driven by a timer or a slider, blinked
  its districts away on every tick. The loaders now key on the geometry and id
  accessor, the things that decide which regions exist. A real geometry change
  still reloads.

### Changed

- Repainting no longer re-unpacks the topology or refits the projection. Both
  are keyed on `states.geometry`, and the decoded features are passed into layer
  preparation instead of being unpacked a second time. Values live on the layer,
  not the geometry, so neither step could have changed its answer.

### Added

- `districtValues`, district numbers nested under the state they belong to:
  `districtValues={{ Telangana: { Hyderabad: 90 } }}`. The nesting is what makes
  it safe — district names repeat across states (Aurangabad, Bilaspur and
  Hamirpur each name two) and there is no district registry to resolve a bare
  name against. Outer keys resolve through the state registry and are checked at
  once; inner keys match a district's name, slug or id and are checked when that
  state's districts arrive. It overlays whichever district layer is in use,
  including one from a caller's own `loadDistricts`, leaving districts it does
  not name at whatever that layer returned. There is deliberately no
  `subDistrictValues`.
- `loadDistrictTopology` and `loadSubDistrictTopology` are exported, so fetching
  the prepared bundles from a custom loader does not mean re-deriving their URL
  scheme by hand. The framework-free package exports them too now.
- `BharatChoropleth`, a zero-config component over the existing renderer:
  `<BharatChoropleth values={{ Telangana: 82 }} />` is a working map. Keys
  resolve through the state registry the framework-free package already used —
  display names, slugs, LGD ids, case-insensitive and separator-free forms, `&`
  normalized to `and`, and former names such as `Orissa` — so it accepts the
  same spellings as `bharat-choropleth-js`. Row-shaped input is read through
  `data` + `regionKey` + `valueKey`; `values` wins when both are given.
- Boundary data is fetched from `dataBaseUrl` when no `geometry` is supplied, and
  district / sub-district drill-down defaults on in that case, matching the
  framework-free facade. Drill-down geometry is fetched once per id and reused,
  so changing `values` repaints without refetching it.
- Exported `BharatChoroplethProps`, the state registry (`STATES`, `resolveState`,
  `normalizeStateKey`), `ATTRIBUTION`, `DEFAULT_DATA_BASE_URL` and `GeometryInput`,
  matching what `bharat-choropleth-js` exports.
- The stylesheet gained the `.bharat-choropleth__status` placeholder rules the
  framework-free package already carried, used while boundary data loads and for
  the message if it fails.

`IndiaChoropleth` is unchanged and remains the full API — `BharatChoropleth` is
sugar over it, and passes every one of its props except `states` straight through.

### Fixed

- The default data source now points at the `v0.2.0` boundary bundle. It was
  still pinned to `v0.1.0`, which predates
  `data/generated/current-2019-subdistricts/`, so every sub-district request
  404'd — and because a 404 means "this district has no sub-district level", the
  level 0.2.0 added was silently unreachable for anyone on the default
  `dataBaseUrl`. Self-hosted deployments were unaffected.

## 0.2.0

- Added an optional sub-district level below districts — tehsils, taluks,
  mandals and blocks. `loadSubDistricts` is called only after a district is
  activated, so that geometry stays code-split the way districts already are,
  and `subDistrictDrillDownId` / `defaultSubDistrictDrillDownId` /
  `onSubDistrictDrillDownChange` drive it controlled or uncontrolled.
- A `loadSubDistricts` that resolves `null` marks that district a leaf: the map
  stays on the district view and selects it rather than opening an empty level,
  and the district is not asked again. Omit the prop entirely and every district
  stays a leaf, exactly as before.
- Exported `MapLevel` and `SubDistrictLoader`.
- **Possibly breaking for TypeScript callers:** `level` on `TooltipContext` and
  `InsightContext` widened from `"state" | "district"` to `MapLevel`, which adds
  `"subdistrict"`. A `switch` over it that the compiler checks for
  exhaustiveness now needs the third case. Nothing changes at runtime for a
  two-level map.

## 0.1.0

- Initial public release of the React India state and district choropleth
  component.
