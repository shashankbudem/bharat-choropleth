# Boundary-data attribution

The default `census-2011` bundle must be attributed as:

> India district boundaries by DataMeet India community, derived from the Census-2011 district dataset (CC BY 2.5 India).

Source: [DataMeet maps](https://github.com/datameet/maps), pinned at commit `b3fbbde595310b397a55d718e0958ce249a4fa1f`; input `Districts/Census_2011/2011_Dist.shp`.

The upstream [`Districts/README.md`](https://github.com/datameet/maps/blob/master/Districts/README.md) specifies CC BY 2.5 India for the district layer. This is more specific than the repository's general CC BY 4.0 default and is the licence recorded in the generated manifest.

Do not describe this boundary layer as current. It is a Census-2011 historical edition.

## Optional current national reference outline

`generated/datameet-current-claim-outline/outline.topo.json` is derived from `States/Admin2.shp` in the same DataMeet repository, pinned by its own manifest. Attribute it as:

> India boundaries by DataMeet India community (CC BY 4.0).

It is a current-state-derived, non-statistical reference overlay only. It is not Survey of India geometry and must not be presented as official boundary data or joined to metrics.

The `historical-parent-overlays/in-hs-01-jammu-and-kashmir.topo.json` asset uses the same attribution. It is a value-free merger of the current DataMeet Jammu & Kashmir and Ladakh features, displayed only as data-unavailable context alongside the 22 historical Census districts.

## Optional political-claim context overlay

The separate `datameet-current-claim-outline` overlay must be attributed as:

> India boundaries by DataMeet India community (CC BY 4.0).

It is derived from DataMeet `States/Admin2.shp` at the pinned revision in that asset's manifest. It is a non-statistical reference overlay checked against the cited Survey of India political-map depiction, not Survey of India geometry and not a statement of administrative control. Do not combine its CC BY 4.0 notice with the Census bundle's CC BY 2.5 India notice.

## Optional current-vintage state/UT bundle

`generated/current-2019-states/states.topo.json` must be attributed as:

> State/UT boundaries derived from datta07/INDIAN-SHAPEFILES (MIT).

Source: [`datta07/INDIAN-SHAPEFILES`](https://github.com/datta07/INDIAN-SHAPEFILES), pinned at commit `2c028f5c30fb4191ca1639ff136b152cecdbb69f`; input `INDIA/INDIA_STATES.geojson`. MIT licensed — do not combine this notice with the Census bundle's CC BY 2.5 India notice or the DataMeet overlays' CC BY 4.0 notice; each asset keeps its own source's terms.

This is a value-bearing, fully interactive current state/UT layer (unlike the two DataMeet reference overlays above), and is not joined to the Census-2011 bundle by id or name.

## Optional current-vintage district bundle

`generated/current-2019-districts/districts/{stateId}.topo.json` uses the same attribution as the current-vintage state bundle above:

> District boundaries derived from datta07/INDIAN-SHAPEFILES (MIT).

Source: same repository and commit; input `INDIA/INDIA_DISTRICTS.geojson`. Joined to the current-states bundle above by LGD-derived id, not to the Census-2011 district bundle. See [README.md](./README.md#optional-current-vintage-district-bundle) for the source data-quality corrections applied (mojibake repair, truncated names, disputed-boundary exclusions) and for the non-interactive reference overlay covering Mirpur and Muzaffarabad — Pakistan-administered J&K districts that are excluded from the value-bearing set, for the same reason the historical bundle's claimed-territory extent is never given a value.

### Lakshadweep detail override

`districts/in-cs-31-lakshadweep.topo.json` uses the Lakshadweep district SVG path from [India Map Studio](https://github.com/nikhilsawantse/india-map-studio), pinned at commit `db2745512365d194a7c4cabdf7ded79e1c777922`. India Map Studio licenses this public SVG layer under MIT and declares `datta07/INDIAN-SHAPEFILES` (MIT) as its upstream source. Its SVG viewBox coordinates are fitted to the existing Lakshadweep geographic envelope before TopoJSON generation, retaining the detailed island outlines while keeping valid longitude/latitude geometry. The district's existing stable id, parent id, values, and attribution remain unchanged.

## Optional current-vintage sub-district bundle

`generated/current-2019-subdistricts/subdistricts/{districtId}.topo.json` uses the same attribution as the current-vintage state and district bundles above:

> Sub-district boundaries derived from datta07/INDIAN-SHAPEFILES (MIT).

Source: same repository and commit; input `INDIA/INDIAN_SUB_DISTRICTS.geojson`. Joined to the current-districts bundle by spatial containment — the district source carries no LGD district code to key on — and not to the Census-2011 bundle at all. The source layer is itself Census-2011 vintage hanging off ~2019-vintage districts; see [README.md](./README.md#optional-current-vintage-sub-district-bundle) for what that means for post-2011 district splits, and for the excluded features (Mirpur and Muzaffarabad's rows, three unnamed frontier remainders, five features with no containing district).
