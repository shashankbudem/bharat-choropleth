# Changelog

## 1.0.1 - 2026-09-14

No change to the panel. The bundle is identical to 1.0.0 apart from its version
string; this release exists so that the tag, the source tree and the published
artifact correspond exactly, which 1.0.0's did not.

Since 1.0.0 the repository gained fixes that do not reach the bundle but do
reach anyone building or reviewing it:

- The development stack refused to load the plugin. It emptied
  `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS`, correct while the plugin was
  privately signed and wrong for the unsigned builds distributed during catalog
  review — Grafana skips such a plugin outright rather than warning, so the
  panel simply never appeared.
- Release tags did not trigger a release. The workflow matched `v*` while the
  only tag was `panel-v1.0.0`, so tagging looked like it published and silently
  did not. Both forms now match; plain `v1.0.1` is the convention.
- The build reads whichever boundary layout it finds, so the monorepo and this
  repository compile from the same webpack config.
- The plugin carried the Grafana scaffold's Apache 2.0 licence while the project
  is MIT. Now MIT throughout.

## 1.0.0 - 2026-09-13

First release.

### Features

- India choropleth panel across three levels — 36 states and union
  territories, 788 districts, 5,950 sub-districts — with click-through
  drill-down and a breadcrumb back out.
- Boundary geometry ships inside the plugin and is served by Grafana itself,
  so the map is same-origin, needs no CORS, and works in an air-gapped
  install with no configuration. Point **Boundary data base URL** at your own
  host or a CDN if you would rather it came from elsewhere.
- One flat query feeds every level: rows are sorted by which name columns they
  fill, so state totals and district rows can share a query or sit in separate
  ones, in any order.
- Drill-down can write the clicked region into a dashboard variable, so other
  panels follow the map.
- Relative or fixed colour scales. Fixed bands take their own thresholds per
  level, and the legend filters the map to one band.
- Seven single-hue sequential ramps, theme-aware, with configurable border
  colour and width, label colour and size, and optional values on regions.
- Names that match no region are reported on the panel rather than dropped,
  and **Aliases** lets you map your spelling to the geometry's.

### Notes

- Requires Grafana 12.3.0 or later.
- Region names are resolved through a state registry, so `Orissa`, `Odisha`
  and an LGD id all land on the same state. Districts and sub-districts have
  no such registry — renames are declared explicitly under Aliases, because
  attributing one district's numbers to another is worse than showing none.
