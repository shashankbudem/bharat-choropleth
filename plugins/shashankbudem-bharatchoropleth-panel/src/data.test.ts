import { bandIndexOf, splitRows, type RowKeys } from './data';

const keys: RowKeys = {
  regionKey: 'state',
  districtKey: 'district',
  subDistrictKey: 'subdistrict',
  valueKey: 'incidents',
};

const row = (state: string, district: string | null, subdistrict: string | null, incidents: unknown) => ({
  state,
  district,
  subdistrict,
  incidents,
});

describe('splitRows', () => {
  it('sorts each row to the level its name columns describe', () => {
    const { stateRows, districtValues, subDistrictValues } = splitRows(
      [
        row('Maharashtra', null, null, 412),
        row('Maharashtra', 'Pune', null, 37),
        row('Maharashtra', 'Pune', 'Mulshi', 4),
      ],
      keys
    );

    expect(stateRows).toHaveLength(1);
    expect(stateRows[0]).toMatchObject({ state: 'Maharashtra', incidents: 412 });
    expect(districtValues).toEqual({ Maharashtra: { Pune: 37 } });
    expect(subDistrictValues).toEqual({ Pune: { Mulshi: 4 } });
  });

  it('treats a blank or whitespace district as the state’s own row', () => {
    const { stateRows, districtValues } = splitRows(
      [row('Goa', '', null, 72), row('Kerala', '   ', null, 259)],
      keys
    );

    expect(stateRows).toHaveLength(2);
    expect(districtValues).toEqual({});
  });

  // Levels must be told apart by their columns, never by query order: reordering
  // A and B in the editor used to be enough to change what the map painted.
  it('does not depend on the order rows arrive in', () => {
    const forwards = splitRows([row('Rajasthan', null, null, 198), row('Rajasthan', 'Ajmer', null, 26)], keys);
    const backwards = splitRows([row('Rajasthan', 'Ajmer', null, 26), row('Rajasthan', null, null, 198)], keys);

    expect(backwards.districtValues).toEqual(forwards.districtValues);
    expect(backwards.stateRows).toEqual(forwards.stateRows);
  });

  it('skips rows whose value is not a finite number', () => {
    const { districtValues } = splitRows(
      [
        row('Bihar', 'Patna', null, null),
        row('Bihar', 'Gaya', null, 'twelve'),
        row('Bihar', 'Arrah', null, Number.NaN),
        row('Bihar', 'Buxar', null, 5),
      ],
      keys
    );

    expect(districtValues).toEqual({ Bihar: { Buxar: 5 } });
  });

  it('passes every row through untouched when no district field is configured', () => {
    const rows = [row('Delhi', 'ignored', null, 341)];
    const { stateRows, districtValues, subDistrictValues } = splitRows(rows, { ...keys, districtKey: '' });

    expect(stateRows).toEqual(rows);
    expect(districtValues).toBeUndefined();
    expect(subDistrictValues).toEqual({});
  });

  it('ignores sub-district names when no sub-district field is configured', () => {
    const { districtValues, subDistrictValues } = splitRows(
      [row('Maharashtra', 'Pune', 'Mulshi', 4)],
      { ...keys, subDistrictKey: '' }
    );

    expect(districtValues).toEqual({ Maharashtra: { Pune: 4 } });
    expect(subDistrictValues).toEqual({});
  });

  it('nests sub-districts under their district, not their state', () => {
    const { subDistrictValues } = splitRows(
      [row('Maharashtra', 'Pune', 'Khed', 16), row('Rajasthan', 'Ajmer', 'Khed', 3)],
      keys
    );

    // Same sub-district name in two states must not collide into one entry.
    expect(subDistrictValues).toEqual({ Pune: { Khed: 16 }, Ajmer: { Khed: 3 } });
  });
});

describe('bandIndexOf', () => {
  const bands = [25, 50, 100, 200];

  it('places a value below the first edge in the lowest band', () => {
    expect(bandIndexOf(0, bands)).toBe(0);
    expect(bandIndexOf(24.999, bands)).toBe(0);
  });

  it('treats an edge as the inclusive floor of the band above it', () => {
    expect(bandIndexOf(25, bands)).toBe(1);
    expect(bandIndexOf(50, bands)).toBe(2);
    expect(bandIndexOf(200, bands)).toBe(4);
  });

  it('places anything above the last edge in the top band', () => {
    expect(bandIndexOf(1e6, bands)).toBe(bands.length);
  });

  // The whole point of a fixed scale: the same number is the same band whatever
  // else is on screen. A relative scale would move this with its neighbours.
  it('gives one value the same band regardless of the data around it', () => {
    expect(bandIndexOf(10, bands)).toBe(bandIndexOf(10, bands));
    expect(bandIndexOf(10, bands)).toBe(0);
  });

  it('has no band for missing or non-finite readings', () => {
    expect(bandIndexOf(null, bands)).toBeNull();
    expect(bandIndexOf(Number.NaN, bands)).toBeNull();
    expect(bandIndexOf(Number.POSITIVE_INFINITY, bands)).toBeNull();
  });

  it('puts everything in one band when no edges are given', () => {
    expect(bandIndexOf(5, [])).toBe(0);
    expect(bandIndexOf(5000, [])).toBe(0);
  });

  it('never returns a band with no colour behind it', () => {
    for (const value of [-1, 0, 24, 25, 99, 100, 199, 200, 12345]) {
      const index = bandIndexOf(value, bands) as number;
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThanOrEqual(bands.length);
    }
  });
});
