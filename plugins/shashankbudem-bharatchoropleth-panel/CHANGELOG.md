# Changelog

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
