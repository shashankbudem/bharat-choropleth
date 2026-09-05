# CGWB 2023 groundwater extraction data-preparation notes

## Source

- Official report: https://cgwb.gov.in/cgwbpnm/public/uploads/documents/17014272111704550895file.pdf
- Assessment year: 2023
- Downloaded PDF SHA-256: `31a00ee8ad8408b28cee3ef14a93c2a9a89a887c1bf54821e3b8c8e69258c568`
- Extracted source sections: Annexure I (state-wise) and Annexure II (district-wise)
- Metric: Stage of Ground Water Extraction (%)

## Extraction result

- State/UT rows extracted: **37**; unique normalized state keys: **37**.
- District rows extracted: **705**; unique normalized state+district keys: **705**.
- Duplicate state keys: **0**.
- Duplicate district keys: **0**.
- District state counts are recorded in `join-audit.json`.

The report has 37 state/UT table rows because the 2023 assessment lists Dadra & Nagar Haveli and Daman & Diu separately.

## Normalization

Raw names are retained in `validated-values.json`. Join keys are derived with Unicode NFKC normalization, uppercase conversion, `&` to `AND`, punctuation removal, and whitespace collapse. The three Andaman district rows are explicitly reassigned from the PDF text-extraction adjacency artifact to `Andaman & Nicobar`; this is recorded in the audit methodology.

## Geometry/crosswalk audit

Local geometry was found in:

- `data/generated/current-2019-states/states.geojson` — 36 state/UT features; manifest identifies it as current approximately 2019 and merges Dadra & Nagar Haveli with Daman & Diu.
- `data/generated/current-2019-districts/districts/*.topo.json` — 788 current-vintage district features from the same independently sourced bundle.

A complete 2023-compatible join is **blocked**. The local geometry is not a 2023 CGWB boundary layer, state coverage is 36 versus 37 report rows, and the district table has no official stable boundary/crosswalk identifiers. Publicly confirmed official resources are the CGWB report and IN-GRES portal (https://ingres.iith.ac.in/), but no stable downloadable 2023 geometry-plus-crosswalk package was confirmed during this task.

## Decision

Do not wire these values into `groundwater-demo.html`. The attributes are complete and audited as tables, but the map use case remains blocked until a vintage-matched 2023 geometry/crosswalk is obtained and exact feature-set equality is demonstrated.

