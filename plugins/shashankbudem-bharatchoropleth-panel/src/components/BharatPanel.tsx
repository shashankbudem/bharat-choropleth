import React, { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { PanelProps, DataFrameView, FieldType, getFieldDisplayName } from '@grafana/data';
import { PanelDataErrorView, getTemplateSrv, locationService } from '@grafana/runtime';
import { useTheme2 } from '@grafana/ui';
import { css, cx } from '@emotion/css';
import {
  BharatChoropleth,
  DEFAULT_DATA_BASE_URL,
  loadDistrictTopology,
  loadSubDistrictTopology,
  resolveState,
  type MapFeature,
  type MapLayer,
  type MapRegion,
} from 'bharat-choropleth';
import 'bharat-choropleth/style.css';
import { BharatOptions } from '../types';
import { PALETTES, bandColors, parseThresholds } from '../palettes';
import { bandIndexOf, splitRows } from '../data';
import { matchNames, parseAliases } from '../names';
import { asFeatureNames } from '../geometry';

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
      css({
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
          '& .india-choropleth__legend': { flexWrap: 'nowrap', gap: theme.spacing(1), fontSize: theme.typography.bodySmall.fontSize },
          '& .india-choropleth__swatches': { flex: '1 1 auto', minWidth: 0 },
          '& .india-choropleth__swatch': { width: 'auto', flex: '1 1 0', minWidth: '6px' },
        },
      }),
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

