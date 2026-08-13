import { geoMercator, geoPath, type GeoProjection } from "d3-geo";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { asFeatureCollection, totalOf } from "./geometry";
import type {
  ColorContext,
  ColorScale,
  IndiaChoroplethProps,
  InsightContext,
  MapFeature,
  MapFeatureCollection,
  MapLayer,
  MapRegion,
  ReferenceOverlay,
  TooltipContext,
} from "./types";
import { useControllableState } from "./useControllableState";

const VIEWBOX = { width: 960, height: 640, padding: 28 };
const DEFAULT_COLORS = ["#d9f1ed", "#b9e3dd", "#8fd1c8", "#5bb9ae", "#2f9c90", "#147b71", "#075b55"] as const;
const DEFAULT_FORMAT = new Intl.NumberFormat("en-IN").format;

type PreparedRegion = MapRegion & { path: string; centroid: [number, number] };
type PreparedReferenceOverlay = { id: string; label: string; description: string; path: string };

function clamp(value: number, lower: number, upper: number) {
  return Math.min(Math.max(value, lower), upper);
}

function colorFor(value: number | null, region: MapRegion, min: number, max: number, scale: ColorScale): string {
  if (typeof scale === "function") {
    const context: ColorContext = { min, max, feature: region.feature, id: region.id };
    return scale(value, context);
  }
  if (value === null) return "var(--india-map-empty)";
  const index = max === min ? scale.length - 1 : Math.round(((value - min) / (max - min)) * (scale.length - 1));
  return scale[clamp(index, 0, scale.length - 1)] ?? "var(--india-map-empty)";
}

function makeProjection(collection: MapFeatureCollection): GeoProjection {
  return geoMercator().fitExtent(
    [[VIEWBOX.padding, VIEWBOX.padding], [VIEWBOX.width - VIEWBOX.padding, VIEWBOX.height - VIEWBOX.padding]],
    collection,
  );
}

function prepareLayer(layer: MapLayer, projection = makeProjection(asFeatureCollection(layer.geometry))): PreparedRegion[] {
  const collection = asFeatureCollection(layer.geometry);
  const path = geoPath(projection);
  return collection.features.map((feature) => {
    const region: MapRegion = {
      id: layer.getId(feature),
      label: layer.getLabel(feature),
      value: layer.getValue(feature),
      meta: layer.getMeta?.(feature),
      feature,
    };
    return { ...region, path: path(feature) ?? "", centroid: path.centroid(feature) as [number, number] };
  });
}

function prepareReferenceOverlay(overlay: ReferenceOverlay, projection: GeoProjection): PreparedReferenceOverlay[] {
  const path = geoPath(projection);
  return asFeatureCollection(overlay.geometry).features.map((feature) => ({
    id: overlay.getId(feature),
    label: overlay.getLabel(feature),
    description: overlay.getDescription(feature),
    path: path(feature) ?? "",
  }));
}

function defaultTooltip(context: TooltipContext, formatValue: (value: number) => string) {
  return (
    <>
      <strong>{context.label}</strong>
      <b>{context.value === null ? "No data" : formatValue(context.value)}</b>
      {context.share !== null ? <small>{context.share.toFixed(1)}% of total</small> : null}
    </>
  );
}

/**
 * A data-agnostic, accessible SVG India map renderer. Import `@india-choropleth/react/style.css`
 * once in the host app; data and boundaries intentionally remain separate.
 */
