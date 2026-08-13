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