/** First field of a kind across every frame, so the panel renders unconfigured. */
function pickField(frames: Props['data']['series'], wanted: string, type: FieldType): string {
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
   * Every frame's rows, flattened.
   *
   * Levels are told apart by the district column, never by which query they came
   * from — so a dashboard can put state totals in query A and districts in query
   * B (filtered by the drill-down variable), in either order, and the panel does
   * not care. Keying off frame index would break the moment someone reorders
   * their queries.
   */
  const rows = useMemo(
    () => frames.flatMap((frame) => new DataFrameView(frame).toArray() as Array<Record<string, unknown>>),
    [frames]
  );

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
    const subscription = locationService
      .getLocationObservable()
      .subscribe(() => setLocationTick((tick) => tick + 1));
    return () => subscription.unsubscribe();
  }, []);

  const drillDownId = useMemo(() => {
    if (!options.drillDownVariable) {
      return undefined;
    }
    const fromUrl = locationService.getSearchObject()[`var-${options.drillDownVariable}`];
    const token = `$${options.drillDownVariable}`;
    const label = (
      fromUrl === undefined
        ? getTemplateSrv().replace(token)
        : String(Array.isArray(fromUrl) ? (fromUrl[0] ?? '') : fromUrl)
    ).trim();
    if (!label || label === token) {
      return null;
    }
    return resolveState(label)?.id ?? null;
    // locationTick is the subscription's re-read trigger, not an input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.drillDownVariable, locationTick]);

  /**
   * Fixed bands need a *function* scale: an array scale is always stretched
   * between the current min and max, which is the behaviour we're replacing.
   * Falls back to the plain ramp if the thresholds field is empty or unparseable,
   * so a typo degrades to the old behaviour rather than to a blank map.
   */
  // Which level is on screen. The renderer reports both drill-downs; a state
  // change clears the one below it, so the reset is mirrored here too.
  const [subDistrictId, setSubDistrictId] = useState<string | null>(null);

  const stateBands = useMemo(() => parseThresholds(options.thresholds), [options.thresholds]);
  const districtBands = useMemo(() => {
    const own = parseThresholds(options.districtThresholds);
    return own.length > 0 ? own : stateBands;
  }, [options.districtThresholds, stateBands]);
  const subDistrictBands = useMemo(() => {
    const own = parseThresholds(options.subDistrictThresholds);
    return own.length > 0 ? own : districtBands;
  }, [options.subDistrictThresholds, districtBands]);

  const bands = subDistrictId ? subDistrictBands : drillDownId ? districtBands : stateBands;

  /**
   * Which band the legend is filtering to.
   *
   * The package legend filters itself, but it is suppressed in fixed-band mode —
   * it describes bands it computed from min/max, which are not the ones on
   * screen. So the filter is rebuilt here. Each band has one exact fill, so
   * "everything not painted this colour" is a plain attribute selector.
   */
  const [pickedBand, setPickedBand] = useState<number | null>(null);
  const bandKey = bands.join(',');
  useEffect(() => setPickedBand(null), [bandKey, drillDownId, subDistrictId]);
  const useBands = options.scaleMode === 'thresholds' && bands.length > 0;
  const ramp = PALETTES[options.palette] ?? PALETTES.teal;
  const bandFills = useMemo(() => bandColors(ramp, bands.length + 1), [ramp, bands.length]);

  const colorScale = useMemo(() => {
    if (!useBands) {
      return ramp;
    }
    return (value: number | null) => {
      if (value === null || !Number.isFinite(value)) {
        return 'var(--india-map-empty)';
      }
      const index = bandIndexOf(value, bands);
      return index === null ? 'var(--india-map-empty)' : (bandFills[index] as string);
    };
  }, [useBands, ramp, bands, bandFills]);

  const onDrillDownChange = useCallback(
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
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const base = options.dataBaseUrl || DEFAULT_DATA_BASE_URL;

  const nameOf = useCallback(
    (feature: MapFeature) => String(feature.properties?.name ?? feature.properties?.id),
    []
  );

  const loadDistricts = useMemo(() => {
    if (!districtKey) {
      return undefined;
    }
    return async (stateId: string, state: MapRegion): Promise<MapLayer> => {
      const geometry = await loadDistrictTopology(base, stateId);
      const values = districtValues?.[state.label] ?? {};
      const match = matchNames(values, asFeatureNames(geometry, nameOf), aliases);
      setUnmatched(match.unmatched);
      return {
        geometry,
        getId: (feature) => String(feature.properties?.id ?? nameOf(feature)),
        getLabel: nameOf,
        getValue: (feature) => match.valueFor(nameOf(feature)),
      };
    };
  }, [districtKey, base, districtValues, aliases, nameOf]);

  const loadSubDistricts = useMemo(() => {
    if (!subDistrictKey) {
      return undefined;
    }
    return async (districtId: string, district: MapRegion): Promise<MapLayer | null> => {
      const geometry = await loadSubDistrictTopology(base, districtId);
      if (!geometry) {
        return null;
      }
      const values = subDistrictValues[district.label] ?? {};
      const match = matchNames(values, asFeatureNames(geometry, nameOf), aliases);
      setUnmatched(match.unmatched);
      return {
        geometry,
        getId: (feature) => String(feature.properties?.id ?? nameOf(feature)),
        getLabel: nameOf,
        getValue: (feature) => match.valueFor(nameOf(feature)),
      };
    };
  }, [subDistrictKey, base, subDistrictValues, aliases, nameOf]);

  const dimClass = useMemo(() => {
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
  }, [pickedBand, bandFills]);

  const onStateChange = useCallback(
    (stateId: string | null, state?: MapRegion) => {
      // Changing state drops the level below it, in the renderer and here.
      setSubDistrictId(null);
      setUnmatched([]);
      onDrillDownChange(stateId, state);
    },
    [onDrillDownChange]
  );

  if (frames.length === 0 || !regionKey || !valueKey) {
    return <PanelDataErrorView fieldConfig={fieldConfig} panelId={id} data={data} needsStringField needsNumberField />;
  }

  return (
    <div className={cx(themeClass, dimClass)} onKeyDown={(e) => e.key === 'Escape' && setPickedBand(null)}>
      <BharatChoropleth
        data={stateRows}
        regionKey={regionKey}
        valueKey={valueKey}
        districtValues={districtValues}
        districts={options.drillDown}
        subDistricts={options.drillDown}
        loadDistricts={loadDistricts}
        loadSubDistricts={loadSubDistricts}
        dataBaseUrl={options.dataBaseUrl || undefined}
        colorScale={colorScale}
        showLegend={options.showLegend && !useBands}
        showRegionValues={options.showValues}
        drillDownId={drillDownId}
        onDrillDownChange={onStateChange}
        onSubDistrictDrillDownChange={(districtId) => setSubDistrictId(districtId)}
        ariaLabel="India choropleth of the panel query"
      />
      {unmatched.length > 0 && (
        <div className={noticeClass} role="status">
          {unmatched.length} name{unmatched.length === 1 ? '' : 's'} in the data matched no region:{' '}
          <b>{unmatched.slice(0, 4).join(', ')}</b>
          {unmatched.length > 4 ? ` and ${unmatched.length - 4} more` : ''}. Add a rename under Aliases.
        </div>
      )}
      {options.showLegend && useBands && (
        <div className={legendClass}>
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
                onClick={() => setPickedBand((current) => (current === i ? null : i))}
              />
              {i < bands.length && <b>{bands[i]}</b>}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
};
