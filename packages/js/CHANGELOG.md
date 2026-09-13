# Changelog

## 0.3.1 - 2026-09-13

### Fixed

- Drilling in no longer loses keyboard focus. Stepping back out had an obvious
  target — the region just left — and going in had none, so focus fell to
  `<body>` on every drill-down, dropping a keyboard user at the top of the
  document. Focus now lands on the first region of the level entered; on the
  message when that level holds nothing; and back on the district itself when
  an optimistic drill turns out to be a leaf, which had unmounted the region
  under the cursor.
- Changing the state now tells the host that the sub-district level was dropped.
  The map clears that level itself and fired no `onSubDistrictDrillDownChange`,
  so anything mirroring the level kept pointing at a district of the state just
  left — the wrong level, against the wrong map. There is no prior district to
  hand back, because it belonged to the state that is gone, so the callback
  receives `(null, undefined)`.
- Two spellings of one state in a single batch now warn instead of resolving in
  silence. `{ Orissa: 1, Odisha: 2 }` quietly kept the last; that silence is how
  a mis-shaped dataset becomes a believed wrong number. The last value still
  wins — changing that would move numbers under existing callers — and updating
  a state later is not mistaken for a clash.
- Legend swatches size from the legend row rather than the viewport. `vw`
  measures the browser window, so in any embed narrower than the page the
  swatches pinned to their maximum and overflowed the map they belong to.

## 0.3.0 - 2026-09-05

### Fixed

- Values keyed by a feature id the state registry does not know now match. A
  feature was keyed by its id only if the registry recognised it, and otherwise
  fell back to its *label* — so a dataset keyed by id against geometry outside
  the registry, such as this repo's own historical Census bundle with its
  `in-hs-*` ids, silently rendered as "No data" on every region while looking
  perfectly healthy. Each key a caller writes is now recorded against the
  canonical key it addresses, and a feature is matched by exact id, exact label,
  then either resolved through the registry. Found by building a dashboard on
  the historical bundle.

### Changed

- The default data source now points at the `v0.3.0` boundary bundle. A release
  pins the geometry a consumer receives, not only the renderer that draws it.

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
