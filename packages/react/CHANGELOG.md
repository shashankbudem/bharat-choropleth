# Changelog

## Unreleased

### Added

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
