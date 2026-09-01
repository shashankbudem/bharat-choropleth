# Changelog

## Unreleased

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
