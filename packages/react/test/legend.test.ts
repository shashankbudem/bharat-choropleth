import { describe, expect, it } from "vitest";
import { legendBucketLabel, legendBuckets, swatchIndexOf } from "../src/legend";

describe("swatchIndexOf", () => {
  it("puts the extremes on the end swatches", () => {
    expect(swatchIndexOf(0, 0, 100, 5)).toBe(0);
    expect(swatchIndexOf(100, 0, 100, 5)).toBe(4);
  });

  it("rounds to the nearest stop, so each swatch owns half a step either side", () => {
    // Five stops across 0–100 sit at 0, 25, 50, 75, 100.
    expect(swatchIndexOf(37, 0, 100, 5)).toBe(1); // nearer 25 than 50
    expect(swatchIndexOf(38, 0, 100, 5)).toBe(2);
  });

  it("has nothing to paint without a value or without a ramp", () => {
    expect(swatchIndexOf(null, 0, 100, 5)).toBeNull();
    expect(swatchIndexOf(5, 0, 100, 0)).toBeNull();
  });

  it("collapses to the top swatch when there is no spread to map", () => {
    // A one-colour ramp, and data where every region has the same value: one
    // band, everything in it — rather than a divide by zero.
    expect(swatchIndexOf(5, 0, 100, 1)).toBe(0);
    expect(swatchIndexOf(7, 7, 7, 5)).toBe(4);
  });
});

describe("legendBuckets", () => {
  const colors = ["#a", "#b", "#c"];

  it("counts what lands in each swatch and measures the range from it", () => {
    // Three stops across 0–10 sit at 0, 5, 10.
    const buckets = legendBuckets(colors, [0, 1, 5, 6, 9, 10, null], 0, 10);
    expect(buckets.map((bucket) => bucket.matches)).toEqual([2, 2, 2]);
    expect(buckets[1]).toMatchObject({ index: 1, color: "#b", from: 5, to: 6 });
  });

  it("reports an empty swatch as empty rather than inventing a range", () => {
    // Nothing near the middle stop: the ramp has a visible gap, and the swatch
    // has to say so instead of naming values no region has.
    const [, middle] = legendBuckets(colors, [0, 1, 10], 0, 10);
    expect(middle).toMatchObject({ matches: 0, from: null, to: null });
  });

  it("has no swatches without a ramp", () => {
    expect(legendBuckets([], [1, 2], 1, 2)).toEqual([]);
  });
});

describe("legendBucketLabel", () => {
  const format = (value: number) => String(value);

  it("says what picking the swatch will give you", () => {
    expect(legendBucketLabel({ index: 0, color: "#a", from: 12, to: 18, matches: 4 }, format))
      .toBe("Highlight 4 regions, 12 to 18");
    expect(legendBucketLabel({ index: 0, color: "#a", from: 25, to: 25, matches: 1 }, format))
      .toBe("Highlight 1 region, 25");
  });

  it("names an empty swatch without a range", () => {
    expect(legendBucketLabel({ index: 0, color: "#a", from: null, to: null, matches: 0 }, format))
      .toBe("No regions in this band");
  });
});
