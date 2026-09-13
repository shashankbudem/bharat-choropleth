import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanelProps, FieldType, getFieldDisplayName } from '@grafana/data';
import { PanelDataErrorView, config, getTemplateSrv, locationService } from '@grafana/runtime';
import { useTheme2 } from '@grafana/ui';
import { css, cx } from '@emotion/css';
import {
  BharatChoropleth,
  loadDistrictTopology,
  loadSubDistrictTopology,
  resolveState,
  type MapFeature,
  type GeometrySource,
  type MapLayer,
  type MapRegion,
} from 'bharat-choropleth';
import { BharatOptions } from '../types';
import { bandColors, maxThresholds, parseThresholds, rampFor } from '../palettes';
import { bandIndexOf, splitRows } from '../data';
import { collectByName, matchNames, normalizeName, parseAliases } from '../names';
import { asFeatureNames } from '../geometry';
import { SettledPromiseLru } from '../promiseLru';
import { vendorStyles } from '../vendorStyles';

interface Props extends PanelProps<BharatOptions> {}

/**
 * Map Grafana's theme onto the renderer's public custom properties.
 *
 * Declared on `.india-choropleth` itself, from a descendant selector, not on a
 * wrapping div. The package sets these variables on that element, and a
 * declaration on the element beats a value inherited from an ancestor — so the
 * whole theme silently did nothing and the map kept its light-theme defaults:
 * #081435 breadcrumb text on Grafana's #181b1f panel. `& .india-choropleth`
 * outranks the package's own single-class rule without depending on which
 * stylesheet the bundler injects last.
 *
 * The tooltip surface is set alongside the text colour deliberately. They are a
 * pair: `--india-map-text` colours the tooltip as well as the map, so a light
 * text colour with the default white card is invisible.
 */
function useThemeVars(borderColor: string, borderWidth: number, labelColor: string, labelSize: number) {
  const theme = useTheme2();
  return useMemo(
    () =>
      css([
        // The renderer's own stylesheet, nested rather than imported. Grafana
        // does not allow a plugin to import CSS: that injects a global
        // stylesheet, which would style every other panel on the dashboard too.
        // Nesting it here scopes every rule to this class, so the map is styled
        // and nothing outside it is touched.
        vendorStyles,
        {
          // A column, so anything rendered after the map (the fixed-band legend)
          // gets its own row instead of being pushed past the panel's clipped edge.
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          '& .india-choropleth': {
            flex: '1 1 auto',
            minHeight: 0,
            // Contain the map inside its own row.
            //
            // The package sizes the SVG `width: 100%; height: auto`, so in a wide
            // panel its aspect ratio makes it taller than the space it has, and the
            // overflow paints straight over anything below — which swallowed a band
            // edge on the legend. Giving the SVG both dimensions lets its viewBox
            // letterbox inside the box instead of bursting out of it.
            display: 'flex',
            flexDirection: 'column',
            '& .india-choropleth__canvas': { flex: '1 1 auto', minHeight: 0 },
            '& .india-choropleth__svg': { width: '100%', height: '100%' },
            // One lever for all three levels: states, districts and sub-districts
            // share a region class. `getColorByName` resolves a Grafana palette
            // name ("green", "dark-blue") as well as a plain hex.
            '--india-map-stroke': theme.visualization.getColorByName(borderColor),
            '--india-map-border-width': borderWidth,
            '--india-map-border-width-active': Math.max(1, borderWidth * 0.8),
            '--india-map-stroke-active': theme.colors.text.primary,
            // An empty setting follows the theme. The tooltip surface stays
            // theme-derived either way, so a light label colour can never end up on
            // a light card — the pairing that makes this variable easy to get wrong.
            '--india-map-text': labelColor ? theme.visualization.getColorByName(labelColor) : theme.colors.text.primary,
            '--india-map-muted': theme.colors.text.secondary,
            '--india-map-empty': theme.colors.background.secondary,
            '--india-map-line': theme.colors.border.weak,
            // Breadcrumb links and the focus ring. The link colour is tuned for
            // reading against the app background; primary.main is a button fill.
            '--india-map-focus': theme.colors.text.link,
            '--india-map-active': theme.colors.text.link,
            '--india-map-tooltip-bg': theme.colors.background.elevated ?? theme.colors.background.secondary,
            '--india-map-tooltip-border': theme.colors.border.medium,
            // The package haloes on-map values in fixed white so they read over dark
            // fills. That fights a light label colour, so track the panel instead.
            '& .india-choropleth__region-values': {
              stroke: theme.colors.background.primary,
              // One size at every level. The package's own rule drops the district
              // variant to 9px, and sub-districts reuse that class, so without the
              // second selector the deeper levels stay small whatever is set here.
              fontSize: `${labelSize}px`,
            },
            '& .india-choropleth__region-values--district': { fontSize: `${labelSize}px` },
            // Make the legend fit the panel.
            //
            // Its swatches are sized `clamp(1.75rem, 7vw, 4.25rem)`, and `vw` is the
            // browser window — not this panel. At any normal window width 7vw is
            // past the 4.25rem cap, so every swatch sits at its maximum and the row
            // is a fixed ~438px however narrow the panel is. In a dashboard that
            // overflows and wraps, eating map height. Sharing the row with flex
            // makes the swatches track the panel instead.
            '& .india-choropleth__legend': {
              flexWrap: 'nowrap',
              gap: theme.spacing(1),
              fontSize: theme.typography.bodySmall.fontSize,
            },
            '& .india-choropleth__swatches': { flex: '1 1 auto', minWidth: 0 },
            '& .india-choropleth__swatch': { width: 'auto', flex: '1 1 0', minWidth: '6px' },
          },
        },
      ]),
    [theme, borderColor, borderWidth, labelColor, labelSize]
  );
}

