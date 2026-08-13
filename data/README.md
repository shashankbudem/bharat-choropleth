# `@bharat-choropleth/data-prep`

Reproducible preparation and validation of the default, **historical Census-2011** India state/UT → district drill-down bundle.

## What ships

`generated/census-2011/states.topo.json` is the initial country asset. It contains a TopoJSON object named `states`; each feature has a stable `id`, `name`, `slug`, `sourceStateCode`, and `administrativeVintage`.

`generated/census-2011/districts/{stateId}.topo.json` is lazy-loaded after selecting a state/UT. Each file contains a TopoJSON object named `districts`; each feature has `id`, `parentId`, `name`, `slug`, `sourceStateCode`, and `sourceDistrictCode`.

The default package intentionally uses coherent Census-2011 geometry at both levels. State/UT regions are topologically dissolved from their corresponding districts, so the country map has true outer state/UT outlines (no internal district seams) and a click has a matching drill-down file. It contains 35 historical state/UT regions and 640 districts. The processor deterministically excludes the single non-geographic source sentinel `ST_CEN_CD=99`, `DT_CEN_CD=99`, `DISTRICT=Data Not Available`; that filter is recorded in the manifest and asserted during validation.

The IDs are deterministic library IDs, not official LGD IDs:

```text
state:    in-hs-{ST_CEN_CD}-{normalised-source-state-name}
district: in-d{ST_CEN_CD}-{DT_CEN_CD}
```

Join user values using `id` (and district `parentId`), not a display name or `slug`. The untouched source attributes are retained under `properties.source` for audit/mapping work.

## Important administrative limitation

This is a historical Census-2011 layer, not a current administrative register. It intentionally does not imply later district/state/UT changes, including Telangana, Ladakh, or the merged Dadra and Nagar Haveli and Daman and Diu UT. A future, independently sourced current boundary edition must use a separate versioned bundle; it must not be combined with this district geometry by name matching.

## Source, licence, and attribution

The source is DataMeet's [`maps` repository](https://github.com/datameet/maps), commit `b3fbbde595310b397a55d718e0958ce249a4fa1f`, specifically `Districts/Census_2011/2011_Dist.shp`. Its `Districts/README.md` explicitly licenses the district dataset under [CC BY 2.5 India](https://creativecommons.org/licenses/by/2.5/in/). Retain this attribution in applications that display this data:

> India district boundaries by DataMeet India community, derived from the Census-2011 district dataset (CC BY 2.5 India).

DataMeet documents a repository-level CC BY 4.0 default, but the district README is a specific licence override. This bundle follows that explicit district licence.

The optional, non-statistical national context overlay is a different derived DataMeet asset, built from `States/Admin2.shp` under the repository-default CC BY 4.0 licence. It is kept in `generated/datameet-current-claim-outline/` with its own manifest and must be attributed as `India boundaries by DataMeet India community (CC BY 4.0)`. It is checked against the Survey of India political-map depiction but is not Survey of India data or a statement of administrative control. It must not receive a metric value, participate in an aggregate, or be joined to the Census hierarchy. See [official-outline.md](./official-outline.md).

Survey of India geometry is not bundled, transformed, or used in the demo. Its copyright policy requires written permission for reproduction in whole or part; do not treat an SoI download as permissively redistributable merely because it is accessible online.

## Build and validation

To regenerate the data, point `DATAMEET_MAPS_DIR` to a DataMeet maps checkout at the exact commit recorded in the manifest (the local development default expects `../../../work/datameet-maps`), then run:

```sh
npm ci --ignore-scripts
npm run build
npm run prepare:claim-outline
npm run validate:claim-outline
```

At the repository root, `pnpm build:data` runs that regeneration step. A clean release checkout does not need the source-data checkout for normal `pnpm build`, `pnpm validate:data`, or `pnpm check`: those validate the committed generated TopoJSON and manifests. Before accepting regenerated data, confirm the source commit and input checksum match the manifest.

The processor records commit pin, input/output SHA-256 digests, vintage, licence, and simplification settings in `generated/census-2011/manifest.json`. It uses topology-preserving TopoJSON quantisation (`20,000`) and an explicitly recorded 0.5% retained finite-vertex share, tuned to preserve country-outline fidelity within the initial-asset budget. Raw GeoJSON is a local debug artifact and excluded from distribution.

Validation checks GeoJSON and decoded TopoJSON geometry, closed polygon rings, India-envelope coordinates, D3 spherical area and per-region national-envelope bounds (to catch inverted rings/full-viewport fills), unique IDs, exact parent-to-district partitioning, manifest counts, lazy-file inventory, and initial asset budget. The current state bundle is capped at 250 KB raw / 100 KB gzip.

`npm run build` also generates and validates `generated/datameet-current-claim-outline/outline.topo.json`: the separately versioned, CC BY 4.0 DataMeet current-state-derived national reference outline. It is one merged, non-statistical feature (no state seams), with a manifest checksum, source checksum, and western/northern/eastern/southern extent guard cross-checked against the official depiction. It is not Survey of India data; see [official-outline.md](./official-outline.md).

For `in-hs-01-jammu-and-kashmir`, the same bundle publishes a predictable drill-down reference asset at `generated/datameet-current-claim-outline/historical-parent-overlays/in-hs-01-jammu-and-kashmir.topo.json` (object `outline`). It merges the contemporary DataMeet Jammu & Kashmir and Ladakh features, carries no value field, and is explicitly `data-unavailable`; the 22 Census-2011 district features remain unchanged and value-bearing.

`prepare:claim-outline` and `validate:claim-outline` separately create and validate the DataMeet CC BY 4.0 national context overlay. They are intentionally not part of the Census build because they are different-vintage, non-statistical geometry.
