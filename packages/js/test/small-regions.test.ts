import { describe, expect, it } from "vitest";
import {
  boundsOfRing,
  convexHull,
  enlargeSmallParts,
  distanceToBox,
  distanceToParts,
  keepsTrueGeometry,
  labelPointFor,
  largestRingExtent,
  placeOutsideLabel,
  ringsToPath,
  scatteredHitArea,
  type Point,
} from "../src/small-regions";

function square(x: number, y: number, size: number): Point[] {
  return [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
    [x, y],
  ];
}

describe("boundsOfRing", () => {
  it("returns the axis-aligned box around a ring", () => {
    expect(boundsOfRing(square(10, 20, 5))).toEqual([10, 20, 15, 25]);
  });
});

describe("largestRingExtent", () => {
  it("measures the biggest single part, not the spread between parts", () => {
    // An island group: two specks a long way apart. The spread is 100; what
    // matters for "can you see or click this" is that each part is 2.
    const rings = [square(0, 0, 2), square(100, 0, 2)];
    expect(largestRingExtent(rings)).toBe(2);
  });

  it("is zero for a feature with no rings", () => {
    expect(largestRingExtent([])).toBe(0);
  });
});

describe("labelPointFor", () => {
  it("uses the largest part's centroid, not the average across parts", () => {
    // A big square at the origin and a speck far east. Averaging would drop the
    // label in the empty space between them.
    const rings = [square(0, 0, 10), square(100, 0, 1)];
    const [x, y] = labelPointFor(rings, [999, 999]);
    expect(x).toBeCloseTo(5, 5);
    expect(y).toBeCloseTo(5, 5);
  });

  it("falls back when every ring is degenerate", () => {
    expect(labelPointFor([[[1, 1]]], [7, 8])).toEqual([7, 8]);
    expect(labelPointFor([], [7, 8])).toEqual([7, 8]);
  });
});

describe("distanceToBox", () => {
  it("is zero inside the box", () => {
    expect(distanceToBox([5, 5], [0, 0, 10, 10])).toBe(0);
  });

  it("measures to the nearest edge, and diagonally past a corner", () => {
    expect(distanceToBox([15, 5], [0, 0, 10, 10])).toBe(5);
    expect(distanceToBox([13, 14], [0, 0, 10, 10])).toBeCloseTo(5, 5);
  });
});

describe("distanceToParts", () => {
  it("measures to the nearest part, not to a box around all of them", () => {
    // Puducherry's shape: enclaves either side of a neighbour. A single box
    // around both would report zero for a point in the middle, which is land
    // belonging to someone else.
    const parts = [boundsOfRing(square(0, 0, 2)), boundsOfRing(square(100, 0, 2))];
    expect(distanceToParts([50, 1], parts)).toBe(48);
    expect(distanceToParts([103, 1], parts)).toBe(1);
  });
});

describe("placeOutsideLabel", () => {
  const base = {
    clearance: 10,
    halfSize: [5, 3] as Point,
    viewBox: [1000, 1000] as Point,
    centre: [500, 500] as Point,
  };

  it("places the label directly away from the map centre when that side is clear", () => {
    const placed = placeOutsideLabel({ ...base, anchor: [400, 500], isBlocked: () => false });
    // Anchor is due west of centre, so the label goes further west.
    expect(placed![0]).toBeLessThan(400);
    expect(placed![1]).toBeCloseTo(500, 5);
  });

  it("turns to another side when the straight-out direction is blocked", () => {
    // Puducherry's case: the away-from-centre direction runs inland, and only a
    // different angle reaches open water.
    const blockedWest = (candidate: Point) => candidate[0] < 400;
    const placed = placeOutsideLabel({ ...base, anchor: [400, 500], isBlocked: blockedWest });
    expect(placed).not.toBeNull();
    expect(blockedWest(placed!)).toBe(false);
  });

  it("returns null when every direction is blocked, so the caller can leave the label alone", () => {
    // Delhi: ringed by other states on all sides.
    expect(placeOutsideLabel({ ...base, anchor: [400, 500], isBlocked: () => true })).toBeNull();
  });

  it("keeps the label inside the view box", () => {
    const placed = placeOutsideLabel({ ...base, anchor: [2, 2], isBlocked: () => false });
    expect(placed![0]).toBeGreaterThanOrEqual(base.halfSize[0]);
    expect(placed![1]).toBeGreaterThanOrEqual(base.halfSize[1]);
  });
});

