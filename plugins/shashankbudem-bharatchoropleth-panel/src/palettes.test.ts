import { PALETTES, PALETTE_OPTIONS, bandColors, parseThresholds } from './palettes';

describe('parseThresholds', () => {
  it('reads a comma separated list', () => {
    expect(parseThresholds('25, 50, 100, 200')).toEqual([25, 50, 100, 200]);
  });

  it('accepts spaces, decimals and negatives', () => {
    expect(parseThresholds('  -5 2.5   10 ')).toEqual([-5, 2.5, 10]);
  });

  // bandIndexOf walks the edges in order and never re-checks, so unsorted input
  // would silently mis-band everything above the first out-of-order edge.
  it('sorts ascending whatever order they were typed in', () => {
    expect(parseThresholds('200, 25, 100, 50')).toEqual([25, 50, 100, 200]);
  });

  it('drops duplicates, which would otherwise create an unreachable band', () => {
    expect(parseThresholds('10, 10, 20')).toEqual([10, 20]);
  });

  it('ignores anything that is not a number', () => {
    expect(parseThresholds('10, abc, 20, , NaN')).toEqual([10, 20]);
  });

  // An empty or unusable field must fall back to the relative scale, not paint
  // a blank map.
  it('returns nothing for empty or junk input', () => {
    expect(parseThresholds('')).toEqual([]);
    expect(parseThresholds('   ')).toEqual([]);
    expect(parseThresholds('abc')).toEqual([]);
  });
});

describe('bandColors', () => {
  const ramp = PALETTES.teal;

  it('gives one colour per band', () => {
    expect(bandColors(ramp, 5)).toHaveLength(5);
    expect(bandColors(ramp, 3)).toHaveLength(3);
  });

  // Walking the ramp from index 0 would leave the darkest steps unused whenever
  // there are fewer bands than steps, so the top band would never look hottest.
  it('spans the whole ramp, lightest band to darkest', () => {
    const colors = bandColors(ramp, 5);
    expect(colors[0]).toBe(ramp[0]);
    expect(colors[colors.length - 1]).toBe(ramp[ramp.length - 1]);
  });

  it('keeps every band a different shade when it can', () => {
    const colors = bandColors(ramp, 5);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('uses the darkest shade when there is only one band', () => {
    expect(bandColors(ramp, 1)).toEqual([ramp[ramp.length - 1]]);
  });

  it('still returns a colour for every band when bands outnumber ramp steps', () => {
    const colors = bandColors(ramp, ramp.length + 4);
    expect(colors).toHaveLength(ramp.length + 4);
    expect(colors.every((c) => typeof c === 'string' && c.startsWith('#'))).toBe(true);
  });
});

describe('PALETTES', () => {
  it('offers every ramp in the editor dropdown', () => {
    expect(PALETTE_OPTIONS.map((o) => o.value).sort()).toEqual(Object.keys(PALETTES).sort());
  });

  it('gives every ramp the same number of steps, so bands map alike', () => {
    const lengths = new Set(Object.values(PALETTES).map((r) => r.length));
    expect(lengths.size).toBe(1);
  });

  it('holds only hex colours', () => {
    for (const [name, ramp] of Object.entries(PALETTES)) {
      for (const step of ramp) {
        expect(`${name}:${step}`).toMatch(/^[a-z]+:#[0-9a-f]{6}$/);
      }
    }
  });
});
