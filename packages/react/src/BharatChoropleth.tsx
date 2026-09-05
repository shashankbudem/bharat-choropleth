import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IndiaChoropleth } from "./IndiaChoropleth";
import { asFeatureCollection } from "./geometry";
import {
  DEFAULT_DATA_BASE_URL,
  isInlineGeometry,
  loadDistrictTopology,
  loadSubDistrictTopology,
  resolveGeometry,
  statesUrl,
  type GeometryInput,
} from "./data-source";
import { normalizeStateKey, resolveState } from "./states";
import type { GeometrySource, IndiaChoroplethProps, MapFeature, MapLayer, MapRegion } from "./types";

/** Reads a feature's stable id. Matches the framework-free facade's default. */
function defaultGetId(feature: MapFeature): string {
  return String(feature.properties?.id ?? feature.properties?.name);
}

/** Reads a feature's display name. Matches the framework-free facade's default. */
function defaultGetLabel(feature: MapFeature): string {
  return String(feature.properties?.name ?? feature.properties?.id);
}

/**
 * Canonical storage key for a name. Known states/UTs collapse to their LGD id,
 * so `"Goa"`, `"goa"`, `"GOA"` and `"in-cs-30-goa"` are one entry; anything else
 * (custom geometry with its own labels) falls back to its normalized name.
 *
 * Identical to `BharatChoropleth#keyFor` in the framework-free package — both
 * read the same `states.ts`, which a test keeps byte-identical.
 */
function keyFor(name: string): string {
  return resolveState(name)?.id ?? normalizeStateKey(name);
}

/**
 * Finds a feature's value, trying the most literal match first.
 *
 * Each key the caller wrote maps to the canonical key it addresses, never to a
 * value, so the value map stays the single source of truth and a later write
 * through one spelling is seen through every other.
 *
 * Exact id, then exact label, then each resolved through the state registry.
 * Ordering matters both ways round: an id that the registry does not know still
 * matches when the caller keyed by that id, and a caller who keyed by "Orissa"
 * still reaches Odisha. `has` rather than `??` throughout, so a deliberate null
 * reads as "no data" instead of falling through to the next candidate.
 */
function lookUp(
  exactKeys: ReadonlyMap<string, string>,
  canonical: ReadonlyMap<string, number | null>,
  id: string,
  label: string,
): number | null {
  for (const candidate of [
    exactKeys.get(id),
    exactKeys.get(label),
    resolveState(id)?.id,
    resolveState(label)?.id,
    normalizeStateKey(id),
    normalizeStateKey(label),
  ]) {
    if (candidate !== undefined && canonical.has(candidate)) return canonical.get(candidate) ?? null;
  }
  return null;
}

/** A number, or null for "no data". Anything not finite (NaN, Infinity) reads as no data. */
function toValue(input: unknown): number | null {
  return typeof input === "number" && Number.isFinite(input) ? input : null;
}

