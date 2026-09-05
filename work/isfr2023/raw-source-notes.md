# ISFR 2023 forest-cover change: raw-source notes

## Official source

- Report: *India State of Forest Report 2023, Volume II*, Forest Survey of India.
- Exact download: https://fsi.nic.in/uploads/isfr2023/isfr_book_eng-vol-2_2023.pdf
- Downloaded locally for extraction as `/tmp/isfr2023/isfr_book_eng-vol-2_2023.pdf`.
- SHA-256: `86029d090ae3687a20f9353e86841959434e76b15f28a7bbc0511f853dbae344`.
- PDF size: 15,294,980 bytes; pages: 428.
- FSI report landing page: https://fsi.nic.in/forest-report-2023

## Extracted field

The target field is the last numeric field in each district table, headed **“Change w.r.t. 2021 Raster based*”**. It is a forest-cover change value in km2, not legal forest area. The district tables are Tables 10.1.3 through 10.36.3, covering 36 state/UT chapters.

Extraction used `pdftotext` for inspection and `pdfplumber` page/table text for row parsing. For each table, the eight numeric columns were read in order as calculated area, VDF, MDF, OF, total forest cover, percent of calculated area, target change, and scrub. `Grand Total` rows were excluded. District labels were retained from the table text; the report’s superscript footnote marker `H` is a PDF text-extraction artifact and must not be treated as part of a geometry name.

## Count audit

- Expected administrative-district count used for this audit: **751**.
- District-table numeric records including aggregates: **786**.
- Aggregate rows excluded: **36** (`Grand Total`, one per state/UT table).
- District rows actually present after aggregate exclusion: **750**.
- The report explicitly footnotes the combined row **“East Siang & Siang”** in Table 10.2.3. This is the concrete reason the table field is not a one-value-per-751-district dataset: two administrative districts share one reported value.
- No `validated-values.json` is emitted because a complete 751-row one-to-one district value table cannot be truthfully derived from this source.

## Geometry/crosswalk sources checked

- Local state geometry manifest: `/Users/shashankbudem/Documents/Bharath Choropleth/data/generated/current-2019-states/manifest.json`; 36 features; source is `datta07/INDIAN-SHAPEFILES`, commit `2c028f5c30fb4191ca1639ff136b152cecdbb69f`, described by its manifest as approximately 2019-vintage.
- Local district geometry manifest: `/Users/shashankbudem/Documents/Bharath Choropleth/data/generated/current-2019-districts/manifest.json`; 788 value-bearing district features across 36 parents; same independent source/commit and no ISFR/SoI crosswalk.
- Public state bundle: https://cdn.jsdelivr.net/gh/shashankbudem/bharat-choropleth@v0.1.0/data/generated/current-2019-states/states.topo.json
- Public district bundle base: https://cdn.jsdelivr.net/gh/shashankbudem/bharat-choropleth@v0.1.0/data/generated/current-2019-districts/
- The checked local/public bundles expose their own LGD-derived IDs, not a report-year 2023 Survey-of-India district identifier or an official ISFR crosswalk. FSI’s public report materials do not provide a downloadable 2023 geometry-plus-crosswalk package in the checked sources.
