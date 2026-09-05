# Changelog

## Unreleased

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
