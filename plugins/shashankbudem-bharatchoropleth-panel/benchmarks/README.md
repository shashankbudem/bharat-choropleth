# Performance evidence for `73bf18f`

Measured on Grafana 12.3.1 with Chromium 153 at 1440×1000. The baseline is the
exact `73bf18f370064735e9028224854fa03c87c89898` build; the comparison build is
this branch. Results are not used as pass/fail CI thresholds.

## Decoded-topology retention

`cache-memory.ts` reads and parses all 821 district and sub-district topology
files that the panel cache can encounter. Five panel-local caches are measured
in each fresh process to move the retained heap well above GC noise. Five
independent trials produced the same baseline and a 64-byte range for the LRU.

| Metric                            | `73bf18f` unbounded map | 8-entry LRU |  Change |
| --------------------------------- | ----------------------: | ----------: | ------: |
| Retained entries per panel        |                     821 |           8 | −99.03% |
| Median retained heap, five panels |           195,140,512 B | 1,271,200 B | −99.35% |
| Median retained heap per panel    |               37.22 MiB |    0.24 MiB | −99.35% |

Run one fresh-process sample with:

```sh
TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS"}' node --expose-gc \
  -r ts-node/register/transpile-only benchmarks/cache-memory.ts unbounded
TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS"}' node --expose-gc \
  -r ts-node/register/transpile-only benchmarks/cache-memory.ts bounded
```

The production gzip grows from 31,171 B to 31,793 B (+622 B, +2.00%) for the
bounded cache and correctness fixes.

## External variable switching

`drilldown.mjs` warms both state/district topologies, then alternates 20 times
between a sub-district view and an externally selected state. Five fresh browser
processes were run per build (100 switches each).

| Metric (median of five run summaries) | `73bf18f` | Fixed build |
| ------------------------------------- | --------: | ----------: |
| Switch latency, median                |  134.4 ms |    136.6 ms |
| Switch latency, p95                   |  145.6 ms |    147.7 ms |
| React commits per switch              |         7 |           7 |
| Topology requests after warm-up       |         0 |           0 |

This is flat within local browser noise and is deliberately **not** claimed as
a speed improvement. The controlled-state rewrite is retained for correctness:
it removes the cached state-switch race and lint-invalid state-reset effects.

Run a 20-switch sample against the Grafana server on port 3000 with:

```sh
BENCH_VARIANT=fixed BENCH_RUNS=20 node benchmarks/drilldown.mjs
```
