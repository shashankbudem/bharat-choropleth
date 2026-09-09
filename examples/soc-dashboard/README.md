# SOC & NOC dashboard

A 3×2 board of six `BharatChoropleth` maps, each on its own simulated live feed,
in a dark operations-centre theme. The whole board is one screenful — no
scrolling on a desktop viewport.

```bash
pnpm install
pnpm --filter @bharat-choropleth/soc-dashboard dev
```

## The six feeds

| Tile | Behaviour | Tick |
| --- | --- | --- |
| Active network outages | up and down | 900 ms |
| Server fleet uptime % | bounded drift, **fixed bands** | 1300 ms |
| ITSM incidents opened today | only up | 1700 ms |
| Endpoints without AV / EDR % | bounded drift | 2600 ms |
| Perimeter intrusions blocked | only up | 700 ms |
| Concurrent VPN sessions | up and down | 1100 ms |

Two cumulative counters, two live readings, two bounded percentages.

Intervals are deliberately non-multiples of each other, so the tiles never
phase-lock and the board updates asynchronously.

## Relative vs fixed bands

Five tiles hand the renderer a colour ramp, which scales it to the current
spread. A fill then says where a state sits among the other 35 *right now* — an
all-quiet board still paints its calmest state dim and its busiest bright, and a
colour that changed overnight might mean the state moved or might mean its
neighbours did.

The uptime tile passes a **function** colour scale instead, mapping each reading
through four fixed thresholds — 98 / 99 / 99.5 / 99.9, the nines. Its fill is an
absolute reading: below 98 is dim whether it is the only such state or all
thirty-six, and the legend can print the thresholds rather than saying "lower"
and "higher". A badge on the tile says which encoding it is on, so the two are
never silently mixed.

It is one tile because fixed bands are a claim about the metric. Uptime has
agreed thresholds; "concurrent VPN sessions" does not, and inventing some would
dress a guess up as a standard.

## How it holds up under six maps

- **One geometry fetch.** The state layer is fetched once at module scope and the
  same promise is handed to all nine tiles.
- **State lives in the tile.** Each tile owns its `useState` and its own
  `setInterval`, so a tick re-renders one map instead of nine.
- **No drill-down.** `BharatChoropleth` only enables district drill-down when it
  fetched the state layer itself; supplying `geometry` leaves each tile a single
  level, which is what a fixed grid cell wants.
- **One ramp, one hue, everywhere.** Magnitude is a single hue stepping
  dark→bright; a multi-hue ramp turns magnitude into a rainbow and the middle
  buckets come out olive. Bright is *more*, so a hot state glows off the dark
  board and a quiet one recedes into the panel — and because every tile shares
  the ramp, brightness reads the same on all six. Whether "more" is good or bad
  is the tile's title and legend words to say, not the colour's.
- **The legend is five swatches, not a gradient.** Values land in exactly five
  fills; a smooth bar would promise a continuum nothing paints.
- **One screenful.** The board is a flex column whose grid row uses
  `minmax(0, 1fr)` tracks, so the maps scale to the height left over instead of
  setting it. Below ~1000px wide or ~620px tall it gives up and scrolls, rather
  than squeezing six unreadable maps into the viewport.

The ramp is validated as an ordinal scale against the `#0a1016` tile surface —
monotone lightness, adjacent ΔL ≥ 0.06, one hue (4° spread), and a dark end at
2.10:1 on the surface. Its top step is the board's own accent green.

## Data — read this before shipping it

Every number is generated in the browser by [`src/feeds.ts`](./src/feeds.ts) —
36 independent per-state series per feed, seeded from a rough IT-footprint
weight. Nothing here reads a real network, a SIEM, or an ITSM queue.

**The board no longer says so on screen.** The "simulated feed" badge and the
synthetic-values footer were removed so the demo reads as a product. That is
fine for a demo and not fine in front of someone who might take these for their
own infrastructure — before this is user-facing, either point `Tile`'s interval
at a real source or put the notice back. The footer that remains is the boundary
bundle's licence attribution, which has to stay either way.

The invariants that make the simulation believable are checked, not assumed:

```bash
pnpm --filter @bharat-choropleth/soc-dashboard check
```

It asserts that cumulative counters never decrease, live readings move in both
directions, and percentages stay inside 0–100, over 200 ticks of every feed — and
that the fixed bands are ordered and total, so a bigger reading never lands in a
lower band and a fill never depends on the other 35 states.