describe("enlargeSmallParts", () => {
  it("preserves relative sizes within a feature", () => {
    // Andaman & Nicobar: scaling each island up to the threshold on its own made
    // all fifteen exactly the same size, which is what read as fake.
    const [big, small] = enlargeSmallParts([square(0, 0, 4), square(50, 0, 1)], 8);
    const bigWidth = boundsOfRing(big!)[2] - boundsOfRing(big!)[0];
    const smallWidth = boundsOfRing(small!)[2] - boundsOfRing(small!)[0];
    expect(bigWidth / smallWidth).toBeCloseTo(4, 5); // 4:1 before, 4:1 after
    expect(bigWidth).toBeCloseTo(8, 5); // largest part reaches the threshold
  });

  it("grows a part that is too small, about its own centre", () => {
    const [ring] = enlargeSmallParts([square(10, 10, 2)], 8);
    const [minX, minY, maxX, maxY] = boundsOfRing(ring!);
    expect(maxX - minX).toBeCloseTo(8, 5);
    expect(maxY - minY).toBeCloseTo(8, 5);
    // Centred where it was, so the island stays in the right place.
    expect((minX + maxX) / 2).toBeCloseTo(11, 5);
    expect((minY + maxY) / 2).toBeCloseTo(11, 5);
  });

  it("leaves parts that are already big enough untouched", () => {
    const original = square(0, 0, 50);
    expect(enlargeSmallParts([original], 8)[0]).toEqual(original);
  });

  it("is a no-op when disabled", () => {
    const original = square(0, 0, 1);
    expect(enlargeSmallParts([original], 0)[0]).toEqual(original);
  });

  it("caps growth, so a speck never reads as a real landmass", () => {
    // Asking for 800 from a 1-unit speck would be an 800x blow-up.
    const [ring] = enlargeSmallParts([square(0, 0, 1)], 800, 8);
    const [minX, , maxX] = boundsOfRing(ring!);
    expect(maxX - minX).toBeCloseTo(8, 5);
  });

  it("leaves a big region's small parts alone", () => {
    // West Bengal: a large mainland plus fourteen delta islets. Enlarging those
    // islets individually blew them into an overlapping mess across the river
    // mouth, so a feature is either small as a whole or it is left untouched.
    const mainland = square(0, 0, 100);
    const islet = square(200, 0, 1);
    const rings = enlargeSmallParts([mainland, islet], 14);
    expect(rings[0]).toEqual(mainland);
    expect(rings[1]).toEqual(islet);
  });

  it("keeps each part's shape, scaling both axes by the same factor", () => {
    // Scaling axes separately would fatten a thin atoll, and turn every
    // coastline into a caricature of itself.
    const sliver: Point[] = [[0, 0], [4, 0], [4, 1], [0, 1], [0, 0]];
    const [ring] = enlargeSmallParts([sliver], 8);
    const [minX, minY, maxX, maxY] = boundsOfRing(ring!);
    expect((maxX - minX) / (maxY - minY)).toBeCloseTo(4, 5); // aspect ratio preserved
    expect(maxX - minX).toBeCloseTo(8, 5);
  });

  it("scales each part independently, keeping them apart", () => {
    const rings = enlargeSmallParts([square(0, 0, 1), square(100, 0, 1)], 6);
    expect(boundsOfRing(rings[0]!)[0]).toBeLessThan(boundsOfRing(rings[1]!)[0]);
  });
});

describe("ringsToPath", () => {
  it("writes a closed subpath per ring", () => {
    const d = ringsToPath([square(0, 0, 1), square(5, 5, 1)]);
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.match(/Z/g)).toHaveLength(2);
  });

  it("skips empty rings rather than emitting a broken subpath", () => {
    expect(ringsToPath([[]])).toBe("");
  });
});

describe("keepsTrueGeometry", () => {
  it("holds back Puducherry, whose enclaves have no room to grow into", () => {
    expect(keepsTrueGeometry("in-cs-34-puducherry")).toBe(true);
  });

  it("lets Lakshadweep grow, because its islands grow into open sea", () => {
    expect(keepsTrueGeometry("in-cs-31-lakshadweep")).toBe(false);
    expect(keepsTrueGeometry("in-cs-30-goa")).toBe(false);
  });

  it("matches host ids in whatever case and scheme they arrive in", () => {
    expect(keepsTrueGeometry("Puducherry")).toBe(true);
    expect(keepsTrueGeometry("34-PUDUCHERRY")).toBe(true);
  });
});

describe("convexHull", () => {
  it("wraps scattered points, dropping the ones inside", () => {
    const hull = convexHull([[0, 0], [10, 0], [10, 10], [0, 10], [5, 5], [3, 7]]);
    expect(hull).toHaveLength(4);
    expect(boundsOfRing(hull)).toEqual([0, 0, 10, 10]);
  });

  it("returns what it was given when there is nothing to wrap", () => {
    expect(convexHull([[1, 1], [2, 2]])).toEqual([[1, 1], [2, 2]]);
    // Collinear: no ring exists, so the points come back rather than a zero-area path.
    expect(convexHull([[0, 0], [1, 1], [2, 2]])).toHaveLength(3);
  });

  it("ignores duplicated points, which projected rings are full of", () => {
    expect(convexHull([[0, 0], [0, 0], [4, 0], [4, 4], [4, 4], [0, 4]])).toHaveLength(4);
  });
});

describe("scatteredHitArea", () => {
  it("spans the water an island group encloses", () => {
    // Lakshadweep in miniature: specks spread across a tall box.
    const islands = [square(0, 0, 1), square(8, 20, 1), square(2, 40, 1)];
    const hull = scatteredHitArea(islands, 22)!;
    expect(hull).not.toBeNull();
    expect(boundsOfRing(hull)).toEqual([0, 0, 9, 41]);
  });

  it("leaves a single-part region alone — its own outline is the target", () => {
    expect(scatteredHitArea([square(0, 0, 4)], 22)).toBeNull();
  });

  it("leaves a region that is already easy to point at", () => {
    // Andaman-sized parts: scattered, but each one big enough to aim for.
    expect(scatteredHitArea([square(0, 0, 30), square(0, 60, 30)], 22)).toBeNull();
  });
});
