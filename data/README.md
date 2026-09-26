# `@bharat-choropleth/data-prep`

Reproducible preparation and validation of the current (~2019-vintage) India state/UT → district → sub-district boundary bundles the packages load by default.

These are display geometry, not a current administrative register: state, district and sub-district changes after the source's vintage are not reflected. Join user values by `id` (and `parentId`), never by a display name or `slug`.

## State/UT bundle

`generated/current-2019-states/states.topo.json` is the national map. IDs use the `in-cs-` namespace.

It contains 36 current state/UT regions, including Jammu & Kashmir and Ladakh as separate UTs (each its own single polygon reaching the full political extent) and Dadra & Nagar Haveli merged with Daman & Diu into one UT, dissolving the source's two pre-merger features. Each feature carries `id`, `name`, `slug`, and `lgdCode` — the source's official Local Government Directory state code, preferred per this repo's own identity guidance over a derived slug.

```text
state: in-cs-{zero-padded State_LGD code}-{normalized short state/UT name}
```

Source: [`datta07/INDIAN-SHAPEFILES`](https://github.com/datta07/INDIAN-SHAPEFILES), `INDIA/INDIA_STATES.geojson`, pinned commit `2c028f5c30fb4191ca1639ff136b152cecdbb69f` — MIT licensed, current (~2019-vintage per upstream) geometry. This is the same source and commit used by the [india-map-studio](https://github.com/nikhilsawantse/india-map-studio) project, chosen so the outlines match theirs while going through this repo's own TopoJSON quantize/simplify/checksum pipeline instead of pre-baked SVGs. Required attribution:

> State/UT boundaries derived from datta07/INDIAN-SHAPEFILES (MIT).

To regenerate, point `INDIA_SHAPEFILES_DIR` at a checkout of that repository at the pinned commit (default expects `../../../work/india-shapefiles`), then run `npm run prepare:current-states`. `npm run validate:current-states` only reads the committed output and manifest, so — like the rest of this package's validation — it needs no source checkout and is part of the default `npm run validate`.

## District bundle

`generated/current-2019-districts/districts/{stateId}.topo.json` is the matching district drill-down for the state bundle above, lazy-loaded after a state/UT is selected. It contains **788** districts across all 36 current-2019-states, from the same source and commit (`INDIA/INDIA_DISTRICTS.geojson`). IDs use their own `in-cd-` namespace:

```text
district: in-cd-{zero-padded parent LGD code}-{source D_CODE}
```

The raw source needed real cleanup before shipping, all recorded in `generated/current-2019-districts/manifest.json`:

- **Disputed/junk sentinels excluded** (31 features): 28 inter-state boundary dispute slivers (`st_code=99`, e.g. "DISPUTED (JHARKHAND & BIHAR)"), one unidentified Gujarat "ISLAND" artifact, and one duplicate 14-vertex fragment of Purba Medinipur (~0.2% of the real district's area).
- **Mojibake repair** (50 district names, 7 states): the source's own encoding mangled a romanized long-vowel diacritic into one of five substitute characters — verified and repaired with an explicit character mapping (`Bengal#ru`→`Bengaluru`, `K>NGRA`→`Kangra`, `HAM|RPUR`→`Hamirpur`, `DEHRAD@N`→`Dehradun`).
- **Truncated names** (12 Karnataka districts): the field itself is cut short in the source (e.g. `"H"`, `"Ball"`) — identified by cross-referencing each stub's geometry centroid against the current official Karnataka district list, plus 2 West Bengal districts whose "24 Parganas" spelling is inconsistent in the source itself.
- **Yanam reassigned**: the source tags this Puducherry exclave's `statecode` as Andhra Pradesh; reassigned to its real parent based on the source's own state-name property.
- **Mirpur and Muzaffarabad excluded from the value-bearing set**: these two J&K district features are Pakistan-administered territory, not Indian districts (the source itself has no real district code for either). They are not given a value, selection, or drill-down — matching [india-map-studio](https://github.com/nikhilsawantse/india-map-studio)'s own documented exclusion of these same two features. Instead they're merged into a small non-interactive reference overlay, `generated/current-2019-districts/district-reference-overlays/in-cs-01-jammu-and-kashmir.topo.json`, loaded only for J&K's district view via `loadDistrictReferenceOverlay`.

### Simplified to a floor, not to a flat share

This bundle is simplified — the source is genuinely heavy — but simplification is
bounded per district rather than set by one share for the whole file.

The earlier pipeline retained a flat 5% of vertices per state file. That share is a
percentile over every arc weight in the file, so it is set by the districts carrying
the most detail and then applied to the ones carrying the least. This source averages
~2,250 vertices per district but its **median is 564**, and the light half of that
distribution lost its outline: 80 of 788 districts shipped at 20 vertices or fewer and
7 at 8 or fewer, with Jammu & Kashmir, Himachal Pradesh and the north-east worst hit.
Srinagar kept 10 of its 166 vertices. A retained-*area* test could not see this — a
district flattened into a polygon keeps most of its area while losing its shape.

Each district now solves for the largest simplification threshold that still leaves it
at least **60 vertices, or 8% of the vertices it started with**, whichever is larger
and never more than it actually has. Every arc is then simplified at the lowest
threshold any district touching it asked for. Resolving thresholds per arc is what
keeps this safe: a shared boundary is simplified exactly once, so neighbouring
districts still agree on it. It is also why the floor cannot be applied to each
district independently — simplifying two sides of a shared boundary differently tears
it open, so the unsimplified-outline fallback below is now taken only by features that
share no boundary at all.

Retention goes from 4.9% to 9.3% of the source's 1,770,065 vertices (mean 111 → 208
per district), districts at 20 vertices or fewer go from 80 to **0**, and the smallest
district is 35 vertices — Delhi's Shahadara, which has only 35 in the source and is
kept whole. Cost is 1.3 MB raw / 0.39 MB gzip across 36 files, up from 0.85 MB /
0.26 MB; the largest single lazy load goes 88.7 KB → 137.3 KB.

The validator guards this directly: a floor on total vertices, a cap on near-degenerate
features, a cap on features below the per-feature floor, and an assertion that the
manifest still declares the retention share and both floor constants. Nothing else
could see it — counts, ids, checksums, winding and bounds all stayed valid while the
geometry degraded.

The source's two interior rings — one in North and Middle Andaman, one in Jaipur
(Gramin) — are still dropped: the exterior-winding cleanup keeps one ring per polygon,
and holes need the opposite winding. That is unchanged behaviour, not a regression
from this work.

To regenerate, run `npm run prepare:current-districts` followed by `npm run import:map-studio-lakshadweep` (the latter fetches India Map Studio's pinned Lakshadweep SVG), or use `npm run build` which performs both in order. `npm run validate:current-districts` needs no source checkout and is part of the default `npm run validate`.

## Sub-district bundle

`generated/current-2019-subdistricts/subdistricts/{districtId}.topo.json` is the third
level: **5,950** sub-districts (tehsil / taluk / mandal / block) across **785** of the
788 current districts, from the same source and commit
(`INDIA/INDIAN_SUB_DISTRICTS.geojson`). It is lazy-loaded per district — the largest
single file is 37.6 KB — and IDs use their own `in-csd-` namespace:

```text
sub-district: in-csd-{source D_CODE of the parent district}-{Subdt_LGD, or c{sdtcode11} where the source has no LGD code}
```

### Quantised, deliberately not simplified

Unlike the state and district bundles, this one applies **no simplification**. Those
sources are heavy — around 2,160 vertices per district — so retaining 5% of their
vertices still leaves a recognisable district. This source is a different animal: a
median of 70 vertices per sub-district, and sub-districts are drawn at a tighter zoom
than districts, so they need at least as much detail, not less.

Running the district pipeline's 5%-retention step over it reduced the average feature
to 9 vertices and **2,793 of 5,950 features to bare quadrilaterals** — blobs in roughly
the right place rather than places. The bundle now keeps 98.8% of the source's 475,256
vertices (a mean of 80 per feature), costing 6.5 MB raw / 2.3 MB gzip across all 785
files, which is 2× the simplified size for geometry that actually reads as itself.

Interior rings are preserved too: 45 sub-districts enclose 52 holes between them, and
filling those in would swallow enclaves that are genuinely not part of the sub-district.

`validate:current-subdistricts` guards this directly, with a floor on total vertices and
a cap on how many features may be near-degenerate. Nothing else would notice: counts,
ids, checksums and bounds all stay valid while shapes degrade.

### The parent is decided by geometry, not by a key or a name

The district source carries no LGD district code. Its `dist_code` is a different code
space, so matching the sub-districts' `Dist_LGD` against it looks like an 80% hit rate
but 3,578 of those 4,766 pairs disagree on the district name — they are numeric
coincidences. Joining on district name instead leaves 78 districts unmatched, because
the two files spell and vintage their districts differently (`Bid`/`Beed`,
`Bangalore`/`Bengaluru`, `Faizabad`/`Ayodhya`).

So each sub-district is assigned to the district that physically contains it: its
largest part's centroid plus sampled boundary vertices nudged inward, each point won by
the **smallest** containing district, and the district holding the most points becomes
the parent. That places 5,955 of 5,960 candidate features and resolves post-2011
district splits correctly — a sub-district of the old Koriya lands in
Manendragarh-Chirmiri-Bharatpur because that is where it is.

"Smallest" is not a tie-break of convenience. The source ships Rajasthan's `JAIPUR`
inside `JAIPUR(GRAMIN)` and `JODHPUR` inside `JODHPUR GRAMIN` as genuinely overlapping
polygons, so a first-match rule would assign urban sub-districts by index order.

The manifest records 106 assignments that won with under 60% of their sample points.
A low share means the sub-district hugs a shared district edge, not that the parent is
wrong; each was checked against the source's own district label.

### Administrative-vintage limitation

**The source sub-district layer is Census-2011 vintage** (its own `stcode11` /
`dtcode11` / `sdtcode11` fields) while the district layer it hangs off is ~2019 vintage.
Districts created by post-2011 splits therefore receive the sub-districts that
physically sit inside them, which will not always match the sub-district row's own
`dtname`. That is the intended behaviour of a containment join, but it means
`sdtname`/`dtname` pairs must not be read as an administrative register.

### Excluded source features

All recorded in `generated/current-2019-subdistricts/manifest.json`:

- **Pakistan-administered** (2 features): Mirpur and Muzaffarabad appear as one nameless
  district-outline row each. Dropping them from the join index alone would let their
  geometry fall through to a neighbouring Indian district, so they are excluded
  explicitly — the same treatment the district bundle gives the same two features.
- **Unnamed frontier remainders** (4 features): rows with no sub-district name, LGD code
  or Census code — one each in Punch and Kachchh, two in Leh — the parts of those
  districts the source never divides into sub-districts. Their districts' sub-districts
  consequently do not tile them.
- **No containing district** (5 features): Lakshadweep's Bitra, two Mumbai Suburban rows
  with `Subdt_LGD=0`, and two stray West Bengal duplicates mislabelled under South 24
  Parganas.

Five further duplicate rows — one place stored as two features with the same code and
name inside one district — are merged rather than given a second id. Four Arunachal
Pradesh pairs are genuinely different places sharing one LGD code inside a district;
they get a deterministic `-2` suffix.

### Districts with no sub-districts

Three districts deliberately get **no asset at all**, so a renderer can treat them as
not drillable rather than opening an empty view:

| District | Why |
| --- | --- |
| `in-cd-07-169` Nazul (Delhi) | A land-tenure artifact in the source, not a district |
| `in-cd-08-569` Jaipur (Rajasthan) | Urban half of the source's overlapping urban/rural pair; the Census-2011 tehsil layer predates the split, so every tehsil votes into the rural polygon |
| `in-cd-08-575` Jodhpur (Rajasthan) | Same as Jaipur |

To regenerate, run `npm run prepare:current-subdistricts` (it needs both
`INDIA/INDIAN_SUB_DISTRICTS.geojson` and `INDIA/INDIA_DISTRICTS.geojson` from the pinned
checkout — the join reads district geometry from source, because the generated bundle
retains only 5% of its vertices and sub-districts would cross its simplified edges).
`npm run validate:current-subdistricts` needs no source checkout and is part of the
default `npm run validate`; it asserts the parent of every sub-district is a real
district, that the three gaps above are exactly the districts without an asset, and that
no Mirpur/Muzaffarabad geometry reached the value-bearing set.

## Source, licence, and attribution

All three bundles are derived from [`datta07/INDIAN-SHAPEFILES`](https://github.com/datta07/INDIAN-SHAPEFILES) at pinned commit `2c028f5c30fb4191ca1639ff136b152cecdbb69f` (MIT), apart from Lakshadweep's districts, imported from India Map Studio's pinned SVG as described above. Retain this attribution in applications that display this data:

> State/UT, district and sub-district boundaries derived from datta07/INDIAN-SHAPEFILES (MIT).

Each bundle's `manifest.json` records its source commit, input and output SHA-256 digests, licence and simplification settings. See [ATTRIBUTION.md](./ATTRIBUTION.md).

Survey of India geometry is not bundled, transformed, or used in the demo. Its copyright policy requires written permission for reproduction in whole or part; do not treat an SoI download as permissively redistributable merely because it is accessible online.

## Build and validation

To regenerate the data, point `INDIA_SHAPEFILES_DIR` at a checkout of `datta07/INDIAN-SHAPEFILES` at the pinned commit (the local development default expects `../../../work/india-shapefiles`), then run:

```sh
npm ci --ignore-scripts
npm run build
```

`npm run build` prepares the state, district and sub-district bundles, imports Lakshadweep, and validates the result. At the repository root, `pnpm build:data` runs the same step. A clean release checkout does not need the source checkout for normal `pnpm build`, `pnpm validate:data`, or `pnpm check`: those validate the committed generated TopoJSON and manifests. Before accepting regenerated data, confirm the source commit and input checksums match the manifests.

Validation checks decoded TopoJSON geometry, closed polygon rings, India-envelope coordinates, unique IDs, parent-to-child partitioning, manifest counts, lazy-file inventory, and asset budgets.
