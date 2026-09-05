/**
 * Static registry of the 36 current state/UT identities: id, display name, slug.
 *
 * This is *metadata only* — no coordinates, no boundary geometry. It exists so
 * `map.goa = 6` can be recognized, validated and warned about the instant the
 * script runs, before the (asynchronously fetched) boundary file has landed.
 * Boundary geometry itself still never ships inside this package.
 *
 * Kept in sync with `data/generated/current-2019-states/manifest.json`; ids are
 * LGD-derived and match the `districts/{stateId}.topo.json` filenames.
 */
export interface StateIdentity {
  /** LGD-derived stable id, e.g. `in-cs-30-goa`. */
  id: string;
  /** Display name as it appears in the boundary data, e.g. `Jammu & Kashmir`. */
  name: string;
  /** Hyphenated slug as it appears in the boundary data, e.g. `jammu-and-kashmir`. */
  slug: string;
}

export const STATES: readonly StateIdentity[] = [
  { id: "in-cs-01-jammu-and-kashmir", name: "Jammu & Kashmir", slug: "jammu-and-kashmir" },
  { id: "in-cs-02-himachal-pradesh", name: "Himachal Pradesh", slug: "himachal-pradesh" },
  { id: "in-cs-03-punjab", name: "Punjab", slug: "punjab" },
  { id: "in-cs-04-chandigarh", name: "Chandigarh", slug: "chandigarh" },
  { id: "in-cs-05-uttarakhand", name: "Uttarakhand", slug: "uttarakhand" },
  { id: "in-cs-06-haryana", name: "Haryana", slug: "haryana" },
  { id: "in-cs-07-delhi", name: "Delhi", slug: "delhi" },
  { id: "in-cs-08-rajasthan", name: "Rajasthan", slug: "rajasthan" },
  { id: "in-cs-09-uttar-pradesh", name: "Uttar Pradesh", slug: "uttar-pradesh" },
  { id: "in-cs-10-bihar", name: "Bihar", slug: "bihar" },
  { id: "in-cs-11-sikkim", name: "Sikkim", slug: "sikkim" },
  { id: "in-cs-12-arunachal-pradesh", name: "Arunachal Pradesh", slug: "arunachal-pradesh" },
  { id: "in-cs-13-nagaland", name: "Nagaland", slug: "nagaland" },
  { id: "in-cs-14-manipur", name: "Manipur", slug: "manipur" },
  { id: "in-cs-15-mizoram", name: "Mizoram", slug: "mizoram" },
  { id: "in-cs-16-tripura", name: "Tripura", slug: "tripura" },
  { id: "in-cs-17-meghalaya", name: "Meghalaya", slug: "meghalaya" },
  { id: "in-cs-18-assam", name: "Assam", slug: "assam" },
  { id: "in-cs-19-west-bengal", name: "West Bengal", slug: "west-bengal" },
  { id: "in-cs-20-jharkhand", name: "Jharkhand", slug: "jharkhand" },
  { id: "in-cs-21-odisha", name: "Odisha", slug: "odisha" },
  { id: "in-cs-22-chhattisgarh", name: "Chhattisgarh", slug: "chhattisgarh" },
  { id: "in-cs-23-madhya-pradesh", name: "Madhya Pradesh", slug: "madhya-pradesh" },
  { id: "in-cs-24-gujarat", name: "Gujarat", slug: "gujarat" },
  { id: "in-cs-26-dadra-and-nagar-haveli-and-daman-and-diu", name: "Dadra and Nagar Haveli and Daman and Diu", slug: "dadra-and-nagar-haveli-and-daman-and-diu" },
  { id: "in-cs-27-maharashtra", name: "Maharashtra", slug: "maharashtra" },
  { id: "in-cs-28-andhra-pradesh", name: "Andhra Pradesh", slug: "andhra-pradesh" },
  { id: "in-cs-29-karnataka", name: "Karnataka", slug: "karnataka" },
  { id: "in-cs-30-goa", name: "Goa", slug: "goa" },
  { id: "in-cs-31-lakshadweep", name: "Lakshadweep", slug: "lakshadweep" },
  { id: "in-cs-32-kerala", name: "Kerala", slug: "kerala" },
  { id: "in-cs-33-tamil-nadu", name: "Tamil Nadu", slug: "tamil-nadu" },
  { id: "in-cs-34-puducherry", name: "Puducherry", slug: "puducherry" },
  { id: "in-cs-35-andaman-and-nicobar", name: "Andaman & Nicobar", slug: "andaman-and-nicobar" },
  { id: "in-cs-36-telangana", name: "Telangana", slug: "telangana" },
  { id: "in-cs-37-ladakh", name: "Ladakh", slug: "ladakh" },
];

/**
 * Former / colloquial / commonly-typed names, mapped to the canonical slug.
 * `map.orissa = 4` should not be a silent typo for someone who learned the
 * older name — it should just work.
 */
const ALIASES: Readonly<Record<string, string>> = {
  orissa: "odisha",
  pondicherry: "puducherry",
  uttaranchal: "uttarakhand",
  "nct-of-delhi": "delhi",
  "new-delhi": "delhi",
  "delhi-nct": "delhi",
  "jammu-kashmir": "jammu-and-kashmir",
  "j-and-k": "jammu-and-kashmir",
  jk: "jammu-and-kashmir",
  "andaman-nicobar": "andaman-and-nicobar",
  "andaman-and-nicobar-islands": "andaman-and-nicobar",
  "dadra-and-nagar-haveli": "dadra-and-nagar-haveli-and-daman-and-diu",
  "daman-and-diu": "dadra-and-nagar-haveli-and-daman-and-diu",
  dnhdd: "dadra-and-nagar-haveli-and-daman-and-diu",
  "nagar-haveli": "dadra-and-nagar-haveli-and-daman-and-diu",
};

/**
 * Canonical key for any user-supplied spelling: lowercase, `&` → `and`, every
 * run of non-alphanumerics → a single `-`. So `Tamil Nadu`, `tamil_nadu`,
 * `TAMIL-NADU` and `tamil nadu` all collapse to `tamil-nadu`.
 */
export function normalizeStateKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Separator-free form, so `tamilnadu` / `uttarpradesh` / `westbengal` also resolve. */
function compact(key: string): string {
  return key.replace(/-/g, "");
}

const BY_KEY = new Map<string, StateIdentity>();
const BY_COMPACT = new Map<string, StateIdentity>();

for (const state of STATES) {
  for (const key of [state.slug, normalizeStateKey(state.name), state.id]) {
    if (!BY_KEY.has(key)) BY_KEY.set(key, state);
    const compacted = compact(key);
    if (!BY_COMPACT.has(compacted)) BY_COMPACT.set(compacted, state);
  }
}
for (const [alias, slug] of Object.entries(ALIASES)) {
  const state = BY_KEY.get(slug);
  if (!state) continue; // unreachable while ALIASES stays in sync with STATES
  if (!BY_KEY.has(alias)) BY_KEY.set(alias, state);
  const compacted = compact(alias);
  if (!BY_COMPACT.has(compacted)) BY_COMPACT.set(compacted, state);
}

/**
 * Resolve any spelling of a state/UT — display name, slug, LGD id, underscore
 * form, alias, or separator-free form — to its canonical identity.
 * Returns `undefined` for anything unrecognized, which callers treat as a typo.
 */
export function resolveState(input: string): StateIdentity | undefined {
  const key = normalizeStateKey(input);
  return BY_KEY.get(key) ?? BY_COMPACT.get(compact(key));
}
