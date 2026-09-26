# Boundary-data attribution

All bundles are derived from [`datta07/INDIAN-SHAPEFILES`](https://github.com/datta07/INDIAN-SHAPEFILES), pinned at commit `2c028f5c30fb4191ca1639ff136b152cecdbb69f`, which is MIT licensed. Each bundle's `manifest.json` records its exact inputs and checksums.

## State/UT bundle

`generated/current-2019-states/states.topo.json` must be attributed as:

> State/UT boundaries derived from datta07/INDIAN-SHAPEFILES (MIT).

Input: `INDIA/INDIA_STATES.geojson`.

## District bundle

`generated/current-2019-districts/districts/{stateId}.topo.json` must be attributed as:

> District boundaries derived from datta07/INDIAN-SHAPEFILES (MIT).

Input: `INDIA/INDIA_DISTRICTS.geojson`. Joined to the state bundle by LGD-derived id. See [README.md](./README.md#district-bundle) for the source data-quality corrections applied (mojibake repair, truncated names, disputed-boundary exclusions) and for the non-interactive reference overlay covering Mirpur and Muzaffarabad — Pakistan-administered J&K districts that are excluded from the value-bearing set.

### Lakshadweep detail override

`districts/in-cs-31-lakshadweep.topo.json` uses the Lakshadweep district SVG path from [India Map Studio](https://github.com/nikhilsawantse/india-map-studio), pinned at commit `db2745512365d194a7c4cabdf7ded79e1c777922`. India Map Studio licenses this public SVG layer under MIT and declares `datta07/INDIAN-SHAPEFILES` (MIT) as its upstream source. Its SVG viewBox coordinates are fitted to the existing Lakshadweep geographic envelope before TopoJSON generation, retaining the detailed island outlines while keeping valid longitude/latitude geometry. The district's existing stable id, parent id, values, and attribution remain unchanged.

## Sub-district bundle

`generated/current-2019-subdistricts/subdistricts/{districtId}.topo.json` must be attributed as:

> Sub-district boundaries derived from datta07/INDIAN-SHAPEFILES (MIT).

Input: `INDIA/INDIAN_SUB_DISTRICTS.geojson`. Joined to the district bundle by spatial containment — the district source carries no LGD district code to key on. The source sub-district layer is itself Census-2011 vintage hanging off ~2019-vintage districts; see [README.md](./README.md#sub-district-bundle) for what that means for later district splits, and for the excluded features (Mirpur and Muzaffarabad's rows, three unnamed frontier remainders, five features with no containing district).

Survey of India geometry is not bundled or used.
