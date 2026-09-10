# Bharat Choropleth panel

An India choropleth for Grafana: 36 states & UTs, drilling into 788 districts and
5,950 sub-districts, with each level's boundary geometry fetched only when you
open it. Wraps [`bharat-choropleth`](https://github.com/shashankbudem/bharat-choropleth).

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