export function IndiaChoropleth({
  states,
  referenceOverlay,
  loadDistricts,
  loadDistrictReferenceOverlay,
  drillDownId,
  defaultDrillDownId = null,
  onDrillDownChange,
  selectedId,
  defaultSelectedId = null,
  onSelectedChange,
  onInspect,
  onInsight,
  onRegionClick,
  colorScale = DEFAULT_COLORS,
  formatValue = DEFAULT_FORMAT,
  renderTooltip,
  renderInsights,
  showLegend = true,
  showBreadcrumb = true,
  legendLabels = ["Lower", "Higher"],
  referenceOverlayLegendLabel = "Reference context · data unavailable",
  className,
  ariaLabel = "Interactive choropleth map",
  interactive = true,
}: IndiaChoroplethProps) {
  const tooltipId = useId();
  const hatchId = `${useId()}-reference-hatch`;
  const [activeDrillDownId, setActiveDrillDownId] = useControllableState(drillDownId, defaultDrillDownId);
  const [activeSelectedId, setActiveSelectedId] = useControllableState(selectedId, defaultSelectedId);
  const [loadedDistricts, setLoadedDistricts] = useState<{ stateId: string; layer: MapLayer } | null>(null);
  const [loadedDistrictReferenceOverlay, setLoadedDistrictReferenceOverlay] = useState<{ stateId: string; overlay: ReferenceOverlay | null } | null>(null);
  const [loadingState, setLoadingState] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const pathRefs = useRef<Record<string, SVGPathElement | null>>({});
  const restoreFocusId = useRef<string | null>(null);

  const stateCollection = useMemo(() => asFeatureCollection(states.geometry), [states]);
  const referenceCollection = useMemo(
    () => referenceOverlay ? asFeatureCollection(referenceOverlay.geometry) : null,
    [referenceOverlay],
  );
  const nationalProjection = useMemo(
    () => makeProjection({ type: "FeatureCollection", features: [...stateCollection.features, ...(referenceCollection?.features ?? [])] }),
    [referenceCollection, stateCollection],
  );
  const stateRegions = useMemo(() => prepareLayer(states, nationalProjection), [nationalProjection, states]);
  const referenceRegions = useMemo(
    () => referenceOverlay ? prepareReferenceOverlay(referenceOverlay, nationalProjection) : [],
    [nationalProjection, referenceOverlay],
  );
  const drilledState = useMemo(
    () => stateRegions.find((region) => region.id === activeDrillDownId) ?? null,
    [activeDrillDownId, stateRegions],
  );
  const isDrillRequested = Boolean(drilledState && activeDrillDownId);
  const level = isDrillRequested ? "district" : "state";
  const districtLayer = loadedDistricts?.stateId === activeDrillDownId ? loadedDistricts.layer : null;
  const districtReferenceOverlay = loadedDistrictReferenceOverlay?.stateId === activeDrillDownId
    ? loadedDistrictReferenceOverlay.overlay
    : null;
  const districtCollection = useMemo(
    () => districtLayer ? asFeatureCollection(districtLayer.geometry) : null,
    [districtLayer],
  );
  const districtReferenceCollection = useMemo(
    () => districtReferenceOverlay ? asFeatureCollection(districtReferenceOverlay.geometry) : null,
    [districtReferenceOverlay],
  );
  const districtProjection = useMemo(
    () => districtCollection ? makeProjection({ type: "FeatureCollection", features: [...districtCollection.features, ...(districtReferenceCollection?.features ?? [])] }) : null,
    [districtCollection, districtReferenceCollection],
  );
  const regions = useMemo(
    () => level === "district" && districtLayer && districtProjection ? prepareLayer(districtLayer, districtProjection) : level === "state" ? stateRegions : [],
    [districtLayer, districtProjection, level, stateRegions],
  );
  const districtReferenceRegions = useMemo(
    () => level === "district" && districtReferenceOverlay && districtProjection ? prepareReferenceOverlay(districtReferenceOverlay, districtProjection) : [],
    [districtProjection, districtReferenceOverlay, level],
  );
  const selected = regions.find((region) => region.id === activeSelectedId) ?? null;
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const inspected = regions.find((region) => region.id === inspectedId) ?? selected;

  const values = useMemo(() => regions.map((region) => region.value).filter((value): value is number => value !== null), [regions]);
  const total = useMemo(() => totalOf(values), [values]);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;

  useEffect(() => {
    let cancelled = false;
    if (!activeDrillDownId || !loadDistricts) {
      setLoadedDistricts(null);
      setLoadingState(null);
      setLoadError(null);
      return;
    }
    const sourceState = stateRegions.find((region) => region.id === activeDrillDownId);
    if (!sourceState) return;
    setLoadingState(activeDrillDownId);
    setLoadError(null);
    setLoadedDistricts(null);
    loadDistricts(activeDrillDownId, sourceState)
      .then((loaded) => { if (!cancelled) setLoadedDistricts({ stateId: activeDrillDownId, layer: loaded }); })
      .catch((error: unknown) => { if (!cancelled) setLoadError(error instanceof Error ? error : new Error("Unable to load districts.")); })
      .finally(() => { if (!cancelled) setLoadingState(null); });
    return () => { cancelled = true; };
  }, [activeDrillDownId, loadDistricts, stateRegions]);

  useEffect(() => {
    let cancelled = false;
    if (!activeDrillDownId || !loadDistrictReferenceOverlay) {
      setLoadedDistrictReferenceOverlay(null);
      return;
    }
    const sourceState = stateRegions.find((region) => region.id === activeDrillDownId);
    if (!sourceState) return;
    setLoadedDistrictReferenceOverlay(null);
    loadDistrictReferenceOverlay(activeDrillDownId, sourceState)
      .then((overlay) => { if (!cancelled) setLoadedDistrictReferenceOverlay({ stateId: activeDrillDownId, overlay }); })
      // Optional reference context must not prevent a usable district data view.
      .catch(() => { if (!cancelled) setLoadedDistrictReferenceOverlay({ stateId: activeDrillDownId, overlay: null }); });
    return () => { cancelled = true; };
  }, [activeDrillDownId, loadDistrictReferenceOverlay, stateRegions]);

  useEffect(() => {
    const regionId = restoreFocusId.current;
    if (!regionId || level !== "state") return;
    restoreFocusId.current = null;
    pathRefs.current[regionId]?.focus();
  }, [level, regions]);

  useEffect(() => {
    if (!inspectedId) return;
    if (!regions.some((region) => region.id === inspectedId)) setInspectedId(null);
  }, [inspectedId, regions]);

  const inspect = (region: PreparedRegion | null) => {
    setInspectedId(region?.id ?? null);
    onInspect?.(region ?? null, level);
  };

  const activate = (region: PreparedRegion) => {
    onRegionClick?.(region, level);
    setActiveSelectedId(region.id);
    onSelectedChange?.(region, level);
    if (level === "state" && loadDistricts) {
      setActiveSelectedId(null);
      setActiveDrillDownId(region.id);
      onDrillDownChange?.(region.id, region);
    }
  };

  const goBack = () => {
    const priorState = drilledState ?? undefined;
    setActiveDrillDownId(null);
    setActiveSelectedId(priorState?.id ?? null);
    setInspectedId(priorState?.id ?? null);
    restoreFocusId.current = priorState?.id ?? null;
    onDrillDownChange?.(null, priorState);
  };

  const tooltipContext = useMemo<TooltipContext | null>(() => inspected
    ? { ...inspected, level, total, share: inspected.value === null || total === 0 ? null : (inspected.value / total) * 100 }
    : null, [inspected, level, total]);
  const insightContext = useMemo<InsightContext | null>(() => tooltipContext
    ? { ...tooltipContext, selected: tooltipContext.id === selected?.id }
    : null, [selected?.id, tooltipContext]);
  const canDrill = Boolean(loadDistricts && level === "state");
  const visibleReferenceRegions = level === "state" ? referenceRegions : districtReferenceRegions;

  useEffect(() => { onInsight?.(insightContext); }, [insightContext, onInsight]);

  return (
    <section className={["india-choropleth", !interactive && "india-choropleth--static", className].filter(Boolean).join(" ")} aria-busy={loadingState ? "true" : undefined}>
      {showBreadcrumb ? (
        <div className="india-choropleth__toolbar">
          <nav className="india-choropleth__breadcrumb" aria-label="Map hierarchy">
            {drilledState ? <button className="india-choropleth__back" type="button" onClick={goBack}>All states</button> : <span>All states</span>}
            {drilledState ? <><span aria-hidden="true">/</span><span aria-current="page">{drilledState.label}</span></> : null}
          </nav>
        </div>
      ) : null}
      <div className="india-choropleth__canvas" onMouseLeave={interactive ? () => inspect(null) : undefined}>
        {isDrillRequested && (!districtLayer || loadError) ? (
          <div className="india-choropleth__status" role={loadError ? "alert" : "status"}>
            {loadError ? loadError.message : loadingState ? "Loading districts…" : "District data is unavailable for this state."}
          </div>
        ) : regions.length === 0 ? (
          <div className="india-choropleth__status" role="status">No district data is available for this state.</div>
        ) : (
        <svg
          className="india-choropleth__svg"
          viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
          role="group"
          aria-label={ariaLabel}
          onKeyDown={interactive ? (event) => { if (event.key === "Escape") { event.preventDefault(); inspect(null); } } : undefined}
        >
          {visibleReferenceRegions.length > 0 ? (
            <>
              <defs>
                <pattern id={hatchId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="8" height="8" fill="var(--india-map-reference-bg)" />
                  <line x1="0" y1="0" x2="0" y2="8" stroke="var(--india-map-reference-hatch)" strokeWidth="2" />
                </pattern>
              </defs>
              <g className="india-choropleth__reference-fill" role="group" aria-label="Non-statistical reference context.">
                {visibleReferenceRegions.map((region) => (
                  <path
                    key={region.id}
                    d={region.path}
                    fill={`url(#${hatchId})`}
                    aria-label={`${region.label}.${region.description ? ` ${region.description}` : ""}`}
                    role="img"
                  />
                ))}
              </g>
            </>
          ) : null}
          {regions.map((region) => {
            const isInspected = region.id === inspected?.id;
            const isSelected = region.id === selected?.id;
            const action = canDrill ? "Activate to view districts." : "Activate to select.";
            const textValue = region.value === null ? "No data" : formatValue(region.value);
            return (
              <path
                key={region.id}
                className={`india-choropleth__region${isInspected ? " india-choropleth__region--inspected" : ""}${isSelected ? " india-choropleth__region--selected" : ""}`}
                d={region.path}
                fill={colorFor(region.value, region, min, max, colorScale)}
                tabIndex={interactive ? 0 : -1}
                role={interactive ? "button" : undefined}
                aria-label={`${region.label}, ${textValue}. ${action}`}
                aria-pressed={interactive ? isSelected : undefined}
                aria-describedby={isInspected ? tooltipId : undefined}
                ref={(element) => { pathRefs.current[region.id] = element; }}
                onMouseEnter={interactive ? () => inspect(region) : undefined}
                onFocus={interactive ? () => inspect(region) : undefined}
                onClick={interactive ? () => activate(region) : undefined}
                onKeyDown={interactive ? (event) => {
                  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(region); }
                } : undefined}
              />
            );
          })}
          {visibleReferenceRegions.length > 0 ? (
            <g className="india-choropleth__reference-outline" aria-hidden="true">
              {visibleReferenceRegions.map((region) => <path key={region.id} d={region.path} fill="none" />)}
            </g>
          ) : null}
        </svg>
        )}
        {tooltipContext && regions.length > 0 ? (
          <div className="india-choropleth__tooltip-anchor" style={{ left: `${(inspected!.centroid[0] / VIEWBOX.width) * 100}%`, top: `${(inspected!.centroid[1] / VIEWBOX.height) * 100}%` }}>
            <div id={tooltipId} className="india-choropleth__tooltip" role="status">
              {renderTooltip ? renderTooltip(tooltipContext) : defaultTooltip(tooltipContext, formatValue)}
            </div>
          </div>
        ) : null}
      </div>
      {showLegend ? (
        <div className="india-choropleth__legend" aria-label={`Color scale: ${legendLabels[0]} to ${legendLabels[1]} values`}>
          <span>{legendLabels[0]}</span><div className="india-choropleth__swatches" aria-hidden="true">
            {(typeof colorScale === "function" ? DEFAULT_COLORS : colorScale).map((color, index) => <i className="india-choropleth__swatch" key={`${color}-${index}`} style={{ backgroundColor: color }} />)}
          </div><span>{legendLabels[1]}</span>
          {visibleReferenceRegions.length > 0 ? <><i className="india-choropleth__reference-key" aria-hidden="true" /><span>{referenceOverlayLegendLabel}</span></> : null}
        </div>
      ) : null}
      {renderInsights ? <aside className="india-choropleth__insights" aria-live="polite">{renderInsights(insightContext)}</aside> : null}
    </section>
  );
}