/** Swatches with their band edges printed between them. */
function useLegendStyles() {
  const theme = useTheme2();
  return useMemo(
    () =>
      css({
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing(0.5),
        marginTop: theme.spacing(0.5),
        fontSize: theme.typography.bodySmall.fontSize,
        color: theme.colors.text.secondary,
        '& button': {
          flex: '1 1 0',
          minWidth: 6,
          height: 10,
          padding: 0,
          border: 0,
          borderRadius: 2,
          cursor: 'pointer',
          // A 10px bar is a poor pointer target; transparent borders lift it to
          // 22px and the negative margin gives the row its height back.
          boxSizing: 'content-box',
          borderTop: '6px solid transparent',
          borderBottom: '6px solid transparent',
          backgroundClip: 'padding-box',
          margin: '-6px 0',
          '&:focus-visible': { outline: `2px solid ${theme.colors.primary.border}`, outlineOffset: 1 },
        },
        '& button[aria-pressed="true"]': { boxShadow: `0 0 0 2px ${theme.colors.text.primary}` },
        '& b': { fontWeight: 500, fontVariantNumeric: 'tabular-nums' },
      }),
    [theme]
  );
}

/** A quiet, non-blocking note that some values had nowhere to go. */
function useNoticeStyles() {
  const theme = useTheme2();
  return useMemo(
    () =>
      css({
        flex: 'none',
        marginTop: theme.spacing(0.5),
        padding: theme.spacing(0.25, 0.75),
        borderRadius: theme.shape.radius.default,
        background: theme.colors.warning.transparent,
        color: theme.colors.text.secondary,
        fontSize: theme.typography.bodySmall.fontSize,
        '& b': { color: theme.colors.text.primary, fontWeight: 500 },
      }),
    [theme]
  );
}

/** Keep the renderer's scale prop stable until a palette or band actually changes. */
function useColorScale(palette: string, bandKey: string, useBands: boolean) {
  return useMemo(() => {
    if (!useBands) {
      return rampFor(palette);
    }
    const bands = bandKey.split(',').map(Number);
    const fills = bandColors(rampFor(palette), bands.length + 1);
    return (value: number | null) => {
      if (value === null || !Number.isFinite(value)) {
        return 'var(--india-map-empty)';
      }
      const index = bandIndexOf(value, bands);
      return index === null ? 'var(--india-map-empty)' : (fills[index] as string);
    };
  }, [palette, bandKey, useBands]);
}

/**
 * The key a row is actually readable by.
 *
 * `DataFrameView` defines properties for `field.name` and the column index and
 * nothing else, while a field's *display* name can differ — a datasource can set
 * one (Prometheus `legendFormat`), labels produce one, and two columns sharing a
 * name get disambiguated into "incidents 2". Returning a display name here reads
 * `undefined` out of every row and paints an all-"No data" map with no error to
 * explain it, because the key is still a non-empty string.
 *
 * So: accept either spelling from the option, always return `field.name`.
 */
