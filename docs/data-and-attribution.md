# Boundary data, provenance, and attribution

## Separate the software from the geography

The renderer’s source code may be released under MIT (or another software license selected by maintainers). Boundary geometry is a separate work. Each geometry package, download, or generated artifact must carry its own source, version/vintage, license, attribution, checksum, and coverage notes.

Do not describe the boundary data as “MIT” merely because the renderer is MIT-licensed.

## Default geometry

The bundled boundaries are derived from [`datta07/INDIAN-SHAPEFILES`](https://github.com/datta07/INDIAN-SHAPEFILES) at a pinned commit, which is MIT licensed; Lakshadweep's districts come from India Map Studio's MIT-licensed SVG of the same source. The demo and documentation should show a compact attribution such as:

> State/UT, district and sub-district boundaries derived from datta07/INDIAN-SHAPEFILES (MIT).

Link the attribution to the exact upstream revision and to the local dataset manifest, not only to a project home page. Each manifest states the input's licence alongside the transformations performed (for example, GeoJSON to TopoJSON, simplification, property normalization, and topology repair). See [data/ATTRIBUTION.md](../data/ATTRIBUTION.md).

IDs are LGD-derived where the source carries LGD codes. They are not a claim of current administrative coverage: the source is ~2019 vintage.

## Administrative and territorial disclaimer

Maps are visualizations of a selected source dataset at a particular vintage. They do not represent a legal determination of borders, names, jurisdictions, or territorial claims. Administrative units, identifiers, and coverage can change; consumers needing an authoritative or legally current representation should supply and validate their own licensed official geometry.

This text belongs in the docs and dataset manifest. The demo should link to it rather than attempting a large legal notice in the UI.

## Keep reference context separate from values

Some geometry is shown for context, not measured: the bundled J&K district view draws the two Pakistan-administered districts (Mirpur, Muzaffarabad) as a non-interactive reference overlay. Reference geometry must stay visible but receive no numeric value, tooltip value, selection, drill-down, percentage, or aggregate contribution. A host must not manufacture a zero or carry a neighbour's value across the boundary. The renderers' `referenceOverlay` and `loadDistrictReferenceOverlay` have no value accessor for exactly this reason.

Survey of India's site copyright policy requires written permission for reproduction in whole or part, so the package must neither copy, transform, nor redistribute SoI boundary geometry.

## Bringing alternate or official geometry

The React package accepts a GeoJSON/TopoJSON `MapLayer` supplied by the consumer, with `getId`, `getLabel`, and `getValue` accessors. This lets an organisation use its approved source without forking the renderer.

Before publishing an alternate dataset, the consumer should confirm:

1. Redistribution and derivative-work rights, including any required notices.
2. The administrative vintage, jurisdiction/coverage, coordinate reference system, and update policy.
3. Stable join keys (prefer official local-government IDs, such as LGD IDs, where available) and an explicit alias/migration table for historic data.
4. Whether simplification changed visual or analytical suitability; maps should not be used to infer area or boundary precision from display geometry.

## Dataset manifest minimum fields

```json
{
  "name": "india-states",
  "version": "2026.0.0",
  "administrativeVintage": "YYYY-MM-DD or source release",
  "source": { "name": "…", "url": "…", "revision": "…" },
  "license": "…",
  "attribution": "…",
  "coverage": "…",
  "idScheme": "…",
  "transformations": ["…"],
  "sha256": "…"
}
```
