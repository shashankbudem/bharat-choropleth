# India Development Observatory — example 2

A dashboard built three times on the same data, once per ecosystem
`bharat-choropleth` supports. Example 1 (`apps/demo`) is the reference demo for
the library's own behaviour; this one is what an application built on it looks
like.

```bash
pnpm build:observatory     # assembles dist/observatory (all three + the portal)
npx serve dist/observatory
```

`--skip-flutter` builds the other two if the Flutter SDK is not on the machine.

| Route | App |
| --- | --- |
| `/` | Portal |
| `/react/` | `<BharatChoropleth>` — `examples/observatory/react` |
| `/js/` | `new BharatChoropleth(...)` from a script tag — `examples/observatory/js` |
| `/flutter/` | `IndiaChoropleth` painted natively — `examples/observatory/flutter` |

## The data is real

Six published official indicators, joined to boundary bundles this repository
already ships. `pnpm build:observatory-data` regenerates
`data/india-observatory.json`, recording each figure's publisher, download URL,
source SHA-256, vintage and join rule. Two of the three sources were downloaded
and audited previously under `work/`; the third (NFHS-5) is fetched at build
time and its hash checked against that audit before a single number is used.

| Indicator | Source | Vintage | Levels |
| --- | --- | --- | --- |
| Female literacy | Census of India 2011, Primary Census Abstract | 2011 | state + district |
| Improved sanitation | NFHS-5 state factsheets | 2019–21 | state |
| Full child vaccination | NFHS-5 state factsheets | 2019–21 | state |
| Child stunting | NFHS-5 state factsheets | 2019–21 | state |
| Child anaemia | NFHS-5 state factsheets | 2019–21 | state |
| Groundwater extraction | CGWB, *Dynamic Ground Water Resources of India, 2023* | 2023 | state |
| Current temperature | [Open-Meteo](https://open-meteo.com/), CC BY 4.0 | live | state + district + **sub-district** |

### Nothing is filled in

Where a source and this repository's geometry genuinely disagree, the region is
`null` and renders as **No data**:

- **Groundwater, Dadra & Nagar Haveli and Daman & Diu.** The 2023 assessment
  lists them as two rows; this geometry merges them into one UT. The report
  gives a percentage with no volume to weight a merge by, so the two cannot be
  honestly combined and the merged UT is left empty.
- **NFHS-5 districts are absent entirely.** They are reported on the survey's own
  707-district frame, which matches neither the 640-district historical bundle
  nor the 788-district current one.
- **CGWB districts are absent entirely.** The audit under `work/cgwb2023/`
  matched 607 of 705 district rows against the current bundle, which is not a
  complete enough join to publish.

### Indicators carry a boundary edition

They do not share one, and the apps switch the map with the indicator rather
than drawing every statistic on the newest outline. Census 2011 is reported on
2011 units — the historical 35-state / 640-district bundle. NFHS-5 and CGWB are
reported on present-day states — the current 36-state bundle. Drawing a 2011
figure on 2019 boundaries would misstate which places were measured.

## The live indicator, and why it is the one that reaches sub-district

It is the first tab in all three apps.


The six published indicators stop at district, and no rearranging fixes that: a
statistic is collected on particular administrative units, so drawing a 2011
figure on 2019 outlines would misstate which places were measured, and none of
the audited sources publishes below district anyway.

A weather API has no vintage. It answers for a coordinate, now — so every level
of the current bundle can be filled honestly, all 5,950 sub-districts included.
All three apps read current temperatures from [Open-Meteo](https://open-meteo.com/)
(CC BY 4.0, no API key) and drill state → district → sub-district, one request
per view: 36 states, at most 75 districts in a state, at most 38 sub-districts
in a district. It is the one indicator whose values are not shipped with the
dataset — they are fetched when you look, so it is also the only one here that
is not reproducible from a recorded source hash.

`pnpm build:centroids` writes the sampling points it needs — one per region at
every level, derived from the boundary bundles. `geoCentroid` alone would not
do: for a crescent or an island group the centre of mass can fall outside the
region, and asking a weather API about a point in the sea while labelling it a
district would be quietly wrong. Every point is checked with `geoContains` and
replaced by a scan of the region's own bounding box when it fails; 87 of 6,774
needed that, and the count is recorded in the file.

**It samples a point, not an area.** Each region shows the temperature at one
representative point inside it — a large district is a single reading, the same
as a small one. The page says so, because a choropleth invites you to read it as
an area measure and this is not one.

## Boundary assets for the Flutter app

Its data is loaded through `rootBundle`, so it has to live inside the app and is
generated rather than committed. `pnpm build:observatory` populates it; run
`pnpm prepare:observatory-flutter-assets` by hand before using `flutter` there
directly, or `flutter analyze` exits non-zero on the missing asset directory.

## Attribution

Boundary provenance and licences are in [`data/ATTRIBUTION.md`](../../data/ATTRIBUTION.md).
Each indicator's own source is shown in the app, under *Where this number comes from*.