function pickField(frames: Props['data']['series'], wanted: string, type: FieldType): string {
  for (const frame of frames) {
    for (const field of frame.fields) {
      if (field.name === wanted || getFieldDisplayName(field, frame) === wanted) {
        return getFieldDisplayName(field, frame);
      }
    }
  }
  if (wanted) {
    return wanted;
  }
  for (const frame of frames) {
    const field = frame.fields.find((f) => f.type === type);
    if (field) {
      return getFieldDisplayName(field, frame);
    }
  }
  return '';
}

/**
 * A frame as row objects, addressable by display name *and* by field name.
 *
 * `DataFrameView` keys rows on `field.name` only, and keeps the first of any two
 * fields sharing one. That made a labelled field unreadable (Prometheus names a
 * value field `Value` but displays it as its label, so every lookup missed), and
 * made a duplicated column silently resolve to its neighbour's numbers. Display
 * names are unique within a frame — Grafana disambiguates them as `incidents 1`
 * and `incidents 2` — so they can address what `field.name` cannot.
 *
 * A bare field name still resolves, first-wins, matching what `DataFrameView` did
 * for the unambiguous case.
 */
function frameRows(frame: Props['data']['series'][number]): Array<Record<string, unknown>> {
  const columns = frame.fields.map((field) => ({
    field,
    display: getFieldDisplayName(field, frame),
  }));
  const rows: Array<Record<string, unknown>> = [];
  for (let index = 0; index < frame.length; index += 1) {
    const row: Record<string, unknown> = {};
    for (const { field, display } of columns) {
      const value = field.values[index];
      row[display] = value;
      if (!(field.name in row)) {
        row[field.name] = value;
      }
    }
    rows.push(row);
  }
  return rows;
}

