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
