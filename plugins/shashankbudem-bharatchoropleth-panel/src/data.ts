/**
 * The panel's pure data logic, kept out of the component so it can be tested
 * without a browser. Both functions here have already shipped a bug: the level
 * split silently dropped sub-district rows before it existed, and the band
 * lookup is what makes a fixed scale mean the same thing at every level.
 */

export interface RowKeys {
  regionKey: string;
  districtKey: string;
  subDistrictKey: string;
  valueKey: string;
}

export type ValuesByParent = Record<string, Record<string, number>>;

export interface SplitRows {
  /** Rows that name a state and no deeper region — the state's own value. */
  stateRows: Array<Record<string, unknown>>;
  /** District values, nested under the state they belong to. */
  districtValues: ValuesByParent | undefined;
  /** Sub-district values, nested under their district. */
  subDistrictValues: ValuesByParent;
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

/**
 * Sort one flat result into the three levels.
 *
 * Levels are told apart by which name columns a row fills in, never by which
 * query it arrived from — so state totals and districts can share a query or sit
 * in separate ones, in any order, and reordering queries in the editor changes
 * nothing.
 */
export function splitRows(rows: ReadonlyArray<Record<string, unknown>>, keys: RowKeys): SplitRows {
  const empty: ValuesByParent = {};
  if (!keys.districtKey) {
    return { stateRows: [...rows], districtValues: undefined, subDistrictValues: empty };
  }

  const stateRows: Array<Record<string, unknown>> = [];
  const districtValues: ValuesByParent = {};
  const subDistrictValues: ValuesByParent = {};

  for (const row of rows) {
    const state = text(row[keys.regionKey]);
    const district = text(row[keys.districtKey]);
    const sub = keys.subDistrictKey ? text(row[keys.subDistrictKey]) : '';

    if (!district) {
      stateRows.push(row);
      continue;
    }
    const value = row[keys.valueKey];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      continue;
    }
    if (sub) {
      (subDistrictValues[district] ??= {})[sub] = value;
    } else {
      (districtValues[state] ??= {})[district] = value;
    }
  }

  return { stateRows, districtValues, subDistrictValues };
}

/**
 * Which fixed band a reading falls in, or null when there is nothing to paint.
 *
 * Edges are inclusive lower bounds: with edges [25, 50], a value of exactly 25
 * is in band 1, not band 0. Bands are assumed ascending — `parseThresholds`
 * sorts them — so this never has to guess at the order.
 */
export function bandIndexOf(value: number | null, bands: readonly number[]): number | null {
  if (value === null || typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  let index = 0;
  while (index < bands.length && value >= (bands[index] as number)) {
    index += 1;
  }
  return index;
}
