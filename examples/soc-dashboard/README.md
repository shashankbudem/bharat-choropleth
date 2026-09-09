# SOC / NOC grid

A 3×3 board of nine `BharatChoropleth` maps, each on its own simulated live
feed, in a dark operations-centre theme.

```bash
pnpm install
pnpm --filter @bharat-choropleth/soc-dashboard dev
```

## The nine feeds

| Tile | Behaviour | Tick |
| --- | --- | --- |
| Active network outages | up and down | 900 ms |
| Server fleet uptime % | bounded drift | 1300 ms |
| ITSM incidents opened today | only up | 1700 ms |
| Endpoints without AV / EDR % | bounded drift | 2600 ms |
| Perimeter intrusions blocked | only up | 700 ms |
| Phishing mail quarantined | only up | 2100 ms |
| Concurrent VPN sessions | up and down | 1100 ms |
| Critical patch compliance % | bounded drift | 3100 ms |
| Mean time to detect | up and down | 1900 ms |

Intervals are deliberately non-multiples of each other, so the tiles never
phase-lock and the board updates asynchronously.

## How it holds up under nine maps

- **One geometry fetch.** The state layer is fetched once at module scope and the
  same promise is handed to all nine tiles.
- **State lives in the tile.** Each tile owns its `useState` and its own
  `setInterval`, so a tick re-renders one map instead of nine.
- **No drill-down.** `BharatChoropleth` only enables district drill-down when it
  fetched the state layer itself; supplying `geometry` leaves each tile a single
  level, which is what a fixed grid cell wants.
- **One hue per map.** These ramps encode magnitude, so each is a single hue
  stepping dark→bright. A multi-hue ramp turns magnitude into a rainbow and the
  middle buckets come out olive. On a dark board bright reads as *more*, so a hot
  state glows and a quiet one recedes into the panel.
- **Hue is the metric family, not the value.** Five ramps — risk, load, health,
  defence, capacity — so two tiles asking the same kind of question look alike,
  and the grid order keeps same-hue tiles off each other's shoulder.
- **The legend is five swatches, not a gradient.** The renderer buckets values
  into exactly five fills; a smooth bar would promise a continuum it never paints.

Every ramp is validated as an ordinal scale against the `#0a1016` tile surface —
monotone lightness, adjacent ΔL ≥ 0.06, one hue, and a dark end that still clears
2:1 on the surface.

## Data

Every number is generated in the browser by [`src/feeds.ts`](./src/feeds.ts) —
36 independent per-state series per feed, seeded from a rough IT-footprint
weight. Nothing here reads a real network.

The invariants that make the simulation believable are checked, not assumed:

```bash
pnpm --filter @bharat-choropleth/soc-dashboard check
```

It asserts that cumulative counters never decrease, live readings move in both
directions, and percentages stay inside 0–100, over 200 ticks of every feed.
