# Changelog

## 0.3.0

### Added

- `values` keys now resolve through a state registry, so any spelling of a state
  a reader might type finds its region: `"goa"`, `"tamilnadu"`,
  `"jammu-and-kashmir"` and former names such as `"Orissa"` all work. This was
  the last package matching on `feature.id` and nothing else — a display name
  silently rendered as no data — and it now behaves like the React, JavaScript
  and Flutter packages.
- Exact id and exact display name are still tried first, in that order, so a
  layer keyed by the ids in its own bundle is matched directly and behaves
  exactly as before. Below the state level keys fall back to a normalized form,
  which still gives case- and separator-insensitive matching.
- Exported `STATES`, `StateIdentity`, `resolve_state`, `normalize_state_key`,
  `value_for` and `canonical_values`.

`states.py` is a translation of `packages/js/src/states.ts`, which the two
TypeScript packages share as a byte-identical copy. Python cannot be diffed
against TypeScript, so the two are held together by behaviour instead:
`tests/test_states.py` replays every spelling the JavaScript registry accepts,
recorded in `packages/js/test/state-resolution-cases.json`, and fails if this
package resolves any of them differently.

## 0.2.0

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
- Optional ipywidgets notebook control, installed with
  `bharat-choropleth[notebook]`.
