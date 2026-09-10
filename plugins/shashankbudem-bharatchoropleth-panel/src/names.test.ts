import { matchNames, normalizeName, parseAliases } from './names';

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
