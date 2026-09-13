import { collectByName, matchNames, normalizeName, parseAliases } from './names';

describe('normalizeName', () => {
  it('ignores case, punctuation and spacing', () => {
    expect(normalizeName('Pune City')).toBe(normalizeName('pune-city'));
    expect(normalizeName('  Khed  ')).toBe('khed');
  });

  it('spells out an ampersand, as the package does', () => {
    expect(normalizeName('Andaman & Nicobar')).toBe(normalizeName('Andaman and Nicobar'));
  });
});

describe('parseAliases', () => {
  it('reads one rename per line', () => {
    const aliases = parseAliases('Bangalore = Bengaluru Urban\nGurgaon = Gurugram');
    expect(aliases.get('bangalore')).toBe('Bengaluru Urban');
    expect(aliases.get('gurgaon')).toBe('Gurugram');
  });

  it('is as forgiving about the left-hand spelling as matching is', () => {
    expect(parseAliases('  bANGALORE  =  Bengaluru Urban ').get('bangalore')).toBe('Bengaluru Urban');
  });

  it('skips comments, blanks and half-written lines', () => {
    const aliases = parseAliases('# a comment\n\nBangalore = Bengaluru Urban\nnonsense\nEmpty =');
    expect([...aliases.keys()]).toEqual(['bangalore']);
  });
});

describe('matchNames', () => {
  const regions = ['Pune', 'Bengaluru Urban', 'Chhatrapati Sambhajinagar'];

  it('matches on spelling differences the normalizer covers', () => {
    const { valueFor } = matchNames({ 'pune ': 10, 'BENGALURU URBAN': 20 }, regions);
    expect(valueFor('Pune')).toBe(10);
    expect(valueFor('Bengaluru Urban')).toBe(20);
  });

  it('reports names no region answered to', () => {
    const { unmatched, valueFor } = matchNames({ Pune: 10, Bangalore: 20 }, regions);
    expect(unmatched).toEqual(['Bangalore']);
    expect(valueFor('Bengaluru Urban')).toBeNull();
  });

  // The point of the feature: a rename is stated, never guessed.
  it('follows an explicit alias', () => {
    const aliases = parseAliases('Bangalore = Bengaluru Urban');
    const { unmatched, valueFor } = matchNames({ Bangalore: 20 }, regions, aliases);
    expect(valueFor('Bengaluru Urban')).toBe(20);
    expect(unmatched).toEqual([]);
  });

  it('never invents a match for a merely similar name', () => {
    const { valueFor, unmatched } = matchNames({ Bangalor: 20 }, regions);
    expect(valueFor('Bengaluru Urban')).toBeNull();
    expect(unmatched).toEqual(['Bangalor']);
  });

  it('has no value for a region the query never mentioned', () => {
    const { valueFor } = matchNames({ Pune: 10 }, regions);
    expect(valueFor('Chhatrapati Sambhajinagar')).toBeNull();
  });

  it('reports nothing when every name is claimed', () => {
    expect(matchNames({ Pune: 1, 'Bengaluru Urban': 2 }, regions).unmatched).toEqual([]);
  });
});

describe('collectByName', () => {
  const canonical = (n: string) => normalizeName(n);

  it('finds an exact key', () => {
    expect(collectByName({ Pune: { Mulshi: 4 } }, 'Pune', canonical)).toEqual({ Mulshi: 4 });
  });

  it('finds a key that differs only in spelling', () => {
    expect(collectByName({ 'pune city': { Mulshi: 1 } }, 'Pune City', canonical)).toEqual({ Mulshi: 1 });
  });

  // The bug this exists for: the query wrote the state one way, the geometry
  // names it another, and the exact lookup silently returned nothing — which
  // switched off aliases and the unmatched notice for that level.
  it('follows a caller-supplied notion of sameness', () => {
    const registry: Record<string, string> = { orissa: 'odisha', odisha: 'odisha' };
    const viaRegistry = (n: string) => registry[normalizeName(n)] ?? normalizeName(n);
    expect(collectByName({ Orissa: { Cuttack: 7 } }, 'Odisha', viaRegistry)).toEqual({ Cuttack: 7 });
  });

  it('returns undefined rather than guessing at a near miss', () => {
    expect(collectByName({ Pune: { Mulshi: 1 } }, 'Puna', canonical)).toBeUndefined();
  });

  // Returning only the first spelling dropped the other's districts with no
  // notice anywhere — wrong data under the right name.
  it('merges every spelling of the same place', () => {
    const registry: Record<string, string> = { orissa: 'odisha', odisha: 'odisha' };
    const viaRegistry = (n: string) => registry[normalizeName(n)] ?? normalizeName(n);
    expect(collectByName({ Orissa: { Khordha: 1 }, 'Odisha ': { Cuttack: 2 } }, 'Odisha', viaRegistry)).toEqual({
      Khordha: 1,
      Cuttack: 2,
    });
  });

  // matchNames tries the separator-free form, so this must too, or a name
  // matches at one level and vanishes at the one below.
  it('matches the separator-free form, as matchNames does', () => {
    expect(collectByName({ punecity: { Haveli: 3 } }, 'Pune City', canonical)).toEqual({ Haveli: 3 });
  });

  it('does not mistake an inherited property for data', () => {
    expect(collectByName({}, 'constructor', canonical)).toBeUndefined();
    expect(collectByName({}, 'toString', canonical)).toBeUndefined();
  });
});

// splitRows keeps such a row; the merge used to drop it one step later, because
// Object.assign onto a plain {} hits the inherited __proto__ setter, which
// swallows a non-object value. It was not reported as unmatched either, so the
// Aliases escape hatch could not recover it.
describe('collectByName keeps query data off the prototype', () => {
  const canonical = (n: string) => normalizeName(n);

  it.each(['__proto__', 'constructor', 'toString'])('keeps a district named %s', (name) => {
    const values = { Rajasthan: Object.assign(Object.create(null), { [name]: 7, Ajmer: 1 }) };
    const found = collectByName(values, 'Rajasthan', canonical);
    expect(found?.[name]).toBe(7);
    expect(found?.Ajmer).toBe(1);
    expect(({} as Record<string, unknown>)[name === '__proto__' ? 'nothing' : name]).not.toBe(7);
  });

  it('reports such a district as unmatched when no region answers to it', () => {
    const values = { Rajasthan: Object.assign(Object.create(null), { ['__proto__']: 7 }) };
    const found = collectByName<number>(values, 'Rajasthan', canonical) ?? {};
    expect(matchNames(found, ['Ajmer']).unmatched).toEqual(['__proto__']);
  });

  it('lets an alias rescue it, as the option promises', () => {
    const values = { Rajasthan: Object.assign(Object.create(null), { ['__proto__']: 7 }) };
    const found = collectByName<number>(values, 'Rajasthan', canonical) ?? {};
    const match = matchNames(found, ['Ajmer'], parseAliases('__proto__ = Ajmer'));
    expect(match.valueFor('Ajmer')).toBe(7);
    expect(match.unmatched).toEqual([]);
  });
});
