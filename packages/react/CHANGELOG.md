# Changelog

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
