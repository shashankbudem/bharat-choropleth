# `bharat_choropleth`

Accessible India state and district choropleth maps for Flutter, drawn natively with `CustomPainter` — no WebView, no DOM, no JavaScript bridge.

The Dart sibling of [`bharat-choropleth-js`](../js) and [`bharat-choropleth`](../react), feature for feature: same prepared boundary bundles, same LGD-derived ids, same default colour ramp, same drill-down, tooltip, legend filter and reference overlay — so the same data looks the same, and behaves the same, on web and mobile.

## Install

```yaml
dependencies:
  bharat_choropleth: ^0.1.0
```

## Use

```dart
import 'dart:convert';
import 'package:bharat_choropleth/bharat_choropleth.dart';

final topology = jsonDecode(raw) as Map<String, Object?>;
final features = decodeTopoJson(topology, objectName: 'states');

IndiaChoropleth(
  features: features,
  values: const {
    'in-cs-30-goa': 6,
    'Gujarat': 7,            // id or display name, whichever your data has
    'in-cs-27-maharashtra': 41,
  },
  selectedId: selectedId,
  onRegionTap: (region) => setState(() => selectedId = region.id),
)
```

See [`example/lib/main.dart`](./example/lib/main.dart) for a complete app.

## Boundary data

The package bundles no geographic boundaries — load them yourself, from an asset or over the network, exactly as the web packages do. The prepared bundles live in [`data/generated`](../../data/generated) in this repository and must carry their source's attribution:

> State/UT and district boundaries derived from datta07/INDIAN-SHAPEFILES (MIT).

See [`data/ATTRIBUTION.md`](../../data/ATTRIBUTION.md) — each bundle keeps its own licence, and the notices must not be blended.

`decodeTopoJson` reads quantized TopoJSON (delta-encoded arcs plus a shared transform), stitches arcs into rings, and handles multi-part features so island territories like Andaman & Nicobar render as the 15 separate rings they are. Pass `getId`/`getName` if your own data uses different property keys.

## API

| Member | Purpose |
| --- | --- |
| `decodeTopoJson(topology, {objectName, getId, getName})` | TopoJSON → `List<MapFeature>` |
| `IndiaChoropleth` | The widget. Data: `features`, `values`, `colorScale`, `formatValue`. Interaction: `selectedId`, `onRegionTap`, `onBackgroundTap`, `onInspect`, `onInsight`, `interactive`. Drill-down: `loadDistricts`, `drillDownId`, `onDrillDownChange`, `loadSubDistricts`, `subDistrictDrillDownId`, `onSubDistrictDrillDownChange`. Chrome: `showLegend`, `showBreadcrumb`, `legendLabels`, `showTooltip`, `tooltipBuilder`. Overlay: `referenceOverlay`, `referenceOverlayFill`, `referenceOverlayMergeIds`, `referenceOverlayLegendLabel`, `loadDistrictReferenceOverlay`. Appearance: `showRegionValues`, `regionValueStyle`, `regionLabelOffsets`, `borderColor`, `borderWidth`, `selectionColor`, `selectionWidth`, `minPartExtent`, `smallRegionExtent`, `smallRegionTapRadius`, `minRegionMarkerSize`, `minRegionMarkerOutline` |
| `ChoroplethLayer` | What `loadDistricts` and `loadSubDistricts` return: a level's regions plus their values |
| `ChoroplethInsight` | What the tooltip and `onInsight` are given: region, level, total, share, rank |
| `ReferenceOverlay` | Non-statistical context features, with per-feature descriptions |
| `legendBuckets` / `swatchIndexOf` | The ramp band by band, and the one index the fill and the legend filter both use |
| `placeTooltip` | Keeps the tooltip inside the map, shared with the web packages |
| `ColorScale` | Maps a value onto an ordered ramp; `kDefaultColorScale`, `kEmptyColor` |
| `MercatorProjection.fit` | Spherical Mercator fitted to the view box, mirroring d3-geo's `fitExtent` |
| `ViewBoxFit` | How the fixed 960×640 view box maps onto the widget's size — used for painting and for turning a tap back into map coordinates |
| `ChoroplethRegion` | What `onRegionTap` gives you: id, label, value, projected `Path` |

Notable behaviours, shared with the web packages by design:

