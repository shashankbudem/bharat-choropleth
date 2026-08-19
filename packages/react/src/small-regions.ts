/**
 * Geometry for regions that are too small to use normally.
 *
 * Goa is a few view-box units across, Puducherry is scattered enclaves, and
 * Lakshadweep's islands are a fraction of a pixel at national scale. Left alone
 * they are invisible, unclickable, and their value labels either don't fit or
 * land on a neighbour. These helpers back the three fixes for that: a marker so
 * they can be seen, a click buffer so they can be hit, and label placement that
 * moves a number into open space beside the region.
 *
 * Pure functions of projected coordinates, so the DOM renderer, the React
 * component and the Dart port can all share one definition of the behaviour.
 */

export type Point = readonly [number, number];

/** Axis-aligned box as `[minX, minY, maxX, maxY]`. */
export type Box = readonly [number, number, number, number];

/**
 * Regions kept at their true size even when they are small enough to qualify
 * for exaggeration.
 *
 * Exaggeration assumes a region has room to grow into. Puducherry does not: it
 * is four coastal enclaves *inside* Tamil Nadu, so growing them to the
 * visibility threshold pushes each one several units into the state around it,
 * and the map ends up showing a Puducherry that is the wrong shape in the wrong
 * place. Lakshadweep's islands grow into open sea, where nothing is displaced,
 * which is the case the feature was built for.
 *
 * Matched on the id containing the name because host data brings its own id
 * scheme; the bundled layer uses `in-cs-34-puducherry`. A district id inside the
 * UT matches too, which is a no-op: drilled into, its districts fill the map and
 * are far past the threshold that would have grown them.
 */
const TRUE_GEOMETRY_REGIONS = ["puducherry"];

export function keepsTrueGeometry(id: string): boolean {
  const normalized = id.toLowerCase();
  return TRUE_GEOMETRY_REGIONS.some((name) => normalized.includes(name));
}

export function boundsOfRing(ring: readonly Point[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/**
 * Longest side of the largest ring's box. This is the measure of "small", not
 * the feature's overall bounds: an island group's bounds can be large while
 * every island in it is sub-pixel.
 */
export function largestRingExtent(rings: readonly (readonly Point[])[]): number {
  let largest = 0;
  for (const ring of rings) {
    if (ring.length === 0) continue;
    const [minX, minY, maxX, maxY] = boundsOfRing(ring);
    const extent = Math.max(maxX - minX, maxY - minY);
    if (extent > largest) largest = extent;
  }
  return largest;
}

function signedArea(ring: readonly Point[]): number {
  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[(i + 1) % ring.length]!;
    total += ax * by - bx * ay;
  }
  return total / 2;
}

/**
 * Area-weighted centroid of the largest ring.
 *
 * Deliberately not the whole feature's centroid: averaging across parts pulls
 * Andaman & Nicobar's label out to sea between its islands, and Gujarat's off
 * its own coast.
 */
export function labelPointFor(rings: readonly (readonly Point[])[], fallback: Point): Point {
  let largest: readonly Point[] | null = null;
  let largestArea = 0;
  for (const ring of rings) {
    if (ring.length < 3) continue;
    const area = Math.abs(signedArea(ring));
    if (area > largestArea) {
      largestArea = area;
      largest = ring;
    }
  }
  if (!largest || largestArea === 0) return fallback;

  const area = signedArea(largest);
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < largest.length; i++) {
    const [ax, ay] = largest[i]!;
    const [bx, by] = largest[(i + 1) % largest.length]!;
    const cross = ax * by - bx * ay;
    cx += (ax + bx) * cross;
    cy += (ay + by) * cross;
  }
  const centroid: Point = [cx / (6 * area), cy / (6 * area)];
  return Number.isFinite(centroid[0]) && Number.isFinite(centroid[1]) ? centroid : fallback;
}

/** Distance from a point to the nearest edge of a box; zero when inside it. */
export function distanceToBox(point: Point, box: Box): number {
  const [x, y] = point;
  const [minX, minY, maxX, maxY] = box;
  const dx = Math.max(minX - x, 0) + Math.max(x - maxX, 0);
  const dy = Math.max(minY - y, 0) + Math.max(y - maxY, 0);
  return Math.hypot(dx, dy);
}

/** Distance to the nearest of a region's parts. */
export function distanceToParts(point: Point, parts: readonly Box[]): number {
  let nearest = Infinity;
  for (const part of parts) {
    const distance = distanceToBox(point, part);
    if (distance < nearest) nearest = distance;
  }
  return nearest;
}

/**
 * Angles to try when placing a small region's label, as turns from the
 * away-from-centre direction: straight out first, then progressively to either
 * side, and back inward only as a last resort.
 *
 * One fixed direction is not enough. Puducherry sits south-east of the map's
 * middle, so the radial direction runs inland into Tamil Nadu while its open
 * water is due east.
 */
const LABEL_SEARCH_TURNS = [
  0,
  Math.PI / 6, -Math.PI / 6,
  Math.PI / 3, -Math.PI / 3,
  Math.PI / 2, -Math.PI / 2,
  (2 * Math.PI) / 3, -(2 * Math.PI) / 3,
  (5 * Math.PI) / 6, -(5 * Math.PI) / 6,
  Math.PI,
] as const;

