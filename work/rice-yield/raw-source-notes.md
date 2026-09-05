# DES APY rice-yield preparation — raw-source notes

Status: BLOCKED before extraction.

## Official source

- OGD resource: https://www.data.gov.in/resource/district-wise-season-wise-crop-production-statistics-1997
- Direct CSV advertised by the OGD resource: https://aps.dac.gov.in/APY/apy.csv
- DES district APY report: https://data.desagri.gov.in/website/crops-report-district-level-web
- DES APY compilation description: https://desagri.gov.in/divisions-cell/special-data-dissemination-standards-sdds/

The OGD metadata describes district-wise, crop-wise, season-wise and year-wise covered area in hectares and production in tonnes. It does not document a stable LGD district-key join in the resource metadata.

## Download attempt

Attempted on 2026-08-20 from the project workspace:

```text
curl -L --retry 3 --retry-delay 2 --max-time 180 --connect-timeout 30 \
  -o /tmp/bharat-rice-yield/apy.csv \
  https://aps.dac.gov.in/APY/apy.csv
```

Result: connection timeout on `aps.dac.gov.in:443` after repeated retries; zero-byte output and no HTTP response. A direct HTTP attempt on port 80 and `www.aps.dac.gov.in` also timed out. `https://data.desagri.gov.in/APY/apy.csv` returned the DES HTML portal shell, not a CSV.

Because no CSV bytes were retrieved, the APY schema, filtered row count, crop labels, season labels, year encoding, area/production units, and source-side district identifiers could not be inspected or asserted.

## Required extraction once the host is reachable

1. Download and hash `apy.csv`.
2. Inspect the actual header and encoding.
3. Filter the exact source representation of Rice/Paddy, Kharif, and 2022–23.
4. Validate numeric area and production; derive `yieldKgHa = productionTonnes * 1000 / areaHa`.
5. Resolve duplicates according to source semantics; do not silently aggregate duplicate keys.
6. Join to the repository's exact current-2019 geometry IDs using source codes if available, otherwise a reviewed state-plus-district crosswalk.
7. Require one numeric value for every expected geometry feature before generating `validated-values.json`.
