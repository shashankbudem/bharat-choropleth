# ISFR 2023 map data is blocked

## Result

Do not wire this use case into `groundwater-demo.html` yet. The official Volume II was downloaded and parsed, but it does not provide a complete one-value-per-751-administrative-district table.

## Exact blocker

- `Table 10.1.3` through `Table 10.36.3`: 36 district tables.
- Numeric records in those tables: 786.
- Aggregate `Grand Total` rows: 36.
- District rows: **750**, not 751.
- The report’s own footnote says forest cover is combined for **East Siang & Siang**, so one reported change value represents two districts. Splitting that value into two district values would be fabricated.
- The only geometry available locally or publicly in the project’s BharatChoropleth data path is the independently sourced approximately-2019 bundle: 36 state/UT features and 788 districts. It is not a 2023 Survey-of-India geometry and has no official ISFR crosswalk.

## Required unblock

Obtain from FSI/Survey of India a 2023-vintage district geometry and authoritative crosswalk, plus separate values for East Siang and Siang (or an explicit geometry rule that treats the combined report unit as one feature). Then require exact feature/value equality before enabling the map: 36 state/UT units at national view and every district feature in the selected state at drill-down.
