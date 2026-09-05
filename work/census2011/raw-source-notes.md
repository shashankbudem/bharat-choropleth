# Census 2011 female-literacy source notes

- Official producer: Office of the Registrar General & Census Commissioner, India.
- Download page: https://censusindia.gov.in/nada/index.php/catalog/6191
- Downloaded XLSX: `DDW_PCA0000_2011_Indiastatedist.xlsx`
- Exact download URL: https://censusindia.gov.in/nada/index.php/catalog/6191/download/9268/DDW_PCA0000_2011_Indiastatedist.xlsx
- SHA-256: `7a8f70d46c43b5dd30eefe920f251752f69f6af8589594c21ac06499074646f5`
- Source file size: 1,376,414 bytes.
- Workbook worksheet parsed: `Sheet1`.
- Parsed source rows: 2,028 data rows; the workbook contains 676 geographic units with `TRU` values `Total`, `Rural`, and `Urban`.
- Retained rows: `TRU=Total`, with 35 `STATE` rows and 640 `DISTRICT` rows.
- Formula: `F_LIT / (TOT_F - F_06) * 100`.
- Interpretation: female literacy rate for females aged 7 and above.
- State join: official `State` code to historical geometry `properties.sourceStateCode`.
- District join: official `(State, District)` to historical geometry `(properties.sourceStateCode, properties.source.censuscode)`. This exact code join matches all 640 districts; display names are not used for joining.
- Historical geometry: `data/generated/census-2011/`, validated as 35 state/UT features and 640 district features. Geometry source and attribution are documented in `data/README.md` and `data/generated/census-2011/manifest.json`.
- No changes were made to `groundwater-demo.html`.