export interface BharatChoroplethProps extends Omit<IndiaChoroplethProps, "states"> {
  /**
   * Per-state values, keyed by any spelling the state registry accepts: display
   * name, slug, LGD id, former name, or a separator-free form. `Goa`, `goa`,
   * `Tamil Nadu`, `tamilnadu`, `Jammu & Kashmir`, `Orissa` and
   * `in-cs-30-goa` all resolve. Names it does not recognize are ignored with a
   * console warning rather than throwing.
   *
   * States you omit render as "no data", exactly as an explicit `null` does.
   *
   * This is the primary API. When both `values` and `data` are given, `values`
   * wins and `data` is ignored — they are not merged.
   */
  values?: Readonly<Record<string, number | null>>;
  /**
   * The same values as a row array, for data that already arrives that way.
   * Read through `regionKey` and `valueKey`. Ignored when `values` is given.
   *
   * ```tsx
   * <BharatChoropleth
   *   data={[{ state: "Telangana", value: 82 }]}
   *   regionKey="state"
   *   valueKey="value"
   * />
   * ```
   */
  data?: readonly Readonly<Record<string, unknown>>[];
  /** Field on a `data` row holding the state name. Defaults to `"region"`. */
  regionKey?: string;
  /** Field on a `data` row holding the number. Defaults to `"value"`. Non-finite values read as "no data". */
  valueKey?: string;
  /**
   * Boundary data for the state/UT layer: inline GeoJSON/TopoJSON, a URL string
   * to fetch, or a promise of either. Omit to fetch the prepared current-vintage
   * state bundle from `dataBaseUrl`. The package itself bundles no geometry.
   */
  geometry?: GeometryInput;
  /**
   * District values, nested under the state each district belongs to.
   *
   * ```tsx
   * districtValues={{
   *   Telangana: { Hyderabad: 90, "Ranga Reddy": 76 },
   *   Maharashtra: { Aurangabad: 44 },
   * }}
   * ```
   *
   * The nesting is not decoration. District names repeat across states —
   * Aurangabad, Bilaspur and Hamirpur each name a district in two — and unlike
   * states there is no district registry to resolve a bare name against, so a
   * flat map could not say which one you meant. Under a state it is unambiguous.
   *
   * Outer keys resolve through the state registry, exactly like `values`, and are
   * checked immediately. Inner keys match a district's name, slug or id,
   * case-insensitively; they can only be checked once that state's districts have
   * been fetched, so a typo there is warned about when you first drill into it.
   *
   * Applies to whichever district layer is in use, including one from your own
   * `loadDistricts`: a district listed here takes this value, and any district not
   * listed keeps whatever the layer itself returned.
   *
   * There is no `subDistrictValues`. Three levels of nesting stops reading
   * clearly, and sub-district naming is far less settled than district naming —
   * set those through a custom `loadSubDistricts` instead.
   */
  districtValues?: Readonly<Record<string, Readonly<Record<string, number | null>>>>;
  /** Base URL for the prepared boundary bundles. Point it at your own copy of `data/generated` to self-host. */
  dataBaseUrl?: string;
  /**
   * Click-to-drill-down into districts. Defaults to `true` when the state layer
   * came from `dataBaseUrl` (district files live beside it), `false` when you
   * supplied your own `geometry` — pass `loadDistricts` yourself in that case.
   */
  districts?: boolean;
  /**
   * Click-to-drill-down from a district into its sub-districts (tehsils / taluks /
   * mandals / blocks). Defaults the same way `districts` does. Districts the
   * bundle has no sub-districts for stay leaves rather than erroring.
   */
  subDistricts?: boolean;
  /** Reads a feature's stable id. Defaults to `feature.properties.id`. Memoize a custom one — a new identity re-projects the map. */
  getId?: (feature: MapFeature) => string;
  /** Reads a feature's display name. Defaults to `feature.properties.name`. Memoize a custom one — a new identity re-projects the map. */
  getLabel?: (feature: MapFeature) => string;
  /** Called if boundary data fails to load. Without it the error is logged; either way the message is rendered in place of the map. */
  onError?: (error: Error) => void;
}

/**
 * The zero-config map: give it numbers keyed by state name, get a choropleth.
 *
 * ```tsx
 * import { BharatChoropleth } from "bharat-choropleth";
 * import "bharat-choropleth/style.css";
 *
 * <BharatChoropleth values={{ Telangana: 82, Karnataka: 74, Maharashtra: 91 }} />
 * ```
 *
 * Boundary data is fetched (never bundled), so the map shows a placeholder until
 * it lands. Drill-down into districts and sub-districts is on by default when
 * that default data source is in use.
 *
 * This is sugar over {@link IndiaChoropleth}, which remains the full renderer —
 * custom layers, controlled selection and drill-down, reference overlays, custom
 * tooltips. Every one of its props except `states` passes straight through, so
 * reaching for one is a prop, not a rewrite.
 */
