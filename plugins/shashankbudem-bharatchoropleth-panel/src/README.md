# Bharat Choropleth

A choropleth map of India for Grafana. Colour 36 states and union territories by
any number your query returns, then click a state to open its districts, and a
district to open its sub-districts — 788 and 5,950 of them respectively.

![States, coloured by value](https://raw.githubusercontent.com/shashankbudem/bharat-choropleth/main/plugins/shashankbudem-bharatchoropleth-panel/src/img/screenshot-states.png)

Boundary geometry ships inside the plugin and is served by Grafana itself, so
the map is same-origin, needs no CORS headers, makes no third-party request from
a viewer's browser, and works in an air-gapped install with no configuration.

## Requirements

Grafana 12.3.0 or later. No datasource plugin is required — anything that
returns a region name and a number will do.

## Getting started

Add the panel and point three field options at your query:

| Option | What it reads |
| --- | --- |
| **Region field** | the state or union territory name |
| **Value field** | the number to colour by |
| **District field** | the district name, for rows that carry one |

One flat result feeds every level. Rows are sorted by *which* name columns they
fill, never by which query they came from, so a row with a state and no district
is that state's own value, and a row with both is a district value nested under
it. State totals and district rows can share a query or sit in separate ones, in
any order:

```sql
SELECT state, NULL AS district, SUM(active_users) AS active_users
FROM usage GROUP BY state
UNION ALL
SELECT state, district, SUM(active_users)
FROM usage WHERE state = '$state' GROUP BY state, district
```

![Drilled into a state's districts](https://raw.githubusercontent.com/shashankbudem/bharat-choropleth/main/plugins/shashankbudem-bharatchoropleth-panel/src/img/screenshot-districts.png)

## Names that do not match

State names go through a registry, so `Orissa`, `Odisha`, `od` and an LGD id all
land on the same state. Districts and sub-districts have no such registry —
there are 788 of them and they get renamed — so a query saying `Bangalore`
against geometry saying `Bengaluru Urban` simply misses.

Nothing is guessed. Attributing one district's numbers to another is worse than
showing none: a wrong number on a map is believed, a blank one gets investigated.
Instead, unmatched names are reported on the panel, and you declare the rename
yourself under **Aliases**, one per line:

```
Bangalore = Bengaluru Urban
Bagalkote = Bagalkot
```

## Drill-down as a dashboard control

Set **Set dashboard variable** to the name of a dashboard variable and the
clicked region is written into it, so the rest of the dashboard follows the map.
Reference it in your queries as `$state` (or whatever you named it). The
breadcrumb writes the variable too, so navigating back up clears it.

Leave it empty and the map still drills; it just keeps that state to itself.

## Colour

Seven single-hue sequential ramps, each stepping light to dark — the shape a
magnitude scale needs. Colours follow the Grafana theme, and border colour and
width, label colour and size, and whether values are drawn on regions are all
configurable.

By default the scale is **relative**: the lightest shade is the lowest value on
screen and the darkest is the highest, which re-scales as you drill. Switch to
**fixed bands** to give the colours a meaning that holds at every level — and
each level can take its own thresholds, because a number that is high for a
state is not high for a sub-district. With fixed bands the legend becomes a
filter: click a band to dim everything else.

![Fixed bands, with a filtering legend](https://raw.githubusercontent.com/shashankbudem/bharat-choropleth/main/plugins/shashankbudem-bharatchoropleth-panel/src/img/screenshot-bands.png)

## Boundary data

Boundaries are current as of 2019 and ship with the plugin. To serve them from
somewhere else — a CDN, or your own host — set **Boundary data base URL** to a
directory laid out the same way. Leave it empty to use the bundled copy.

## Accessibility

Every region is focusable and activates with <kbd>Enter</kbd>, so the map drills
by keyboard alone; focus moves into the level you enter and back to the region
you left. Values can be drawn on regions so colour is never the only encoding,
and the tooltip is reported to screen readers.

## Documentation and support

Source, issues and the underlying `bharat-choropleth` library live at
[github.com/shashankbudem/bharat-choropleth](https://github.com/shashankbudem/bharat-choropleth).
Please report bugs through
[GitHub issues](https://github.com/shashankbudem/bharat-choropleth/issues).

## Disclaimer

Boundaries are provided for data visualisation and do not represent any position
on the delineation of international borders.
