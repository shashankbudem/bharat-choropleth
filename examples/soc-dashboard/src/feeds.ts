/**
 * Simulated SOC/NOC telemetry for the nine tiles.
 *
 * Nothing here talks to a real network. Each feed owns a per-state series and a
 * `tick` that advances it, because a national scalar cannot repaint a
 * choropleth — 36 independent series can.
 */

/** Relative IT footprint per state/UT, 0..1. Drives how big each state's numbers get. */
const FOOTPRINT: Record<string, number> = {
  Maharashtra: 1, Karnataka: 0.95, Telangana: 0.86, "Tamil Nadu": 0.84, Delhi: 0.8,
  "Uttar Pradesh": 0.72, Gujarat: 0.7, "West Bengal": 0.6, "Andhra Pradesh": 0.58,
  Haryana: 0.56, Kerala: 0.52, Rajasthan: 0.46, "Madhya Pradesh": 0.44, Punjab: 0.38,
  Odisha: 0.34, Bihar: 0.32, Jharkhand: 0.26, Assam: 0.24, Chhattisgarh: 0.24,
  Uttarakhand: 0.22, "Himachal Pradesh": 0.18, Goa: 0.16, Chandigarh: 0.15,
  "Jammu & Kashmir": 0.14, Tripura: 0.1, Puducherry: 0.1, Manipur: 0.08, Meghalaya: 0.08,
  Nagaland: 0.07, "Arunachal Pradesh": 0.06, Mizoram: 0.06, Sikkim: 0.05, Ladakh: 0.04,
  "Dadra and Nagar Haveli and Daman and Diu": 0.07, "Andaman & Nicobar": 0.05, Lakshadweep: 0.03,
};

export const STATES = Object.keys(FOOTPRINT);

export type Values = Record<string, number>;

/**
 * The one ramp, shared by all nine maps.
 *
 * One hue stepping dark→bright, because these encode magnitude and a multi-hue
 * ramp turns magnitude into a rainbow — the middle buckets come out olive and
 * stop meaning anything. Bright is *more*, so a hot state glows off the dark
 * board and a quiet one recedes into the panel.
 *
 * One hue across the whole grid means brightness reads the same everywhere: a
 * lit-up map is a busy map, whichever tile it is. Whether "more" is good or bad
 * is the tile's job to say — its title and the two legend words carry that, not
 * the colour.
 *
 * The top step is the board's own accent, so a maxed-out state burns the same
 * green as the chrome. Nothing above it: a paler mint on top read as washed-out
 * rather than hot, and put most of the map in a near-white band.
 *
 * Validated as an ordinal ramp against the #0a1016 tile surface: monotone
 * lightness, adjacent ΔL ≥ 0.06, single hue (4° spread), dark end at 2.10:1 on
 * the surface.
 */
export const RAMP = ["#14532d", "#157244", "#179a5b", "#1bcd74", "#22ff88"];


/**
 * `count`  — cumulative "since 00:00" counters. Only ever go up.
 * `live`   — instantaneous readings. Random walk pulled back toward a baseline, so
 *            they go up and down without wandering off.
 * `ratio`  — bounded percentages. Small drift, clamped to [0, 100].
 */
type Mode = "count" | "live" | "ratio";

export interface Feed {
  id: string;
  title: string;
  caption: string;
  unit: string;
  mode: Mode;
  /** Milliseconds between ticks. Deliberately non-multiples so tiles never phase-lock. */
  interval: number;
  legendLabels: [string, string];
  /**
   * Optional: four ascending thresholds, in this feed's own unit, that split the
   * ramp into five fixed bands.
   *
   * Without it the renderer scales the ramp to the current spread, so a fill says
   * where a state sits among the other 35 right now — an all-quiet board still
   * paints its calmest state the darkest green, and a colour that changed
   * overnight might mean the state moved or might mean its neighbours did.
   *
   * With it the fill is an absolute reading: below the first threshold is dim
   * whether it is the only such state or all thirty-six. That is the right call
   * where the thresholds are real rather than invented — uptime has the nines —
   * and the wrong one where a metric has no agreed scale, which is why exactly
   * one tile here uses it.
   */
  breaks?: [number, number, number, number];
  /** Per-state scale factor applied to the footprint weight. */
  scale: number;
  /**
   * How the 36 state series become the one number in the tile header.
   * Counts add up; rates and durations do not — a national "sum of medians"
   * is not a quantity. Defaults to a mean for `ratio` feeds, a sum otherwise.
   */
  aggregate?: "sum" | "mean";
  decimals?: number;
}