- **No data is its own state.** A region with a null value gets `kEmptyColor`, never the bottom of the ramp, and reads as "No data".
- **Selection is a ring, not a fill.** The fill carries the value; recolouring the selected region would make its colour meaningless.
- **One semantics node per region**, labelled `Goa, 6. Activate to select.` — or `Activate to view districts.` where a drill-down is wired up — so a screen reader can explore the map region by region instead of hitting one opaque image. Whole numbers read as `6`, not `6.0`.
- **Even-odd fill**, so holes and multi-part features are correct without the caller tracking which ring is which.
- **Border thickness is configurable.** `borderWidth` (default 1.0) and `selectionWidth` (default 1.5, with its halo drawn at twice that) are logical pixels and stay constant on screen as the map scales. The web packages expose the same knobs as the `--india-map-border-width` and `--india-map-selection-width` CSS variables, but keep their own historical defaults of 2.5 and 3 — set one side explicitly if you need them to match pixel for pixel.
- **Value labels.** `showRegionValues: true` draws each value at its region’s largest-ring centroid, with a halo for contrast.
- **Small regions get help.** A region narrower than `smallRegionExtent` (default 22 view-box units — Goa, Lakshadweep, Andaman & Nicobar) has its number moved into the open space beside it with a leader line, and taps within `smallRegionTapRadius` (default 14) still select it.
  - The label only moves out if the destination is clear of every other region, so a coastal region’s number goes to sea while a landlocked one like Delhi keeps its number inside rather than dropping it on a neighbour. Override a specific placement with `regionLabelOffsets`.
  - The tap buffer runs only after every polygon has missed, so it fills empty sea without ever taking a tap that belonged to a neighbouring state — no notion of “which side is ocean” is needed.
  - Regions smaller than `minRegionMarkerSize` (default 7) are additionally drawn as a marker, because their geometry is sub-pixel: Puducherry’s enclaves are 2–3 view-box units across.
  - **A scattered region is the area its outer parts enclose.** Lakshadweep is twenty specks in open sea, and the water between them is how the group reads on the map, so the convex hull of its parts is a tap target too. Like the buffer, the hull is tested only after every polygon has missed — which is what lets Puducherry’s hull span the Tamil Nadu coast without ever taking a tap from Tamil Nadu.
- **Puducherry keeps its true outline.** `minPartExtent` grows a region that is too small to see, but only where there is somewhere to grow into. Puducherry is four coastal enclaves *inside* Tamil Nadu, so growing them puts a Puducherry of the wrong shape in the wrong place; it is drawn true to size and stands in with a marker instead. Lakshadweep grows into open sea and still gets the help.
- **A pointer that tells the truth.** Hovering any part of a region gives the hand, including the buffer around a region too small to aim at and the water a scattered group encloses. The reference overlay and a legend band matching no region are drawn but take no tap, so they get the "no drop" cursor instead of inviting a dead click. Open sea keeps the plain arrow — clicking it clears the selection.
- **Drill-down, with a way back.** Supply `loadDistricts` and tapping a state loads its districts; the breadcrumb above the map returns to the national view and re-selects the state you came from. Add `loadSubDistricts` for a third level — tehsils / taluks / mandals / blocks — and the breadcrumb grows a third crumb whose middle link steps back to the districts rather than all the way out. Return `null` from it for a district with no such level and that district stays a leaf: it selects instead of opening an empty map, and is not asked again. `decodeTopoJson` reads the per-state and per-district files directly, so either loader is a few lines.
- **The legend is a filter.** Each swatch highlights the regions painted in it and drains the rest to grey; tap it again, or pick another, to change bands. A band no region falls in stays at full strength — the ramp is continuous, and fading one stop out of the middle of it reads as a broken legend — but it is inert, because filtering to nothing would just dim the whole map. The fill and the filter share one `swatchIndexOf`, so "highlight the regions painted in this colour" is true by construction. A filter is dropped on drill-down and on a ramp change, where the bands mean something else.
- **Hover and tap both inspect.** Pointer devices get the tooltip on hover, as the web does; touch has no hover, so a tap inspects as well as selects. The tooltip carries the label, the value, share of total and rank, and is nudged to stay inside the map by the same `placeTooltip` the web packages use. `onInsight` reports the same context for a host-owned panel, falling back to the selected region when nothing is being pointed at.
- **Reference overlay.** Non-statistical context — a claimed-boundary outline, say — drawn beneath the data with a hatch fill and its own legend key. It is fitted *with* the data rather than separately, so it registers against the map, and it is in no colour band, so a legend filter never touches it.
- **`interactive: false`** for a map that is a picture: no taps, no tooltip, and a legend that is a key rather than a filter.

## Differences from the web packages

Only three, all forced by the platform rather than chosen:

- **Colours and sizes are widget parameters, not CSS variables.** `borderColor`, `borderWidth`, `selectionColor` and `selectionWidth` do here what `--india-map-*` do there.
- **`kChoroplethSurfaceKey`** finds the painted map apart from the breadcrumb and legend around it. Taps are in that box's coordinates, so a test measuring the map needs it rather than the widget's own bounds.
- **The inspected region is darkened and shadowed, but not lifted.** The web nudges it up 2px with a CSS transform; on a canvas that would mean re-transforming the path every frame, so the darkened edge and the drop shadow carry the same "this one" signal on their own.

## Develop

```bash
flutter pub get
flutter analyze
flutter test
```

`test/real_bundle_test.dart` decodes the actual prepared bundle from `data/generated`, and `test/golden_test.dart` paints it — a projection or stitching bug can pass numeric assertions but is obvious the moment the map is rendered. Regenerate the golden with `flutter test --update-goldens` after any intentional visual change.

