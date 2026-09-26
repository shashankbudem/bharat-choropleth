# Changelog

## Unreleased

### Fixed

- A map built with `drillDownId` already set loads that state's districts.
  Nothing started the load, so it sat on "District data is unavailable".
- A `subDistrictDrillDownId` given together with its `drillDownId` — at build,
  or both at once later, as a deep link does — opens the sub-districts once the
  districts arrive, instead of stopping at the district view.
- A controlled `drillDownId` set back to `null` returns to the national map. It
  fell back to whatever state had been tapped before the host took control.
- Changing the controlled `drillDownId` drops the sub-district level of the
  state just left.

### Changed

- Andaman & Nicobar and Lakshadweep are drawn so they can be seen on the
  national map. At that scale Andaman & Nicobar's islands were thinner than the
  white region border, and Lakshadweep was a single dot.
  - Andaman & Nicobar is magnified about 1.5× as one group about its own centre,
    so every island keeps its outline and the gaps between them.
  - Lakshadweep is spread out 2× as a group and moved west into the open
    Arabian Sea, clear of Kerala, and then each island grows about its own
    centre, keeping its shape. Island groups no longer get a stand-in dot.
  - Both keep `borderColor`, drawn thinner (at most 0.75, never wider than
    `borderWidth`) and under the fill, so it cannot cover a thin island.
  - `ChoroplethRegion.island` marks them, and `placeIslandGroup` is exported.

  Only the national map changes; drilled into either UT, its districts are
  drawn true to size. The project communicates values, so a small departure
  from true size and position is the price of a region that can be seen.

## 0.3.0 - 2026-09-05

### Added

- `values` keys now resolve through a state registry, so any spelling of a state
  a reader might type finds its region: `'goa'`, `'tamilnadu'`,
  `'jammu-and-kashmir'` and former names such as `'Orissa'` all work, matching
  what the React and JavaScript packages already accepted. Exact id and exact
  display name are still tried first, so a layer keyed by its own bundle's ids —
  what a drill-down loader normally returns — is matched directly and behaves
  exactly as before. Below the state level keys fall back to a normalized form,
  which still gives case- and separator-insensitive matching.
- Exported `kStates`, `resolveState`, `normalizeStateKey` and `StateIdentity`.

`lib/src/states.dart` is a translation of `packages/js/src/states.ts`, which the
two TypeScript packages share as a byte-identical copy. Dart cannot be diffed
against TypeScript, so the two are held together by behaviour instead:
`test/state_resolution_test.dart` replays every spelling the JavaScript registry
accepts, recorded in `packages/js/test/state-resolution-cases.json`, and fails if
this package resolves any of them differently.

## 0.2.0

- Added an optional sub-district level below districts, matching the React and
  plain-JS packages: `loadSubDistricts`, `subDistrictDrillDownId` and
  `onSubDistrictDrillDownChange`. A loader returning `null` marks a district as a
  leaf, so it selects rather than opening an empty level and is not asked again.
- `ChoroplethBreadcrumb` takes an optional third crumb. Existing two-level callers
  are unaffected: omitting it renders exactly the previous trail.
- The pointer now reports what a click would do: a hand over any region part —
  including the small-region tap buffer and a scattered group's enclosed water —
  and a "no drop" cursor over the two things that are drawn but take no tap, the
  reference overlay and a legend band no region falls in. Open sea keeps the
  plain arrow, because clicking it clears the selection. A non-interactive map
  makes no cursor claim at all.
- `ChoroplethLevel` gains a `subdistrict` value. Exhaustive `switch`es over it in
  host code will need the new case.

## 0.1.0

- Initial public release of the native Flutter India state and district
  choropleth widget.
