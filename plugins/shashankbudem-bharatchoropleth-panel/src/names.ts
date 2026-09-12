/**
 * Matching query names to boundary names, below state level.
 *
 * State names go through the package's own registry, so `karnataka`, `Orissa`
 * and an LGD id all land correctly. Districts and sub-districts have no such
 * registry — there are 788 of them and they get renamed — so a query saying
 * `Bangalore` against geometry saying `Bengaluru Urban` simply misses.
 *
 * Two deliberate decisions here:
 *
 * Nothing is guessed. No fuzzy or edit-distance matching, because attributing
 * one district's incidents to another is worse than showing no data: a wrong
 * number on a map is believed, a blank one gets investigated. Renames are
 * supplied explicitly by whoever knows their own data.
 *
 * Misses are reported rather than swallowed. The package warns to the console,
 * which nobody reading a dashboard will ever see; these are handed back so the
 * panel can say so on screen.
 */

/** Same rule the package uses for its own keys, so both agree on what matches. */
export function normalizeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Separator-free form, so `punecity` also reaches `Pune City`. */
function compact(key: string): string {
  return key.replace(/-/g, '');
}

/**
 * User-supplied renames, one `from = to` per line. `#` starts a comment.
 *
 * Keyed on the normalized `from`, so the left-hand side is as forgiving about
 * spelling as everything else here.
 */
export function parseAliases(input: string): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const line of (input ?? '').split(/\r?\n/)) {
    const text = line.split('#')[0] as string;
    const at = text.indexOf('=');
    if (at === -1) {
      continue;
    }
    const from = text.slice(0, at).trim();
    const to = text.slice(at + 1).trim();
    if (from && to) {
      aliases.set(normalizeName(from), to);
    }
  }
  return aliases;
}

export interface NameMatch {
  /** Query names, normalized, that no region answered to. */
  unmatched: string[];
  /** Look a region's own name up in the query values. */
  valueFor: (regionName: string) => number | null;
}

/**
 * Resolve one level's values against the names the geometry actually uses.
 *
 * A region is tried by its exact normalized name and by its separator-free form;
 * a query name is first put through the aliases. Whatever is left over — values
 * nobody claimed — comes back as `unmatched`.
 */
export function matchNames(
  values: Readonly<Record<string, number>>,
  regionNames: readonly string[],
  aliases: ReadonlyMap<string, string> = new Map()
): NameMatch {
  const byKey = new Map<string, number>();
  const claimed = new Set<string>();
  const originalOf = new Map<string, string>();

  for (const [name, value] of Object.entries(values)) {
    const normalized = normalizeName(name);
    const target = aliases.get(normalized) ?? name;
    const key = normalizeName(target);
    byKey.set(key, value);
    byKey.set(compact(key), value);
    originalOf.set(key, name);
  }

  const keysFor = (regionName: string) => {
    const key = normalizeName(regionName);
    return [key, compact(key)];
  };

  for (const regionName of regionNames) {
    for (const key of keysFor(regionName)) {
      if (byKey.has(key)) {
        claimed.add(key);
        claimed.add(compact(key));
      }
    }
  }

  const unmatched = [...originalOf.entries()]
    .filter(([key]) => !claimed.has(key))
    .map(([, original]) => original)
    .sort();

  return {
    unmatched,
    valueFor: (regionName) => {
      for (const key of keysFor(regionName)) {
        if (byKey.has(key)) {
          return byKey.get(key) ?? null;
        }
      }
      return null;
    },
  };
}

/**
 * Gather every entry whose key names the same place as `wanted`.
 *
 * The values map is keyed by whatever the query wrote; the caller asks using the
 * name the *geometry* uses. Those differ constantly — `Orissa` against `Odisha`,
 * `pune-city` against `Pune City` — and an exact lookup quietly returned nothing,
 * which switched off aliases and the unmatched notice for that whole level.
 *
 * Every match is merged rather than the first one winning. A query can spell one
 * state two ways across its rows, and returning only the first spelling's
 * districts dropped the rest with no notice anywhere — wrong data under the
 * right name, which is the one outcome this file exists to prevent.
 *
 * Keys are compared by `canonicalOf` and by its separator-free form, the same
 * pair `matchNames` tries. Without the second, a level could match a name that
 * the level above had refused to find.
 *
 * `canonicalOf` decides what "same place" means: the state registry one level up,
 * plain normalization below it, where no registry exists.
 */
export function collectByName<T>(
  values: Readonly<Record<string, Readonly<Record<string, T>>>>,
  wanted: string,
  canonicalOf: (name: string) => string
): Record<string, T> | undefined {
  const target = canonicalOf(wanted);
  const wantedForms = new Set([target, compact(target)]);
  // ponytail: a child key present under two spellings of the parent resolves to
  // whichever row the query returned last, silently. Deterministic for a fixed
  // row order, but a query with no ORDER BY can flip it. Reporting the clash
  // needs a second channel out of here — worth it if anyone hits it.
  let found: Record<string, T> | undefined;
  // Own properties only — `values.constructor` is a function, not a district.
  for (const [key, value] of Object.entries(values)) {
    const canonical = canonicalOf(key);
    if (wantedForms.has(canonical) || wantedForms.has(compact(canonical))) {
      // The target is prototype-free for the same reason splitRows' maps are:
      // these keys are query data. A plain {} here put the chain back one step
      // later — a district named `__proto__` hit the inherited setter, its value
      // vanished, and it was not even reported as unmatched, so the documented
      // alias escape hatch could not recover it.
      found = Object.assign(found ?? (Object.create(null) as Record<string, T>), value);
    }
  }
  return found;
}
