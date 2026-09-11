import { PALETTES, PALETTE_OPTIONS, bandColors, maxThresholds, parseThresholds, rampFor } from './palettes';

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

  // Two bands sharing a colour breaks more than looks: the legend filter dims by
  // fill, so picking one band highlights every band painted the same shade.
  it('never repeats a colour, however many bands are asked for', () => {
    for (const count of [2, 5, 7, 11, 40]) {
      const colors = bandColors(ramp, count);
      expect(new Set(colors).size).toBe(colors.length);
    }
  });

  it('cannot return more bands than the ramp has steps', () => {
    expect(bandColors(ramp, ramp.length + 4)).toHaveLength(ramp.length);
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

describe('rampFor', () => {
  it('returns the named ramp', () => {
    expect(rampFor('blue')).toBe(PALETTES.blue);
  });

  // `PALETTES[name] ?? PALETTES.teal` looked equivalent and was not: every
  // object answers to these, so an unknown scheme in a dashboard's JSON
  // resolved to a function or Object.prototype and killed the panel.
  it.each(['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty'])(
    'falls back for the inherited property %s',
    (name) => {
      expect(rampFor(name)).toBe(PALETTES.teal);
      expect(maxThresholds(rampFor(name))).toBe(6);
    }
  );

  it('falls back for an unknown or empty name', () => {
    expect(rampFor('nonsense')).toBe(PALETTES.teal);
    expect(rampFor('')).toBe(PALETTES.teal);
  });
});