export function BharatChoropleth({
  values,
  data,
  districtValues,
  regionKey = "region",
  valueKey = "value",
  geometry,
  dataBaseUrl = DEFAULT_DATA_BASE_URL,
  districts,
  subDistricts,
  getId = defaultGetId,
  getLabel = defaultGetLabel,
  onError,
  ...rest
}: BharatChoroplethProps) {
  // `values` wins outright when both are given; merging two sources of truth for
  // the same state would make precedence a guess at the call site.
  const entries: readonly (readonly [name: string, value: number | null])[] = useMemo(() => {
    if (values) return Object.entries(values).map(([name, value]) => [name, toValue(value)] as const);
    if (data) return data.map((row) => [String(row[regionKey] ?? ""), toValue(row[valueKey])] as const);
    return [];
  }, [data, regionKey, valueKey, values]);

  const { valueMap, exactKeys, writtenAs } = useMemo(() => {
    const valueMap = new Map<string, number | null>();
    /**
     * The caller's keys exactly as written, checked before the registry.
     *
     * Not every id belongs to the registry. The historical Census bundle in this
     * repository uses `in-hs-*` ids, which `resolveState` does not know, so a
     * feature keyed on its id would fall through to being keyed on its *label* —
     * and values written against ids would silently never match, leaving a fully
     * populated dataset rendering as "No data" everywhere. Keeping the literal
     * keys means id-keyed values work for any geometry, registry or not.
     */
    const exactKeys = new Map<string, string>();
    const writtenAs = new Map<string, string>();
    for (const [name, value] of entries) {
      const key = keyFor(name);
      valueMap.set(key, value);
      exactKeys.set(name, key);
      // Keep the caller's own spelling so a warning quotes what they typed.
      if (!writtenAs.has(key)) writtenAs.set(key, name);
    }
    return { valueMap, exactKeys, writtenAs };
  }, [entries]);

  /**
   * `{ Telangana: { Hyderabad: 90 } }` resolved to
   * `{ "in-cs-36-telangana" => { "hyderabad" => 90 } }`. The outer key goes
   * through the state registry so any spelling of the state works; the inner keys
   * are normalized the same way, which is what makes them match a district's
   * name, slug or id whatever case or separators the caller used.
   */
  const districtValueMap = useMemo(() => {
    const byState = new Map<string, Map<string, number | null>>();
    for (const [stateName, districts] of Object.entries(districtValues ?? {})) {
      const stateKey = keyFor(stateName);
      const inner = byState.get(stateKey) ?? new Map<string, number | null>();
      for (const [districtName, value] of Object.entries(districts ?? {})) {
        inner.set(normalizeStateKey(districtName), toValue(value));
      }
      byState.set(stateKey, inner);
    }
    return byState;
  }, [districtValues]);

  const districtSignature = useMemo(
    () =>
      JSON.stringify(
        [...districtValueMap]
          .map(([stateKey, inner]) => [stateKey, [...inner].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))] as const)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      ),
    [districtValueMap],
  );

  /**
   * Content hash of the resolved values. Callers write `values={{ Goa: 6 }}`
   * inline, so the object is new on every parent render; keying the layer on it
   * would re-project the whole national map each time. Keying on what the values
   * actually *are* means a re-render that changed nothing costs nothing.
   */
  const valueSignature = useMemo(
    () => JSON.stringify([...valueMap].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    [valueMap],
  );

  // Read by the drill-down loaders, which must keep a stable identity across
  // value changes: IndiaChoropleth re-runs its district effect when the loader
  // changes, so a loader rebuilt per value would refetch on every update.
  const valuesRef = useRef(valueMap);
  valuesRef.current = valueMap;
  const exactKeysRef = useRef(exactKeys);
  exactKeysRef.current = exactKeys;
  const districtValuesRef = useRef(districtValueMap);
  districtValuesRef.current = districtValueMap;

  const source: GeometryInput = geometry ?? statesUrl(dataBaseUrl);
  const inlineGeometry = isInlineGeometry(source) ? source : null;
  const [fetched, setFetched] = useState<GeometrySource | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (isInlineGeometry(source)) return; // already in hand — rendered without a placeholder
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let cancelled = false;
    setFetched(null);
    setError(null);
    resolveGeometry(source, "states", controller?.signal)
      .then((loaded) => {
        if (!cancelled) setFetched(loaded);
      })
      .catch((cause: unknown) => {
        if (cancelled || (cause instanceof Error && cause.name === "AbortError")) return;
        const failure = cause instanceof Error ? cause : new Error("BharatChoropleth: could not load boundary data.");
        setError(failure);
        if (onErrorRef.current) onErrorRef.current(failure);
        else console.error(failure);
      });
    return () => {
      cancelled = true;
      controller?.abort();
    };
    // A URL string compares by value, so the usual case re-runs only on a real change.
  }, [source]);

  const resolvedGeometry = inlineGeometry ?? fetched;

  const statesLayer = useMemo<MapLayer | null>(() => {
    if (!resolvedGeometry) return null;
    /**
     * A district can share its parent's name (Lakshadweep), so resolve a
     * feature through the state registry by id first and only then by label,
     * rather than matching a bare slug against an id-keyed map.
     */
    return {
      geometry: resolvedGeometry,
      getId,
      getLabel,
      // `valueMap` is captured deliberately: the memo is keyed on the signature
      // of exactly these values, so the captured map and the key always agree.
      getValue: (feature) => lookUp(exactKeys, valueMap, getId(feature), getLabel(feature)),
    };
    // `valueSignature` is the dependency that stands in for `valueMap`; see above.
  }, [exactKeys, getId, getLabel, resolvedGeometry, valueSignature]);

  /**
   * Unknown names cannot be judged until the boundary data has landed and named
   * the real label set, so the warning is deferred rather than guessed at — the
   * same order the framework-free facade warns in. Warning during render would
   * also fire twice under StrictMode.
   */
  const warned = useRef(new Set<string>());
  useEffect(() => {
    if (!resolvedGeometry || !statesLayer) return;
    const known = new Set(
      asFeatureCollection(resolvedGeometry).features.map(
        (feature) =>
          resolveState(getId(feature))?.id ?? resolveState(getLabel(feature))?.id ?? normalizeStateKey(getLabel(feature)),
      ),
    );
    for (const [key, value] of valuesRef.current) {
      if (value === null || known.has(key) || warned.current.has(key)) continue;
      warned.current.add(key);
      console.warn(
        `BharatChoropleth: "${writtenAs.get(key) ?? key}" is not a recognized state/UT — its value is ignored.`,
      );
    }
  }, [getId, getLabel, resolvedGeometry, statesLayer, valueSignature, writtenAs]);

  // Drill-down geometry is fetched once per id and held for the component's life.
  // IndiaChoropleth re-runs its district effect whenever the state layer changes
  // — which a value update does — so without this every value change refetched.
  interface DrillDownState {
    controller: AbortController | null;
    districts: Map<string, Promise<GeometrySource>>;
    subDistricts: Map<string, Promise<GeometrySource | null>>;
  }
  // Built lazily: `useRef(expr)` evaluates `expr` on every render and discards
  // it, and this component is built to re-render on every data tick.
  const drillDownRef = useRef<DrillDownState | null>(null);
  drillDownRef.current ??= {
    controller: typeof AbortController === "function" ? new AbortController() : null,
    districts: new Map(),
    subDistricts: new Map(),
  };
  const drillDown = drillDownRef.current;
  useEffect(() => () => drillDownRef.current?.controller?.abort(), []);

  /**
   * Overlays `districtValues` onto a district layer. A district named in the prop
   * takes that value; one that is not keeps whatever the layer returned, so a
   * caller's own `loadDistricts` still supplies everything they did not override.
   *
   * Warns once per state, after that state's districts have arrived — the only
   * point at which an unmatched name is known to be a typo rather than a district
   * that simply has not loaded yet.
   */
  const warnedDistricts = useRef(new Set<string>());
  const withDistrictValues = useCallback((layer: MapLayer, stateId: string): MapLayer => {
    const wanted = districtValuesRef.current.get(stateId);
    if (!wanted || wanted.size === 0) return layer;
    const keysFor = (feature: MapFeature) => [normalizeStateKey(layer.getId(feature)), normalizeStateKey(layer.getLabel(feature))];

    if (!warnedDistricts.current.has(stateId)) {
      warnedDistricts.current.add(stateId);
      const present = new Set(asFeatureCollection(layer.geometry).features.flatMap(keysFor));
      for (const [key, value] of wanted) {
        if (value !== null && !present.has(key)) {
          console.warn(`BharatChoropleth: "${key}" is not a district of this state — its value is ignored.`);
        }
      }
    }

    return {
      ...layer,
      getValue: (feature) => {
        for (const key of keysFor(feature)) {
          // `has` rather than `??`, so an explicit null reads as "no data"
          // instead of falling through to the layer's own value.
          if (wanted.has(key)) return wanted.get(key) ?? null;
        }
        return layer.getValue(feature);
      },
    };
  }, []);

  const usingDefaultData = geometry === undefined;
  const districtsEnabled = districts ?? usingDefaultData;
  const subDistrictsEnabled = subDistricts ?? usingDefaultData;

  const defaultDistrictLoader = useMemo(() => {
    if (!districtsEnabled) return undefined;
    return async (stateId: string): Promise<MapLayer> => {
      const cache = drillDown.districts;
      let pending = cache.get(stateId);
      if (!pending) {
        pending = loadDistrictTopology(dataBaseUrl, stateId, drillDown.controller?.signal);
        // A failed fetch must not be cached, or a retry can never succeed.
        pending.catch(() => cache.delete(stateId));
        cache.set(stateId, pending);
      }
      return withDistrictValues(
        {
          geometry: await pending,
          getId: defaultGetId,
          getLabel: defaultGetLabel,
          getValue: (feature) => lookUp(exactKeysRef.current, valuesRef.current, defaultGetId(feature), defaultGetLabel(feature)),
        },
        stateId,
      );
    };
    // `districtSignature` rebuilds the loader when district values change, which
    // is what makes the map repaint them: the renderer only re-derives a level
    // from a new layer object. The geometry behind it is cached, so this is a
    // repaint, not a refetch.
  }, [dataBaseUrl, districtSignature, districtsEnabled, withDistrictValues]);

  const defaultSubDistrictLoader = useMemo(() => {
    if (!subDistrictsEnabled) return undefined;
    return async (districtId: string): Promise<MapLayer | null> => {
      const cache = drillDown.subDistricts;
      let pending = cache.get(districtId);
      if (!pending) {
        pending = loadSubDistrictTopology(dataBaseUrl, districtId, drillDown.controller?.signal);
        pending.catch(() => cache.delete(districtId));
        cache.set(districtId, pending);
      }
      const geometry = await pending;
      // Null means the bundle holds no sub-districts for this district, which
      // leaves it a leaf rather than opening an empty level.
      if (!geometry) return null;
      return {
        geometry,
        getId: defaultGetId,
        getLabel: defaultGetLabel,
        getValue: (feature) => lookUp(exactKeysRef.current, valuesRef.current, defaultGetId(feature), defaultGetLabel(feature)),
      };
    };
  }, [dataBaseUrl, subDistrictsEnabled]);

  const callerLoadDistricts = rest.loadDistricts;
  const districtLoader = useMemo(() => {
    if (!callerLoadDistricts) return defaultDistrictLoader;
    return async (stateId: string, state: MapRegion) =>
      withDistrictValues(await callerLoadDistricts(stateId, state), stateId);
  }, [callerLoadDistricts, defaultDistrictLoader, districtSignature, withDistrictValues]);

  if (error) {
    return (
      <div className="bharat-choropleth__status bharat-choropleth__status--error" role="alert">
        {error.message}
      </div>
    );
  }

  if (!statesLayer) {
    return (
      <div className="bharat-choropleth__status" role="status">
        Loading map…
      </div>
    );
  }

  return (
    <IndiaChoropleth
      {...rest}
      states={statesLayer}
      loadDistricts={districtLoader}
      loadSubDistricts={rest.loadSubDistricts ?? defaultSubDistrictLoader}
    />
  );
}
