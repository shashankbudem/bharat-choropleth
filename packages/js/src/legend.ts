/**
 * The legend, as a filter.
 *
 * Every value on the map is painted from one of the ramp's colours. That makes
 * the legend a ready-made set of value bands, and picking a band is the
 * question a reader of a choropleth actually has: *which regions are the dark
 * ones?* These helpers answer it — which swatch a value belongs to, what each
 * swatch stands for, and how many regions land there.
 *
 * [swatchIndexOf] is the single definition of that mapping: the renderers pick
 * a region's fill with it too, so "highlight the regions painted in this
 * colour" is true by construction rather than by two formulas agreeing.
 *
 * Pure functions of values, so the DOM renderer and the React component share
 * one definition of the behaviour.
 */

/** One swatch: the colour, and what the map actually has in it. */
export interface LegendBucket {
  index: number;
  color: string;
  /**
   * Lowest and highest value that lands here, or null when nothing does.
   *
   * The band the ramp *nominally* covers is a half-step either side of the
   * swatch's own stop, which lands on numbers like "24.333 to 31" that appear
   * nowhere in the data. What a reader wants to know is what picking this
   * swatch will give them, so the range is measured from the regions in it.
   */
  from: number | null;
  to: number | null;
  /** How many regions land here. Zero means the swatch would filter to nothing. */
  matches: number;
}

/**
 * Which swatch a value is painted from, or null when there is nothing to paint
 * — no value, or no ramp to paint it with.
 *
 * A ramp of one colour, or data with no spread at all, collapses to the top
 * swatch: there is a single band and every value is in it.
 */
export function swatchIndexOf(value: number | null, min: number, max: number, count: number): number | null {
  if (value === null || count <= 0) return null;
  if (count === 1 || max === min) return count - 1;
  const index = Math.round(((value - min) / (max - min)) * (count - 1));
  return Math.min(Math.max(index, 0), count - 1);
}

/**
 * The ramp described swatch by swatch.
 *
 * With a function colour scale the renderers show the default ramp, because a
 * function has no swatches to show. The bands are still the honest reading of
 * "lower to higher"; the swatch colour just isn't any region's actual fill.
 */
export function legendBuckets(
  colors: readonly string[],
  values: readonly (number | null)[],
  min: number,
  max: number,
): LegendBucket[] {
  const count = colors.length;
  return colors.map((color, index) => {
    const members = values.filter((value): value is number => swatchIndexOf(value, min, max, count) === index);
    return {
      index,
      color,
      from: members.length ? Math.min(...members) : null,
      to: members.length ? Math.max(...members) : null,
      matches: members.length,
    };
  });
}

/**
 * What a swatch does, in words — the accessible name for its control, since the
 * colour itself carries the meaning and a screen reader cannot see it.
 */
export function legendBucketLabel(bucket: LegendBucket, formatValue: (value: number) => string): string {
  if (bucket.matches === 0 || bucket.from === null || bucket.to === null) return "No regions in this band";
  const range = bucket.from === bucket.to
    ? formatValue(bucket.from)
    : `${formatValue(bucket.from)} to ${formatValue(bucket.to)}`;
  return `Highlight ${bucket.matches} ${bucket.matches === 1 ? "region" : "regions"}, ${range}`;
}

