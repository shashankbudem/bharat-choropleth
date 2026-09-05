# Changelog

## Unreleased

### Added

- Exported `loadDistrictTopology` and `loadSubDistrictTopology`, so a custom
  loader can fetch the prepared bundles without re-deriving their URL scheme.

### Changed

- Repainting no longer re-unpacks the topology or refits the projection. The
  zero-config facade calls `update({})` for every value written, and both steps
  ran again each time even though neither reads a value. They are now held
  against `states.geometry`, and the decoded features are passed into layer
  preparation rather than unpacked a second time. Mirrors the React renderer.

### Fixed

- The default data source now points at the `v0.2.0` boundary bundle. It was
  still pinned to `v0.1.0`, which predates `data/generated/current-2019-subdistricts/`,
  so every sub-district request 404'd — and because a 404 means "this district
  has no sub-district level", the level 0.2.0 added was silently unreachable for
  anyone using the default `dataBaseUrl`. Nothing errored; districts simply
  stayed leaves. Self-hosted `dataBaseUrl` deployments were unaffected.

## 0.2.0

- Added an optional sub-district level below districts — tehsils, taluks,
  mandals and blocks. On `IndiaChoropleth`, `loadSubDistricts` is called only
  after a district is activated, with `subDistrictDrillDownId` and
  `onSubDistrictDrillDownChange` to drive it from outside.
- A `loadSubDistricts` that resolves `null` marks that district a leaf: the map
  stays on the district view and selects it rather than opening an empty level,
  and the district is not asked again. Omit the option and every district stays
  a leaf, exactly as before.
- The zero-config `BharatChoropleth` gained `subDistricts`, which defaults to on
  when the map is using the bundled data source and off when you supply your own
  geometry — the same rule `districts` already follows.
- `drillDown(null)` returns to the national map from any depth. It is the
  state-level control, so it does not merely step back one level.
- Exported `MapLevel` and `SubDistrictLoader`.
- **Possibly breaking for TypeScript callers:** `level` on `TooltipContext` and
  `InsightContext` widened from `"state" | "district"` to `MapLevel`, which adds
  `"subdistrict"`. A `switch` over it that the compiler checks for
  exhaustiveness now needs the third case. Nothing changes at runtime for a
  two-level map.

## 0.1.0

- Initial public release of the framework-free India state and district
  choropleth renderer.
