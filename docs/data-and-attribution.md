# Boundary data, provenance, and attribution

## Separate the software from the geography

The renderer’s source code may be released under MIT (or another software license selected by maintainers). Boundary geometry is a separate work. Each geometry package, download, or generated artifact must carry its own source, version/vintage, license, attribution, checksum, and coverage notes.

Do not describe the boundary data as “MIT” merely because the renderer is MIT-licensed.

## Default community geometry

If the project distributes a derived or converted DataMeet boundary dataset, retain the source attribution and the license notice that applies to that exact upstream asset. The included `census-2011` bundle is derived entirely from DataMeet’s Census-2011 district input and is licensed CC BY 2.5 India. Other DataMeet inputs may carry different notices, so do not treat that licence as a blanket licence for future source editions. The demo and documentation should show a compact attribution such as:

> Administrative boundaries: DataMeet Maps contributors. License, boundary vintage, and coverage: see dataset manifest.

Link the attribution to the exact upstream revision/release and to the local dataset manifest, not only to a project home page. The manifest must state the input’s licence, alongside transformations performed (for example, GeoJSON to TopoJSON, simplification tolerance, property normalization, and topology repair).

The default drill-down bundle is a historical Census-2011 hierarchy. Its state/UT parent IDs and district IDs are deterministic, Census-derived identifiers, not LGD IDs or a claim of current administrative coverage. The package must not combine that district layer with a newer state/UT layer unless it publishes a reviewed crosswalk and explains the resulting coverage limitations.

## Administrative and territorial disclaimer

Maps are visualizations of a selected source dataset at a particular vintage. They do not represent a legal determination of borders, names, jurisdictions, or territorial claims. Administrative units, identifiers, and coverage can change; consumers needing an authoritative or legally current representation should supply and validate their own licensed official geometry.

This text belongs in the docs and dataset manifest. The demo should link to it rather than attempting a large legal notice in the UI.

## Keep boundary meaning and data coverage separate

The country view can contain geometries with different, non-interchangeable meanings. Every release and visible legend must distinguish all three:

| Concept | What it may show | What it must not imply |
| --- | --- | --- |
| **Political-claim context overlay** | An openly licensed, contemporary DataMeet state layer used as a non-metric reference overlay and checked against the Survey of India (SoI) political-map depiction. It is not an SoI dataset. | A legal adjudication, a statement of administrative control, Census-data coverage, or an assertion that the package republishes official SoI geometry. |
| **Administrative control** | Nothing by default. Only show it if an independently sourced, dated control/administration dataset expressly defines it. | That it is derivable from an external boundary, a political claim, or a Census unit. |
| **Census statistical coverage** | The historical Census-2011 DataMeet state/UT and district features for which the bundle has an ID and the host supplies a value. | Current administrative coverage, nationwide completeness, or a value for territory absent from the Census layer. |

Where the political-claim context overlay extends beyond the Census feature collection, the overlay-only area must remain visible but non-interactive, use a distinct `Not covered by Census-2011 data` legend/status treatment, and receive no numeric value, tooltip value, selection, drill-down, percentage, or aggregate contribution. A host must not manufacture a zero, carry a neighbour’s value across the boundary, or re-label the historical aggregate as a national total.

The context overlay must record its exact DataMeet source revision, licence, checksum, transformation, and coverage. Cite the SoI political-map page as the official position/reference used for the comparison, but do not describe the overlay as official SoI data. SoI's site copyright policy requires written permission for reproduction in whole or part, so the package must neither copy, transform, nor redistribute SoI boundary geometry. The DataMeet contemporary overlay and the historical DataMeet Census-2011 statistical bundle remain separate sources with separate licences and manifests.

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