export const FEEDS: Feed[] = [
  // Six, not nine: two cumulative counters, two live readings, two bounded
  // percentages. The three that went — phishing quarantined, patch compliance,
  // mean time to detect — each moved exactly like one that stayed, and paying
  // for them in map size made every tile worse.
  {
    id: "outages",
    title: "ACTIVE NETWORK OUTAGES",
    caption: "circuits down · live poll",
    unit: "links",
    mode: "live",
    interval: 900,
    legendLabels: ["stable", "degraded"],
    scale: 26,
  },
  {
    id: "uptime",
    title: "SERVER FLEET UPTIME",
    caption: "reachable nodes · 60s window",
    unit: "%",
    mode: "ratio",
    interval: 1300,
    legendLabels: ["outage", "healthy"],
    breaks: [98, 99, 99.5, 99.9],
    scale: 1,
    decimals: 2,
  },
  {
    id: "itsm",
    title: "ITSM INCIDENTS OPENED TODAY",
    caption: "P1–P4 · cumulative since 00:00",
    unit: "tickets",
    mode: "count",
    interval: 1700,
    legendLabels: ["quiet", "surging"],
    scale: 90,
  },
  {
    id: "edr",
    title: "ENDPOINTS WITHOUT AV / EDR",
    caption: "unprotected share of managed devices",
    unit: "%",
    mode: "ratio",
    interval: 2600,
    legendLabels: ["covered", "exposed"],
    scale: 1,
    decimals: 1,
  },
  {
    id: "intrusions",
    title: "PERIMETER INTRUSIONS BLOCKED",
    caption: "WAF + IPS drops · cumulative today",
    unit: "hits",
    mode: "count",
    interval: 700,
    legendLabels: ["low volume", "heavy"],
    scale: 640,
  },
  {
    id: "vpn",
    title: "CONCURRENT VPN SESSIONS",
    caption: "remote workforce · live",
    unit: "sessions",
    mode: "live",
    interval: 1100,
    legendLabels: ["idle", "saturated"],
    scale: 4200,
  },
];

/** Baseline every series is seeded from and, for `live`, pulled back toward. */
function baseline(feed: Feed, state: string): number {
  const weight = FOOTPRINT[state] ?? 0.1;
  switch (feed.mode) {
    case "ratio":
      // Percentages don't scale with footprint; bigger estates are only slightly messier.
      return feed.id === "edr" ? 2 + weight * 14 : 100 - (feed.id === "uptime" ? weight * 1.4 : 4 + weight * 10);
    case "live":
      // MTTD is a duration: a bigger, better-staffed SOC detects faster, not slower.
      return feed.id === "mttd" ? feed.scale * (1.15 - weight * 0.7) : feed.scale * (0.08 + weight * 0.92);
    case "count":
      return feed.scale * weight * 0.45;
  }
}

export function seed(feed: Feed): Values {
  const values: Values = {};
  for (const state of STATES) {
    const base = baseline(feed, state);
    // Percentages get an additive jitter. A multiplicative one puts a 99% uptime
    // baseline at 74% on first paint, and reversion is slow enough that the tile
    // opens on a national outage that never happened.
    values[state] = clamp(feed, feed.mode === "ratio" ? base + (Math.random() - 0.5) * 4 : base * (0.75 + Math.random() * 0.5));
  }
  return values;
}

function clamp(feed: Feed, value: number): number {
  if (feed.mode === "ratio") return Math.min(100, Math.max(0, value));
  return Math.max(0, value);
}

/**
 * One tick of the whole feed. `count` feeds only ever add; `live` and `ratio`
 * feeds move in both directions.
 */
export function tick(feed: Feed, previous: Values): Values {
  const next: Values = {};
  for (const state of STATES) {
    const current = previous[state] ?? 0;
    const base = baseline(feed, state);
    if (feed.mode === "count") {
      // Bursty arrivals: most ticks add a little, some add a lot. Never negative.
      const burst = Math.random() < 0.12 ? 6 : 1;
      next[state] = current + Math.random() * base * 0.05 * burst;
    } else if (feed.mode === "live") {
      // Mean-reverting random walk: noise plus a pull back to baseline.
      const noise = (Math.random() - 0.5) * base * 0.35;
      next[state] = clamp(feed, current + (base - current) * 0.18 + noise);
    } else {
      const noise = (Math.random() - 0.5) * 1.2;
      next[state] = clamp(feed, current + (base - current) * 0.1 + noise);
    }
  }
  return next;
}

/** Which of the five bands a reading falls in. Ascending, so band 4 is the hottest. */
export function bandOf(feed: Feed, value: number | null): number | null {
  const breaks = feed.breaks;
  if (!breaks || value === null || !Number.isFinite(value)) return null;
  let band = 0;
  while (band < breaks.length && value >= (breaks[band] as number)) band += 1;
  return band;
}

/** The fill for a reading, or the no-data colour. Passed to the renderer as its colour scale. */
export function colorOf(feed: Feed, value: number | null): string {
  const band = bandOf(feed, value);
  return band === null ? "var(--india-map-empty)" : (RAMP[band] as string);
}

const INTEGER = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/**
 * A threshold, as short as it can be written. The reading formatter pads to the
 * feed's decimals — right for a live number that would otherwise jitter in width,
 * wrong for a legend, where "99.50" is just noise around "99.5".
 */
export function formatBreak(value: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
}

export function format(feed: Feed, value: number): string {
  if (feed.decimals) return value.toFixed(feed.decimals);
  return INTEGER.format(Math.round(value));
}

/** Counts roll up as a national total; rates and durations as a mean. */
export function rollUp(feed: Feed, values: Values): number {
  const numbers = STATES.map((state) => values[state] ?? 0);
  const total = numbers.reduce((sum, n) => sum + n, 0);
  const aggregate = feed.aggregate ?? (feed.mode === "ratio" ? "mean" : "sum");
  return aggregate === "mean" ? total / numbers.length : total;
}

/** Rounded to what the tile actually prints, so a sub-display-precision wobble isn't drawn as a move. */
export function trend(feed: Feed, current: number, previous: number): "up" | "down" | "flat" {
  const digits = feed.decimals ?? 0;
  const delta = Number(current.toFixed(digits)) - Number(previous.toFixed(digits));
  return delta > 0 ? "up" : delta < 0 ? "down" : "flat";
}