export interface OutsideLabelOptions {
  /** Where the region is, in view-box units. */
  anchor: Point;
  /** How far the label must clear the region itself. */
  clearance: number;
  /** Half the label's width and height, used to keep it inside the view box. */
  halfSize: Point;
  /** The view box the label must stay within, as `[width, height]`. */
  viewBox: Point;
  /** Direction is measured away from this point — normally the view box's middle. */
  centre: Point;
  /** Returns true when a label centred here would cover another region. */
  isBlocked: (candidate: Point) => boolean;
}

/**
 * Find a clear spot beside a region for its value label, or null when the
 * region is hemmed in on every side (Delhi, ringed by other states) and the
 * label is better left where it was.
 */
export function placeOutsideLabel(options: OutsideLabelOptions): Point | null {
  const { anchor, clearance, halfSize, viewBox, centre, isBlocked } = options;
  const dx = anchor[0] - centre[0];
  const dy = anchor[1] - centre[1];
  const base = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);

  for (const turn of LABEL_SEARCH_TURNS) {
    const angle = base + turn;
    const candidate: Point = [
      clamp(anchor[0] + Math.cos(angle) * clearance, halfSize[0], viewBox[0] - halfSize[0]),
      clamp(anchor[1] + Math.sin(angle) * clearance, halfSize[1], viewBox[1] - halfSize[1]),
    ];
    if (!isBlocked(candidate)) return candidate;
  }
  return null;
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.min(Math.max(value, lower), upper);
}

/**
 * Grow a feature whose whole geometry is too small to see, about each part's
 * own centre.
 *
 * Two guards make this safe, and both were learned the hard way:
 *
 * 1. It applies only when the feature's *largest* part is under [minExtent] —
 *    that is, the whole region is tiny. West Bengal is a large state whose
 *    Sundarbans delta is fourteen small islets; enlarging those individually
 *    blew them up into an overlapping mess across the river mouth. A region is
 *    either small enough to need help or it is not.
 * 2. One factor for the whole feature, both axes, derived from its largest
 *    part. Scaling each part up to the threshold on its own made every island
 *    in Andaman & Nicobar exactly the same size, and scaling axes separately
 *    turned coastlines into caricatures. Both read as obviously fake; a single
 *    factor keeps the group's shapes and relative sizes intact.
 *
 * Growth is capped by [maxScale] so a speck never reads as a real landmass.
 */
export function enlargeSmallParts(
  rings: readonly (readonly Point[])[],
  minExtent: number,
  maxScale = 8,
): Point[][] {
  const unchanged = () => rings.map((ring) => [...ring]);
  if (minExtent <= 0) return unchanged();
  // Only a feature that is small *as a whole* qualifies.
  const largest = largestRingExtent(rings);
  if (largest <= 0 || largest >= minExtent) return unchanged();

  const scale = Math.min(minExtent / largest, maxScale);
  return rings.map((ring) => {
    const [minX, minY, maxX, maxY] = boundsOfRing(ring);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return ring.map(([x, y]) => [cx + (x - cx) * scale, cy + (y - cy) * scale] as Point);
  });
}

/**
 * Convex hull of a set of points, as one closed ring (Andrew's monotone chain).
 * Returns the input when there is nothing to wrap — fewer than three distinct
 * points, or all of them collinear.
 */
export function convexHull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const unique: Point[] = [];
  for (const point of sorted) {
    const prior = unique.at(-1);
    if (!prior || prior[0] !== point[0] || prior[1] !== point[1]) unique.push(point);
  }
  if (unique.length < 3) return unique.map((point) => [...point] as Point);

  const turn = (o: Point, a: Point, b: Point) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (ordered: readonly Point[]) => {
    const chain: Point[] = [];
    for (const point of ordered) {
      while (chain.length >= 2 && turn(chain[chain.length - 2]!, chain[chain.length - 1]!, point) <= 0) chain.pop();
      chain.push(point);
    }
    return chain;
  };

  const lower = half(unique);
  const upper = half([...unique].reverse());
  // Each chain repeats the other's first point, so drop both endpoints once.
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return hull.length >= 3 ? hull : unique.map((point) => [...point] as Point);
}

/**
 * One continuous hit area for a region scattered across separate parts: the
 * convex hull of everything it is drawn as.
 *
 * Lakshadweep is twenty specks in open sea. Even exaggerated they are a poor
 * pointer target, and the water they enclose is how the group reads on the map,
 * so treating that water as part of the region is what a reader expects. The
 * hull is safe to be generous with only because every renderer tests it *after*
 * every real outline has missed, so it can never take a hover from a neighbour
 * it happens to span.
 *
 * Null when the region needs no help: a single part, or already big enough to
 * point at directly ([maxExtent], the same "too small to use" threshold the
 * click buffer and value labels work from).
 */
export function scatteredHitArea(
  rings: readonly (readonly Point[])[],
  maxExtent: number,
): Point[] | null {
  if (rings.length < 2 || maxExtent <= 0) return null;
  const extent = largestRingExtent(rings);
  if (extent <= 0 || extent >= maxExtent) return null;
  const hull = convexHull(rings.flat());
  return hull.length >= 3 ? hull : null;
}

/** An SVG path string for a set of rings, used when exaggeration has moved them. */
export function ringsToPath(rings: readonly (readonly Point[])[]): string {
  let d = "";
  for (const ring of rings) {
    if (ring.length === 0) continue;
    d += `M${ring[0]![0]},${ring[0]![1]}`;
    for (let i = 1; i < ring.length; i++) d += `L${ring[i]![0]},${ring[i]![1]}`;
    d += "Z";
  }
  return d;
}