export const BharatPanel: React.FC<Props> = ({ options, data, fieldConfig, id }) => {
  const themeClass = useThemeVars(options.borderColor, options.borderWidth, options.labelColor, options.labelSize);
  const legendClass = useLegendStyles();
  const noticeClass = useNoticeStyles();
  const frames = data.series;

  const regionKey = pickField(frames, options.regionField, FieldType.string);
  const valueKey = pickField(frames, options.valueField, FieldType.number);
  const districtKey = options.districtField;
  const subDistrictKey = options.subDistrictField;

  /**
   * Field options that name a column the query does not return.
   *
   * Region and value go through `pickField`, which falls back to the first field
   * of the right type, so a stale name there paints an empty map — visibly wrong.
   * The two hierarchy fields are read straight off the options, and a stale name
   * there is read out of every row as `undefined`, which `splitRows` cannot tell
   * from "this row names no district". Every row then becomes a state row and the
   * last one wins, so a state silently shows one of its districts' numbers
   * instead of its own total. A believed wrong number is the worst thing this
   * panel can do, so it says so and shows nothing rather than guessing.
   */
  const columnNames = useMemo(() => {
    const names = new Set<string>();
    for (const frame of frames) {
      for (const field of frame.fields) {
        names.add(field.name);
        names.add(getFieldDisplayName(field, frame));
      }
    }
    return names;
  }, [frames]);

  const missingFields = useMemo(() => {
    // Nothing to compare against. A query that failed, or returned before its
    // schema was known, carries no columns at all — and every configured field
    // then looks missing, so the panel blamed the field mapping for what is
    // really an absence of data. Let it fall through to "No data" instead: that
    // sends the reader to the query, which is where the problem is.
    if (columnNames.size === 0) {
      return [];
    }
    return (
      [
        ['Region field', options.regionField],
        ['District field', options.districtField],
        ['Sub-district field', options.subDistrictField],
        ['Value field', options.valueField],
      ] as const
    )
      .filter(([, name]) => name && !columnNames.has(name))
      .map(([label, name]) => `${label} \u201c${name}\u201d`);
  }, [columnNames, options.regionField, options.districtField, options.subDistrictField, options.valueField]);

  /**
   * Every frame's rows, flattened.
   *
   * Levels are told apart by the district column, never by which query they came
   * from — so a dashboard can put state totals in query A and districts in query
   * B (filtered by the drill-down variable), in either order, and the panel does
   * not care. Keying off frame index would break the moment someone reorders
   * their queries.
   */
  const rows = useMemo(() => frames.flatMap(frameRows), [frames]);

  /**
   * Split one flat result into the two levels the renderer wants.
   *
   * A row with a district name is a district value, nested under its state; a
   * row without one is the state's own. Keeping both in a single query means a
   * dashboard author writes one SQL statement with a GROUP BY, rather than
   * maintaining two queries whose region spellings have to agree.
   */
  const { stateRows, districtValues, subDistrictValues } = useMemo(
    () => splitRows(rows, { regionKey, districtKey, subDistrictKey, valueKey }),
    [rows, regionKey, districtKey, subDistrictKey, valueKey]
  );

  /**
   * Publish the drilled state as a dashboard variable.
   *
   * Bound to the drill-down itself, not to clicks. A click handler fires at every
   * level, so drilling into a district wrote its name into the variable and a
   * query filtering `WHERE state = '$state'` then matched nothing. It also never
   * fired on the way back, so returning to the national map left the variable
   * pointing at a state nobody was looking at any more.
   *
   * This callback carries `null` when the map returns to the national view, so
   * the variable tracks the visible scope in both directions.
   */
  /**
   * The variable drives the map, not just the other way round.
   *
   * Grafana keeps dashboard state in the URL, so a refresh or a shared link
   * arrives with `var-state` already set. Left uncontrolled the map opened at the
   * national view while the variable still named a state — the map and the rest
   * of the dashboard disagreeing about what you were looking at. Reading it back
   * makes the URL the single source of truth, so a refresh lands where you left
   * off and a pasted link opens on the same state.
   *
   * The variable holds a display name because that is what a SQL `WHERE` clause
   * wants; the renderer drills by id, so it goes through the same registry that
   * resolves whatever spelling a query happens to return.
   */
  /**
   * Follow the scope variable, whoever changed it.
   *
   * Read from the URL rather than through `replaceVariables`. Grafana hands that
   * function to the panel as a prop and only refreshes the props when the
   * panel's *data* changes — so on a dashboard whose queries don't reference the
   * variable, the panel keeps a stale interpolator that still answers with the
   * old value, and the map never leaves the national view. The URL is where
   * Grafana keeps the variable and is the one source that is never behind;
   * `getTemplateSrv` covers the case where a default has not been pushed to it
   * yet.
   */
  const [locationTick, setLocationTick] = useState(0);
  useEffect(() => {
    const subscription = locationService.getLocationObservable().subscribe(() => setLocationTick((tick) => tick + 1));
    return () => subscription.unsubscribe();
  }, []);

  const variableLabel = useMemo(() => {
    if (!options.drillDownVariable) {
      return '';
    }
    const fromUrl = locationService.getSearchObject()[`var-${options.drillDownVariable}`];
    const token = `$${options.drillDownVariable}`;
    const label = (
      fromUrl === undefined
        ? getTemplateSrv().replace(token)
        : String(Array.isArray(fromUrl) ? (fromUrl[0] ?? '') : fromUrl)
    ).trim();
    return !label || label === token ? '' : label;
    // locationTick is the subscription's re-read trigger, not an input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.drillDownVariable, locationTick]);

  const variableStateId = useMemo(
    () => (variableLabel ? (resolveState(variableLabel)?.id ?? null) : null),
    [variableLabel]
  );

  /**
   * A variable that names nothing.
   *
   * The dashboard then asserts one thing and the map shows another — the picker
   * reads "Atlantis" while the map sits at all-states — with nothing on screen
   * to connect the two. Silence here reads as "that state has no data", which is
   * a different and much more alarming claim than "that is not a state".
   */
  const unresolvedVariable = variableLabel && !variableStateId ? variableLabel : null;

  /**
   * Keep both drill levels controlled by the panel.
   *
   * The dashboard variable controls the state when configured; otherwise the
   * callback state below does. Tagging local state with that source invalidates
   * it synchronously when the option changes, without an effect/reset render.
   * A district is only valid under the exact state it was selected from, so an
   * external variable change also drops it synchronously before child effects
   * can start a cached load for the new state.
   */
  const [localLevel, setLocalLevel] = useState<{
    source: string;
    state: string | null;
    district: string | null;
  }>({ source: options.drillDownVariable, state: null, district: null });
  const currentLocalLevel =
    localLevel.source === options.drillDownVariable
      ? localLevel
      : { source: options.drillDownVariable, state: null, district: null };
  const shownStateId = options.drillDown
    ? options.drillDownVariable
      ? variableStateId
      : currentLocalLevel.state
    : null;
  const shownDistrictId =
    options.drillDown && currentLocalLevel.state === shownStateId ? currentLocalLevel.district : null;

  const publishState = useCallback(
    (stateId: string | null, state?: MapRegion) => {
      if (!options.drillDownVariable) {
        return;
      }
      // A partial update keeps the rest of the dashboard's state (time range,
      // other variables) intact, and pushes one history entry so Back works.
      locationService.partial(
        { [`var-${options.drillDownVariable}`]: stateId ? (state?.label ?? stateId) : '' },
        false
      );
    },
    [options.drillDownVariable]
  );

  const onStateChange = useCallback(
    (stateId: string | null, state?: MapRegion) => {
      setLocalLevel({ source: options.drillDownVariable, state: stateId, district: null });
      publishState(stateId, state);
    },
    [options.drillDownVariable, publishState]
  );

  const onSubDistrictChange = useCallback(
    (districtId: string | null) => {
      setLocalLevel({ source: options.drillDownVariable, state: shownStateId, district: districtId });
    },
    [options.drillDownVariable, shownStateId]
  );

  /**
   * Fixed bands need a *function* scale: an array scale is always stretched
   * between the current min and max, which is the behaviour we're replacing.
   * Falls back to the plain ramp if the thresholds field is empty or unparseable,
   * so a typo degrades to the old behaviour rather than to a blank map.
   */
  const stateBands = useMemo(() => parseThresholds(options.thresholds), [options.thresholds]);
  const districtBands = useMemo(() => {
    const own = parseThresholds(options.districtThresholds);
    return own.length > 0 ? own : stateBands;
  }, [options.districtThresholds, stateBands]);
  const subDistrictBands = useMemo(() => {
    const own = parseThresholds(options.subDistrictThresholds);
    return own.length > 0 ? own : districtBands;
  }, [options.subDistrictThresholds, districtBands]);

  const ramp = rampFor(options.palette);
  const requestedBands = shownDistrictId ? subDistrictBands : shownStateId ? districtBands : stateBands;
  // A ramp of N steps can express N-1 thresholds. Beyond that the extra bands
  // would have to share a shade, which the map cannot distinguish and the legend
  // filter would mis-select; the surplus is dropped and said out loud instead.
  const bands = requestedBands.slice(0, maxThresholds(ramp));
  const ignoredBands = requestedBands.slice(maxThresholds(ramp));

  /**
   * Which band the legend is filtering to.
   *
   * The package legend filters itself, but it is suppressed in fixed-band mode —
   * it describes bands it computed from min/max, which are not the ones on
   * screen. So the filter is rebuilt here. Each band has one exact fill, so
   * "everything not painted this colour" is a plain attribute selector.
   */
  const [pickedBandState, setPickedBandState] = useState<{ key: string; index: number } | null>(null);
  const bandKey = bands.join(',');
  const bandSelectionKey = JSON.stringify([shownStateId, shownDistrictId, bandKey]);
  const pickedBand = pickedBandState?.key === bandSelectionKey ? pickedBandState.index : null;
  const useBands = options.scaleMode === 'thresholds' && bands.length > 0;
  const bandCount = bands.length + 1;
  const bandFills = useMemo(() => bandColors(rampFor(options.palette), bandCount), [options.palette, bandCount]);

  const colorScale = useColorScale(options.palette, bandKey, useBands);

  /**
   * Load the two lower levels ourselves, so names can be matched and misses
   * reported.
   *
   * The wrapper would fetch these on its own and match district values behind
   * the scenes, warning about strays to the console — where nobody reading a
   * dashboard will see them. Taking over the loaders keeps the fetch identical
   * (it is the package's own) while letting aliases apply and unmatched names
   * surface on the panel.
   */
  const aliases = useMemo(() => parseAliases(options.aliases), [options.aliases]);
  const [missesByLevel, setMissesByLevel] = useState<Record<string, string[]>>({});
  const reportUnmatched = useCallback((levelKey: string, misses: string[]) => {
    setMissesByLevel((current) => {
      const previous = current[levelKey];
      if (!previous && misses.length === 0) {
        return current;
      }
      if (previous?.length === misses.length && previous.every((name, index) => name === misses[index])) {
        return current;
      }
      if (misses.length === 0) {
        const next = { ...current };
        delete next[levelKey];
        return next;
      }
      return { ...current, [levelKey]: misses };
    });
  }, []);
  const visibleLevelKey = JSON.stringify([shownStateId, shownDistrictId]);
  const unmatched = missesByLevel[visibleLevelKey] ?? [];
  /**
   * Where boundary geometry comes from.
   *
   * Defaults to the copy shipped inside this plugin, which Grafana serves from
   * its own /public/plugins path. Same-origin, so no CORS, no second host, and
   * nothing leaves the network — the right default for a dashboard that may run
   * somewhere with no egress. Setting the option points it elsewhere; the
   * package's public CDN is one such value.
   *
   * Handed to the wrapper as well as used by the loaders below. Passing
   * `undefined` when the option was empty let the wrapper fall back to its own
   * CDN default for the state layer — the one level it fetches itself — so
   * districts came from the bundle while the first and most visible level still
   * left the network.
   */
  const base =
    options.dataBaseUrl ||
    `${config.appSubUrl ?? ''}/public/plugins/shashankbudem-bharatchoropleth-panel/data/generated`;

  const nameOf = useCallback((feature: MapFeature) => String(feature.properties?.name ?? feature.properties?.id), []);

  /**
   * Cache the fetched-and-decoded topology per level.
   *
   * These loaders deliberately keep changing identity — that is how new query
   * values reach a level that is already open, since the library re-calls the
   * loader when its identity changes. But the raw call bypassed the library's own
   * per-id cache, so every one of those re-calls refetched and re-decoded the same
   * file: twice per drill on the documented `WHERE state = '$state'` pattern, and
   * once more per tick on an auto-refreshing dashboard, forever.
   *
   * Caching the promise keeps the churn (values still propagate) and drops the
   * repeated work. Keys include the base URL, so changing it is not stale. The
   * settled-entry LRU keeps the eight most recent levels; pending loads are never
   * evicted, and failures remain retryable.
   */
  const topologies = useRef(new SettledPromiseLru<string, GeometrySource | null>(8));
  const fetchTopology = useCallback(
    (key: string, load: () => Promise<GeometrySource | null>) => topologies.current.getOrCreate(key, load),
    []
  );

  const loadDistricts = useMemo(() => {
    if (!options.drillDown || !districtKey) {
      return undefined;
    }
    return async (stateId: string, state: MapRegion): Promise<MapLayer> => {
      const levelKey = JSON.stringify([stateId, null]);
      const geometry = (await fetchTopology(`d|${base}|${stateId}`, () =>
        loadDistrictTopology(base, stateId)
      )) as GeometrySource;
      // Keyed by the query's spelling, asked for by the geometry's — resolve both
      // through the same registry that resolves state names everywhere else.
      const values =
        collectByName(districtValues ?? {}, state.label, (n) => resolveState(n)?.id ?? normalizeName(n)) ?? {};
      const match = matchNames(values, asFeatureNames(geometry, nameOf), aliases);
      reportUnmatched(levelKey, match.unmatched);
      return {
        geometry,
        getId: (feature) => String(feature.properties?.id ?? nameOf(feature)),
        getLabel: nameOf,
        getValue: (feature) => match.valueFor(nameOf(feature)),
      };
    };
  }, [options.drillDown, districtKey, base, districtValues, aliases, nameOf, fetchTopology, reportUnmatched]);

  const loadSubDistricts = useMemo(() => {
    if (!options.drillDown || !subDistrictKey) {
      return undefined;
    }
    return async (districtId: string, district: MapRegion, stateId: string): Promise<MapLayer | null> => {
      const levelKey = JSON.stringify([stateId, districtId]);
      const geometry = await fetchTopology(`s|${base}|${districtId}`, () => loadSubDistrictTopology(base, districtId));
      if (!geometry) {
        reportUnmatched(levelKey, []);
        return null;
      }
      // No registry one level down, so plain normalization is the most that can
      // be claimed — a rename still has to be declared in Aliases.
      const byDistrict =
        collectByName(subDistrictValues, stateId, (name) => resolveState(name)?.id ?? normalizeName(name)) ?? {};
      const values = collectByName(byDistrict, district.label, normalizeName) ?? {};
      const match = matchNames(values, asFeatureNames(geometry, nameOf), aliases);
      reportUnmatched(levelKey, match.unmatched);
      return {
        geometry,
        getId: (feature) => String(feature.properties?.id ?? nameOf(feature)),
        getLabel: nameOf,
        getValue: (feature) => match.valueFor(nameOf(feature)),
      };
    };
  }, [options.drillDown, subDistrictKey, base, subDistrictValues, aliases, nameOf, fetchTopology, reportUnmatched]);

  const dimClass = (() => {
    if (pickedBand === null) {
      return undefined;
    }
    const keep = bandFills[pickedBand];
    return css({
      [`& path.india-choropleth__region:not([fill="${keep}"])`]: {
        opacity: 0.25,
        filter: 'grayscale(0.7)',
      },
    });
  })();

  if (frames.length === 0 || !regionKey || !valueKey) {
    return <PanelDataErrorView fieldConfig={fieldConfig} panelId={id} data={data} needsStringField needsNumberField />;
  }

  if (missingFields.length > 0) {
    return (
      <div className={themeClass}>
        <div className={noticeClass} role="status">
          {missingFields.join(' and ')} {missingFields.length === 1 ? 'names a column' : 'name columns'} this query does
          not return. Pick the right column under Field mapping — a name that is not in the data cannot be told apart
          from a row that leaves it blank, which would show one region&rsquo;s number as another&rsquo;s.
        </div>
      </div>
    );
  }

  return (
    <div className={cx(themeClass, dimClass)} onKeyDown={(e) => e.key === 'Escape' && setPickedBandState(null)}>
      <BharatChoropleth
        data={stateRows}
        regionKey={regionKey}
        valueKey={valueKey}
        districtValues={options.drillDown ? districtValues : undefined}
        districts={options.drillDown}
        subDistricts={options.drillDown}
        loadDistricts={loadDistricts}
        loadSubDistricts={loadSubDistricts}
        dataBaseUrl={base}
        colorScale={colorScale}
        showLegend={options.showLegend && !useBands}
        showRegionValues={options.showValues}
        drillDownId={shownStateId}
        subDistrictDrillDownId={shownDistrictId}
        onDrillDownChange={onStateChange}
        onSubDistrictDrillDownChange={onSubDistrictChange}
        ariaLabel="India choropleth of the panel query"
      />
      {useBands && ignoredBands.length > 0 && (
        <div className={noticeClass} role="status">
          This scheme has {ramp.length} shades, so it can show {maxThresholds(ramp)} band edges. Ignoring{' '}
          <b>{ignoredBands.join(', ')}</b>.
        </div>
      )}
      {unresolvedVariable && (
        <div className={noticeClass} role="status">
          The variable <b>{options.drillDownVariable}</b> is set to <b>{unresolvedVariable}</b>, which is not a state
          this map knows. Showing all states.
        </div>
      )}
      {unmatched.length > 0 && (
        <div className={noticeClass} role="status">
          {unmatched.length} name{unmatched.length === 1 ? '' : 's'} in the data matched no region:{' '}
          <b>{unmatched.slice(0, 4).join(', ')}</b>
          {unmatched.length > 4 ? ` and ${unmatched.length - 4} more` : ''}. Add a rename under Aliases.
        </div>
      )}
      {options.showLegend && useBands && (
        <div className={legendClass} role="group" aria-label="Value bands">
          {bandFills.map((fill, i) => (
            <Fragment key={fill + String(i)}>
              <button
                type="button"
                style={{ background: fill }}
                aria-pressed={pickedBand === i}
                aria-label={
                  i === 0
                    ? `Highlight regions below ${bands[0]}`
                    : i === bands.length
                      ? `Highlight regions ${bands[bands.length - 1]} and above`
                      : `Highlight regions ${bands[i - 1]} to ${bands[i]}`
                }
                onClick={() =>
                  setPickedBandState((current) =>
                    current?.key === bandSelectionKey && current.index === i
                      ? null
                      : { key: bandSelectionKey, index: i }
                  )
                }
              />
              {i < bands.length && <b>{bands[i]}</b>}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
};
