# Bharat Choropleth panel

An India choropleth for Grafana: 36 states & UTs, drilling into 788 districts and
5,950 sub-districts, with each level's boundary geometry fetched only when you
open it. Wraps [`bharat-choropleth`](https://github.com/shashankbudem/bharat-choropleth).

## Installing

Download the zip from [Releases](https://github.com/shashankbudem/shashankbudem-bharatchoropleth-panel/releases),
unzip it into Grafana's plugin directory and restart Grafana:

```bash
unzip shashankbudem-bharatchoropleth-panel-1.0.0.zip -d /var/lib/grafana/plugins
```

Builds published here are unsigned until the plugin is accepted into the Grafana
catalog, so Grafana has to be told to load it:

```
GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=shashankbudem-bharatchoropleth-panel
```

## Where this code lives

This repository is the plugin on its own, so it builds and can be reviewed
without anything else checked out. The renderer it wraps, the pipeline that
generates the boundary geometry, and the sibling JS, Python and Flutter packages
are developed in
[shashankbudem/bharat-choropleth](https://github.com/shashankbudem/bharat-choropleth).

`data/generated/` is a vendored copy of the boundaries from that repository —
about 10 MB across the three levels — committed here so a clone builds a working
plugin with no network and no sibling checkout. It is a copy, and copies drift,
so refresh it only with:

```bash
npm run sync:geometry ../bharat-choropleth
```

## Releasing

This is where panel releases are cut, so there is exactly one zip and one SHA1
per version for a Grafana reviewer or an installer to choose between. Tag it
plain — no prefix, this repository holds one thing — and
`.github/workflows/release.yml` builds the artifact and attaches it to a
release:

```bash
git tag v1.0.1
git push origin v1.0.1
```

The first release is tagged `panel-v1.0.0`, from before this repository was
split out; that form still triggers the workflow, so the existing download URL
keeps working.

Do not edit files here to prepare a release. This repository is generated from
`plugins/shashankbudem-bharatchoropleth-panel` in the monorepo and the next sync
overwrites anything committed directly — change the version and CHANGELOG
upstream, let the sync carry them, then tag here.

## Developing

```bash
npm ci
npm run build        # production bundle in dist/
npm run test:ci      # unit tests
npm run typecheck
npm run server       # Grafana on :3000 with the plugin mounted
```

## Shape your query like this

The panel tells the two levels apart by a **district column**, never by which
query a row came from — so put them in one query or two, in any order.

**Two queries is the shape you want in production**, because query B only fetches
the districts of the state you actually drilled into:

```sql
-- A: one row per state. District column empty.
SELECT state, NULL AS district, count(*) AS incidents
FROM   incidents
GROUP  BY state;

-- B: districts of the drilled state only.
SELECT state, district, count(*) AS incidents
FROM   incidents
WHERE  state = '$state'
GROUP  BY state, district;
```

Set **Set dashboard variable** to `state` and the map writes the clicked region
into `$state`, so query B re-runs scoped to it — and every other panel bound to
`$state` follows the same click.

One query works too, if the district count is small enough to fetch up front:

```
state,district,incidents
Maharashtra,,412            <- blank district: the state's own value
Maharashtra,Ahmednagar,13   <- named district: nested under that state
```

Leave **District field** unset for a state-level-only map.

## State names

Whatever your database calls a state, the packaged registry resolves it: display
name, slug, LGD id, a former name, or a separator-free spelling. `Maharashtra`,
`karnataka`, `Orissa`, `tamilnadu` and `in-cs-01-jammu-and-kashmir` all land in
the right place. Unrecognized names are ignored with a console warning rather
than throwing.

## Options

| Option | What it does |
| --- | --- |
| Region field | State/UT name, slug or LGD id. Defaults to the first string field. |
| District field | Optional. Rows carrying one become district values under their state. |
| Value field | The number to colour by. Defaults to the first numeric field. |
| Drill down | Click a state for its districts, then a district for its sub-districts. |
| Set dashboard variable | Variable to write the clicked region into, without the `var-` prefix. |
| Show legend | The legend is also a filter — pick a band and the rest dims. |
| Show values on map | Print each region's value at its centroid. |
| Boundary data base URL | Point at your own copy of `data/generated` for an air-gapped Grafana. |

## Air-gapped Grafana

Boundary bundles are fetched at runtime, from a public CDN by default. Copy
`data/generated` somewhere your Grafana can reach and set **Boundary data base
URL** to it. The panel itself bundles no geometry.

## Development

```bash
npm install
npm run dev            # build and watch
npm run server         # Grafana on :3000 with this plugin loaded unsigned
```

The provisioned dashboard **Bharat Choropleth panel** demonstrates both queries
and the drill-down variable.

## Licence

MIT. Boundary geometry is derived from
[`datta07/INDIAN-SHAPEFILES`](https://github.com/datta07/INDIAN-SHAPEFILES) (MIT)
and carries its own attribution.
