# NFHS-5 raw-source notes

## Official downloads

- District XLS: https://data.gov.in/sites/default/files/datafile/NFHS_5_India_Districts_Factsheet_Data.xls
- State/UT XLS: https://data.gov.in/sites/default/files/datafile/NFHS_5_Factsheets_Data.xls
- District resource: https://www.data.gov.in/resource/india-districts-factsheets-national-family-health-survey-nfhs-5-2019-2021-provisional
- State/UT resource: https://www.data.gov.in/resource/all-india-and-stateut-wise-factsheets-national-family-health-survey-nfhs-5-2019-2021

## Download and parsing

Downloaded on 2026-08-20. Source SHA-256 values are recorded in `join-audit.json`. The XLS files were opened with the available LibreOffice Calc runtime and converted to XLSX XML for deterministic parsing. The district workbook has 708 spreadsheet rows including the header (707 district records). The state workbook has 112 spreadsheet rows across Urban/Rural/Total; filtering `Area == Total` yields 37 rows: India plus 36 state/UT records.

The source encodes some small-sample percentages as negative stored numbers so that spreadsheet formatting displays them in parentheses. The parser records these as `parenthesized_numeric` and stores their absolute percentage value. A literal `*` is treated as suppressed, never as zero.

## Metrics audited

The complete numeric district metrics are listed in `validated-values.json`: improved sanitation, child stunting, and child anaemia. Full vaccination has 13 district suppressions and is therefore excluded from the complete metric set. The other three have 707/707 numeric district values and zero suppressions.

## Geometry and vintage

The local current-2019 district bundle has 788 features and the local Census-2011 bundle has 640 features, so neither is suitable. The public DHS Spatial Data Repository exposes the NFHS-5 survey-boundary layer through its ArcGIS service. Querying India (`DHSCC='IA'`) for `SVYID=541` (survey year 2020 / NFHS-5) returned 36 state features and 707 district features. Published methodology identifies this layer as the 707-district NFHS-5 frame representing boundaries as of 31 March 2017.

Public geometry service: https://gis.dhsprogram.com/arcgis/rest/services/Geometry/SDR_Regions/MapServer/0
Query endpoint: https://gis.dhsprogram.com/arcgis/rest/services/Geometry/SDR_Regions/MapServer/0/query

The join uses DHS geometry attributes `OTHREGCO:REGCODE` as `stateCode:districtCode`. Because the official XLS contains names but no matching codes, the audit applies a deterministic normalized name/state join plus eight documented spelling aliases; the resulting join is 707/707 and one-to-one.
