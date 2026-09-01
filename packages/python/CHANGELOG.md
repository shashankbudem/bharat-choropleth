# Changelog

## Unreleased

- `notebook_drilldown` gained an optional sub-district level, matching the
  JavaScript, React and Flutter packages: `sub_district_loader`,
  `sub_district_values` and `subdistricts_object_name`, plus
  `selected_district_id` and `select_district()`. A loader returning `None`
  marks a district a leaf, so it keeps the district view rather than opening an
  empty one and stops being offered.
- `Back` now steps one level at a time instead of always returning to the
  national map.
- Callers that omit `sub_district_loader` are unaffected: no district selector
  is added and the control behaves exactly as before.

## 0.1.0

- Initial static SVG renderer for TopoJSON and GeoJSON-style polygon features.
- Dependency-free numeric colour scale and accessible legend.
- Optional Matplotlib renderer, installed with `bharat-choropleth[matplotlib]`.
