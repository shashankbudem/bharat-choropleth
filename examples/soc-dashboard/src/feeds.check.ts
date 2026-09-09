/**
 * Self-check for the simulation invariants the dashboard is judged on.
 *
 *   node src/feeds.check.ts
 *
 * Node strips the types itself, so this needs no build step and no test runner.
 */
import assert from "node:assert/strict";
import { FEEDS, rollUp, seed, STATES, tick, type Values } from "./feeds.ts";

const TICKS = 200;

for (const feed of FEEDS) {
  let values: Values = seed(feed);
  const history: Values[] = [values];
  for (let i = 0; i < TICKS; i += 1) {
    values = tick(feed, values);
    history.push(values);
  }

  for (const state of STATES) {
    const series = history.map((frame) => frame[state] as number);
    assert.ok(
      series.every(Number.isFinite),
      `${feed.id}/${state}: produced a non-finite reading`,
    );

    if (feed.mode === "count") {
      // A "created today" counter that ticks down is the bug this whole check exists for.
      const dropped = series.findIndex((value, i) => i > 0 && value < (series[i - 1] as number));
      assert.equal(dropped, -1, `${feed.id}/${state}: cumulative counter decreased at tick ${dropped}`);
    } else {
      const moved = { up: false, down: false };
      series.forEach((value, i) => {
        if (i === 0) return;
        if (value > (series[i - 1] as number)) moved.up = true;
        if (value < (series[i - 1] as number)) moved.down = true;
      });
      assert.ok(moved.up && moved.down, `${feed.id}/${state}: live reading never moved both ways`);
    }

    if (feed.mode === "ratio") {
      assert.ok(
        series.every((value) => value >= 0 && value <= 100),
        `${feed.id}/${state}: percentage left the 0–100 range`,
      );
    }
  }

  // A mean must sit inside the per-state range; a sum must not be below its largest member.
  const last = history.at(-1) as Values;
  const readings = STATES.map((state) => last[state] as number);
  const national = rollUp(feed, last);
  const bound = feed.aggregate === "mean" || feed.mode === "ratio" ? Math.max(...readings) : readings.reduce((a, b) => a + b, 0);
  assert.ok(national <= bound + 1e-9, `${feed.id}: national roll-up ${national} exceeds ${bound}`);
}

console.log(`ok — ${FEEDS.length} feeds × ${STATES.length} states × ${TICKS} ticks`);
