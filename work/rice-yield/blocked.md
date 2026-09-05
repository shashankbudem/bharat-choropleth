# Rice-yield data preparation — NOT READY

The requested complete join cannot be produced in this run.

## Concrete blocker

The official downloadable source URL is:

https://aps.dac.gov.in/APY/apy.csv

The host did not accept connections from the workspace after repeated HTTPS retries and an HTTP fallback. The download produced zero bytes, so there is no source table to inspect, filter, derive, or join. The DES portal URL returned HTML rather than the APY CSV.

No placeholder, illustrative, endpoint-only, or partial values were created.

## Completeness target

- State/UT geometry features: 36.
- District geometry features: 788.
- Required state values: 36 numeric values.
- Required district values: 788 numeric values across all district assets.
- Any selected-state drill-down must match that state's exact district feature count; for example, Punjab requires 23 values.

## Why the map cannot be initialized yet

The current-2019 geometry uses LGD-derived IDs and an independently sourced district layer. The APY CSV schema and identity fields were not available for inspection, so compatibility cannot be established. A name-only join would be unsafe because district names, mergers, splits, and historical vintages may differ.

## Resume condition

Re-run the extraction when `aps.dac.gov.in` is reachable, or provide the downloaded official CSV locally. Do not add the rice-yield slide to `groundwater-demo.html` until `join-audit.json` reports zero missing values, zero unmatched geometry IDs, and zero duplicate join keys.
