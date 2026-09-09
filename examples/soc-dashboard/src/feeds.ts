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
  /** Low-to-high ramp. Ends are chosen by polarity: whichever end is bad is red. */
  colorScale: string[];
  legendLabels: [string, string];
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
  {
    id: "outages",
    title: "ACTIVE NETWORK OUTAGES",
    caption: "circuits down · live poll",
    unit: "links",
    mode: "live",
    interval: 900,
    colorScale: ["#052e1c", "#0f5132", "#b45309", "#dc2626", "#ff2d55"],
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
    colorScale: ["#ff2d55", "#dc2626", "#b45309", "#15803d", "#22ff88"],
    legendLabels: ["outage", "healthy"],
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
    colorScale: ["#04231a", "#0e7490", "#0ea5e9", "#f59e0b", "#ff2d55"],
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
    colorScale: ["#052e1c", "#15803d", "#b45309", "#dc2626", "#ff2d55"],
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
    colorScale: ["#042f2e", "#0f766e", "#22c55e", "#a3e635", "#22ff88"],
    legendLabels: ["low volume", "heavy"],
    scale: 640,
  },
  {
    id: "phish",
    title: "PHISHING MAIL QUARANTINED",
    caption: "secure email gateway · cumulative today",
    unit: "mails",
    mode: "count",
    interval: 2100,
    colorScale: ["#1e1b4b", "#4c1d95", "#7c3aed", "#c026d3", "#f0abfc"],
    legendLabels: ["trickle", "campaign"],
    scale: 220,
  },
  {
    id: "vpn",
    title: "CONCURRENT VPN SESSIONS",
    caption: "remote workforce · live",
    unit: "sessions",
    mode: "live",
    interval: 1100,
    colorScale: ["#083344", "#0e7490", "#06b6d4", "#67e8f9", "#a5f3fc"],
    legendLabels: ["idle", "saturated"],
    scale: 4200,
  },
  {
    id: "patch",
    title: "CRITICAL PATCH COMPLIANCE",
    caption: "CVSS ≥ 9.0 remediated within SLA",
    unit: "%",
    mode: "ratio",
    interval: 3100,
    colorScale: ["#ff2d55", "#dc2626", "#b45309", "#15803d", "#22ff88"],
    legendLabels: ["behind", "compliant"],
    scale: 1,
    decimals: 1,
  },
  {
    id: "mttd",
    title: "MEAN TIME TO DETECT",
    caption: "SIEM alert → triage · rolling median",
    unit: "min",
    mode: "live",
    interval: 1900,
    colorScale: ["#052e1c", "#15803d", "#eab308", "#dc2626", "#ff2d55"],
    legendLabels: ["fast", "slow"],
    scale: 34,
    aggregate: "mean",
    decimals: 1,
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

const INTEGER = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

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
