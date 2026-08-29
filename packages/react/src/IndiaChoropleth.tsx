import { geoMercator, geoPath, type GeoProjection } from "d3-geo";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { asFeatureCollection, totalOf } from "./geometry";
import { legendBucketLabel, legendBuckets, swatchIndexOf } from "./legend";
import { placeTooltip } from "./tooltip-position";
import {
  boundsOfRing,
  distanceToParts,
  keepsTrueGeometry,
  labelPointFor,
  enlargeSmallParts,
  largestRingExtent,
  placeOutsideLabel,
  ringsToPath,
  scatteredHitArea,
  type Box,
  type Point,
} from "./small-regions";
import type {
  ColorContext,
  ColorScale,
  IndiaChoroplethProps,
  InsightContext,
  MapFeature,
  MapFeatureCollection,
  MapLayer,
  MapLevel,
  MapRegion,
  ReferenceOverlay,
  TooltipContext,
} from "./types";
import { useControllableState } from "./useControllableState";

const VIEWBOX = { width: 960, height: 640, padding: 28 };
const DEFAULT_COLORS = ["#d9f1ed", "#b9e3dd", "#8fd1c8", "#5bb9ae", "#2f9c90", "#147b71", "#075b55"] as const;
const DEFAULT_FORMAT = new Intl.NumberFormat("en-IN").format;
// Space between the region centroid and the tooltip edge. Mirrors the .75rem in style.css.
const TOOLTIP_GAP_PX = 12;
// Small-region handling, in view-box units. Mirrors the DOM and Dart renderers.
const SMALL_REGION_EXTENT = 22;
const SMALL_REGION_CLICK_RADIUS = 14;
const MIN_REGION_MARKER_SIZE = 7;

type PreparedRegion = MapRegion & {
  path: string;
  /**
   * Hull covering a scattered region's parts and the space between them, drawn
   * invisibly under every outline so hovering the water inside Lakshadweep
   * reaches Lakshadweep. Null for regions that are one part or big enough to
   * point at directly.
   */
  hitPath: string | null;
  centroid: [number, number];
  /** Bounding box of each separate part, for measuring how close a click landed. */
  partBounds: Box[];
  /** Longest side of the largest part — the measure of "too small to use". */
  extent: number;
};

/**
 * Project a feature's rings into view-box coordinates. Needed alongside the SVG
 * path string because the small-region helpers work on coordinates, and a path
 * string cannot be measured per part.
 */
function projectedRings(feature: MapFeature, projection: GeoProjection): Point[][] {
  const geometry = feature.geometry;
  if (!geometry) return [];
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates]
      : geometry.type === "MultiPolygon" ? geometry.coordinates
        : [];
  const rings: Point[][] = [];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      const projected: Point[] = [];
      for (const position of ring) {
        const point = projection(position as [number, number]);
        if (point && Number.isFinite(point[0]) && Number.isFinite(point[1])) projected.push([point[0], point[1]]);
      }
      if (projected.length > 0) rings.push(projected);
    }
  }
  return rings;
}
type PreparedReferenceOverlay = { id: string; label: string; description: string; path: string };

function colorFor(value: number | null, region: MapRegion, min: number, max: number, scale: ColorScale): string {
  if (typeof scale === "function") {
    const context: ColorContext = { min, max, feature: region.feature, id: region.id };
    return scale(value, context);
  }
  // The same index the legend filters by, deliberately: "highlight the regions
  // painted in this colour" has to be true by construction, not by two formulas
  // that happen to agree until one of them is tweaked.
  const index = swatchIndexOf(value, min, max, scale.length);
  return index === null ? "var(--india-map-empty)" : scale[index] ?? "var(--india-map-empty)";
}

function makeProjection(collection: MapFeatureCollection): GeoProjection {
  return geoMercator().fitExtent(
    [[VIEWBOX.padding, VIEWBOX.padding], [VIEWBOX.width - VIEWBOX.padding, VIEWBOX.height - VIEWBOX.padding]],
    collection,
  );
}

function prepareLayer(
  layer: MapLayer,
  projection = makeProjection(asFeatureCollection(layer.geometry)),
  minPartExtent = 0,
): PreparedRegion[] {
  const collection = asFeatureCollection(layer.geometry);
  const path = geoPath(projection);
  return collection.features.map((feature) => {
    const centroid = path.centroid(feature) as [number, number];
    const bounds = path.bounds(feature);
    const fallbackCentroid: [number, number] = [
      (bounds[0][0] + bounds[1][0]) / 2,
      (bounds[0][1] + bounds[1][1]) / 2,
    ];
    const region: MapRegion = {
      id: layer.getId(feature),
      label: layer.getLabel(feature),
      value: layer.getValue(feature),
      meta: layer.getMeta?.(feature),
      feature,
    };
    // Puducherry and anything else on the keep-true list is drawn as it really
    // is, however small, because there is no room around it to grow into.
    const exaggerate = minPartExtent > 0 && !keepsTrueGeometry(region.id);
    const rings = exaggerate
      ? enlargeSmallParts(projectedRings(feature, projection), minPartExtent)
      : projectedRings(feature, projection);
    const fallback: [number, number] = centroid.every(Number.isFinite) ? centroid : fallbackCentroid;
    const hull = scatteredHitArea(rings, SMALL_REGION_EXTENT);
    // With exaggeration on, the drawn outline has to come from the moved rings
    // rather than d3's path generator, so what is drawn, measured, labelled and
    // clicked are all the same geometry.
    return {
      ...region,
      path: exaggerate ? ringsToPath(rings) : (path(feature) ?? ""),
      hitPath: hull ? ringsToPath([hull]) : null,
      // The largest part's centroid, not the whole feature's: averaging across
      // parts puts an island group's label out at sea between its islands.
      centroid: rings.length > 0 ? (labelPointFor(rings, fallback) as [number, number]) : fallback,
      partBounds: rings.map(boundsOfRing),
      extent: largestRingExtent(rings),
    };
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

function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

function defaultTooltip(context: TooltipContext, formatValue: (value: number) => string) {
  return (
    <>
      <strong>{context.label}</strong>
      {/* Same wording as the region's own aria-label, so the two never disagree. */}
      <b>{context.value === null ? "No data" : formatValue(context.value)}</b>
      {context.share !== null ? (
        <>
          {/* A bar makes the share readable at a glance; it repeats the number
              beside it, so it's decorative and hidden from assistive tech. */}
          <span className="india-choropleth__tooltip-bar" aria-hidden="true">
            <span style={{ width: `${Math.max(context.share, 1.5)}%` }} />
          </span>
          <small>
            {[
              `${context.share.toFixed(1)}% of total`,
              ...(context.rank !== null ? [`${ordinal(context.rank)} of ${context.rankedCount}`] : []),
            ].join(" · ")}
          </small>
        </>
      ) : null}
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
  loadSubDistricts,
  loadDistrictReferenceOverlay,
  drillDownId,
  defaultDrillDownId = null,
  onDrillDownChange,
  subDistrictDrillDownId,
  defaultSubDistrictDrillDownId = null,
  onSubDistrictDrillDownChange,
  selectedId,
  defaultSelectedId = null,
  onSelectedChange,
  onInspect,
  onInsight,
  onRegionClick,
  onBackgroundClick,
  colorScale = DEFAULT_COLORS,
  formatValue = DEFAULT_FORMAT,
  renderTooltip,
  renderInsights,
  showLegend = true,
  showBreadcrumb = true,
  legendLabels = ["Lower", "Higher"],
  referenceOverlayLegendLabel = "Reference context · data unavailable",
  referenceOverlayMergeIds = [],
  referenceOverlayFill = "hatch",
  showRegionValues = false,
  minPartExtent = 0,
  minDistrictPartExtent,
  className,
  ariaLabel = "Interactive choropleth map",
  interactive = true,
}: IndiaChoroplethProps) {
  const tooltipId = useId();
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const tooltipAnchorRef = useRef<HTMLDivElement | null>(null);
  const hatchId = `${useId()}-reference-hatch`;
  const [activeDrillDownId, setActiveDrillDownId] = useControllableState(drillDownId, defaultDrillDownId);
  const [activeSubDrillDownId, setActiveSubDrillDownId] = useControllableState(subDistrictDrillDownId, defaultSubDistrictDrillDownId);
  const [activeSelectedId, setActiveSelectedId] = useControllableState(selectedId, defaultSelectedId);
  const [loadedDistricts, setLoadedDistricts] = useState<{ stateId: string; layer: MapLayer } | null>(null);
  const [loadedSubDistricts, setLoadedSubDistricts] = useState<{ districtId: string; layer: MapLayer } | null>(null);
  /**
   * Districts the loader has already answered `null` for. The renderer cannot know
   * which districts are leaves without asking, so the first activation asks — but
   * after that the region should stop announcing a level it will not open. Held as
   * state rather than a ref so learning it repaints the label, and cleared when the
   * loader changes, since a different source may well have sub-districts for them.
   */
  const [leafDistrictIds, setLeafDistrictIds] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => { setLeafDistrictIds(new Set()); }, [loadSubDistricts]);
  const [loadedDistrictReferenceOverlay, setLoadedDistrictReferenceOverlay] = useState<{ stateId: string; overlay: ReferenceOverlay | null } | null>(null);
  const [loadingState, setLoadingState] = useState<string | null>(null);
  const [loadingDistrict, setLoadingDistrict] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [subLoadError, setSubLoadError] = useState<Error | null>(null);
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
  const stateRegions = useMemo(() => prepareLayer(states, nationalProjection, minPartExtent), [minPartExtent, nationalProjection, states]);
  const referenceRegions = useMemo(
    () => referenceOverlay ? prepareReferenceOverlay(referenceOverlay, nationalProjection) : [],
    [nationalProjection, referenceOverlay],
  );
  const drilledState = useMemo(
    () => stateRegions.find((region) => region.id === activeDrillDownId) ?? null,
    [activeDrillDownId, stateRegions],
  );
  const isDrillRequested = Boolean(drilledState && activeDrillDownId);
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
  // Districts are prepared whenever their layer is loaded rather than only while
  // they are the visible level, because the district below them has to be
  // resolvable — by id, for the breadcrumb and for the loader — from one level down.
  const districtRegions = useMemo(
    () => districtLayer && districtProjection
      ? prepareLayer(districtLayer, districtProjection, minDistrictPartExtent ?? minPartExtent)
      : [],
    [districtLayer, districtProjection, minDistrictPartExtent, minPartExtent],
  );
  const drilledDistrict = useMemo(
    () => districtRegions.find((region) => region.id === activeSubDrillDownId) ?? null,
    [activeSubDrillDownId, districtRegions],
  );
  const isSubDrillRequested = Boolean(isDrillRequested && drilledDistrict && activeSubDrillDownId);
  const level: MapLevel = isSubDrillRequested ? "subdistrict" : isDrillRequested ? "district" : "state";

  const subDistrictLayer = loadedSubDistricts?.districtId === activeSubDrillDownId ? loadedSubDistricts.layer : null;
  const subDistrictCollection = useMemo(
    () => subDistrictLayer ? asFeatureCollection(subDistrictLayer.geometry) : null,
    [subDistrictLayer],
  );
  const subDistrictProjection = useMemo(
    () => subDistrictCollection ? makeProjection(subDistrictCollection) : null,
    [subDistrictCollection],
  );
  // Sub-districts share the district knob rather than adding a fourth: they are
  // drawn at the same zoom as districts and want the same small-part treatment.
  const subDistrictRegions = useMemo(
    () => subDistrictLayer && subDistrictProjection
      ? prepareLayer(subDistrictLayer, subDistrictProjection, minDistrictPartExtent ?? minPartExtent)
      : [],
    [minDistrictPartExtent, minPartExtent, subDistrictLayer, subDistrictProjection],
  );

  const regions = level === "subdistrict" ? subDistrictRegions : level === "district" ? districtRegions : stateRegions;
  const districtReferenceRegions = useMemo(
    () => level === "district" && districtReferenceOverlay && districtProjection ? prepareReferenceOverlay(districtReferenceOverlay, districtProjection) : [],
    [districtProjection, districtReferenceOverlay, level],
  );
  const selected = regions.find((region) => region.id === activeSelectedId) ?? null;
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const inspectedIdRef = useRef<string | null>(null);
  // Hover/focus only — no fallback to `selected`, so the floating tooltip clears
  // when the pointer/focus leaves instead of sticking on the selected region.
  const inspected = regions.find((region) => region.id === inspectedId) ?? null;

  const values = useMemo(() => regions.map((region) => region.value).filter((value): value is number => value !== null), [regions]);
  const total = useMemo(() => totalOf(values), [values]);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;

  // The legend doubles as a filter. A function colour scale has no swatches of
  // its own, so the default ramp stands in and the bands still read low to high.
  const legendColors = typeof colorScale === "function" ? DEFAULT_COLORS : colorScale;
  const buckets = useMemo(
    () => legendBuckets(legendColors, regions.map((region) => region.value), min, max),
    [legendColors, max, min, regions],
  );
  const [activeBucket, setActiveBucket] = useState<number | null>(null);
  // Clamped here rather than only in the effect below: effects run after paint,
  // so a stale index would dim against the previous level's bands for a frame.
  const filterBucket = activeBucket !== null && activeBucket < buckets.length ? activeBucket : null;
  // Keyed on the ramp's contents, not its identity — a host passing an inline
  // array literal would otherwise clear the filter on every re-render.
  const colorScaleKey = typeof colorScale === "function" ? "function" : colorScale.join(",");
  // Bands come from this level's own min and max, and change with the ramp, so an
  // index picked under one of them means something else under another.
  useEffect(() => { setActiveBucket(null); }, [activeDrillDownId, activeSubDrillDownId, colorScaleKey, level]);

  const highlighted = useMemo(
    () => filterBucket === null
      ? null
      : new Set(regions
        .filter((region) => swatchIndexOf(region.value, min, max, legendColors.length) === filterBucket)
        .map((region) => region.id)),
    [filterBucket, legendColors.length, max, min, regions],
  );
  // Dimmed regions stay hoverable: the filter is about where the eye goes, and a
  // region you can see is a region whose number should still be reachable.
  const isDimmed = (id: string) => highlighted !== null && !highlighted.has(id);

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
    let cancelled = false;
    if (!activeSubDrillDownId || !loadSubDistricts) {
      setLoadedSubDistricts(null);
      setLoadingDistrict(null);
      setSubLoadError(null);
      return;
    }
    const sourceDistrict = districtRegions.find((region) => region.id === activeSubDrillDownId);
    // The district layer has not arrived yet, so there is nothing to load from.
    // This effect re-runs once it does.
    if (!sourceDistrict || !activeDrillDownId) return;
    setLoadingDistrict(activeSubDrillDownId);
    setSubLoadError(null);
    setLoadedSubDistricts(null);
    loadSubDistricts(activeSubDrillDownId, sourceDistrict, activeDrillDownId)
      .then((loaded) => {
        if (cancelled) return;
        if (!loaded) {
          // This district is a leaf. Step back to the district view and leave it
          // selected, rather than opening a level with nothing in it.
          setLeafDistrictIds((known) => known.has(activeSubDrillDownId) ? known : new Set(known).add(activeSubDrillDownId));
          setActiveSubDrillDownId(null);
          setActiveSelectedId(sourceDistrict.id);
          onSubDistrictDrillDownChange?.(null, sourceDistrict);
          return;
        }
        setLoadedSubDistricts({ districtId: activeSubDrillDownId, layer: loaded });
      })
      .catch((error: unknown) => { if (!cancelled) setSubLoadError(error instanceof Error ? error : new Error("Unable to load sub-districts.")); })
      .finally(() => { if (!cancelled) setLoadingDistrict(null); });
    return () => { cancelled = true; };
    // `onSubDistrictDrillDownChange` and the setters are deliberately not
    // dependencies: a host passing an inline callback would otherwise refetch on
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDrillDownId, activeSubDrillDownId, districtRegions, loadSubDistricts]);

  // A district id only means something inside the state it came from, so leaving
  // or changing the state drops the level below it. Seeded with the mount-time
  // value so an initial state + district pair survives: this must fire on a
  // change, not on arrival.
  const priorDrillDownId = useRef(activeDrillDownId);
  useEffect(() => {
    if (priorDrillDownId.current === activeDrillDownId) return;
    priorDrillDownId.current = activeDrillDownId;
    setActiveSubDrillDownId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDrillDownId]);

  useEffect(() => {
    const regionId = restoreFocusId.current;
    if (!regionId) return;
    // Focus is restored onto the region that was just stepped out of, so it waits
    // until the level holding that region is the one being drawn.
    if (!regions.some((region) => region.id === regionId)) return;
    restoreFocusId.current = null;
    pathRefs.current[regionId]?.focus();
  }, [level, regions]);

  useEffect(() => {
    if (!inspectedId) return;
    if (!regions.some((region) => region.id === inspectedId)) {
      inspectedIdRef.current = null;
      setInspectedId(null);
    }
  }, [inspectedId, regions]);

  // Mirrors `inspectedId` synchronously so a single gesture that exits both a region
  // and the canvas doesn't report the clear twice. Deliberately limited to redundant
  // clears: re-inspecting the same region must still notify, because focus restoration
  // after breadcrumb-back re-inspects the region `goBack` already primed.
  const inspect = (region: PreparedRegion | null) => {
    const nextId = region?.id ?? null;
    if (nextId === null && inspectedIdRef.current === null) return;
    inspectedIdRef.current = nextId;
    setInspectedId(nextId);
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
      return;
    }
    // A district is a leaf unless the host offers a level below it. Whether this
    // particular district actually has one is only known once the loader answers,
    // so the drill is entered optimistically and stepped back out if it returns null.
    if (level === "district" && loadSubDistricts && !leafDistrictIds.has(region.id)) {
      setActiveSelectedId(null);
      setActiveSubDrillDownId(region.id);
      onSubDistrictDrillDownChange?.(region.id, region);
    }
  };

  /** Steps up exactly one level, so the breadcrumb and the back button agree. */
  const goBack = () => {
    if (level === "subdistrict") {
      const priorDistrict = drilledDistrict ?? undefined;
      setActiveSubDrillDownId(null);
      setActiveSelectedId(priorDistrict?.id ?? null);
      inspectedIdRef.current = priorDistrict?.id ?? null;
      setInspectedId(priorDistrict?.id ?? null);
      restoreFocusId.current = priorDistrict?.id ?? null;
      onSubDistrictDrillDownChange?.(null, priorDistrict);
      return;
    }
    const priorState = drilledState ?? undefined;
    setActiveDrillDownId(null);
    setActiveSubDrillDownId(null);
    setActiveSelectedId(priorState?.id ?? null);
    inspectedIdRef.current = priorState?.id ?? null;
    setInspectedId(priorState?.id ?? null);
    restoreFocusId.current = priorState?.id ?? null;
    onDrillDownChange?.(null, priorState);
  };

  /** Jumps straight to the national map from any level. */
  const goToStates = () => {
    const priorState = drilledState ?? undefined;
    const wasDrilledDistrict = drilledDistrict ?? undefined;
    setActiveSubDrillDownId(null);
    setActiveDrillDownId(null);
    setActiveSelectedId(priorState?.id ?? null);
    inspectedIdRef.current = priorState?.id ?? null;
    setInspectedId(priorState?.id ?? null);
    restoreFocusId.current = priorState?.id ?? null;
    if (wasDrilledDistrict) onSubDistrictDrillDownChange?.(null, wasDrilledDistrict);
    onDrillDownChange?.(null, priorState);
  };

  // Shared by the tooltip and the insight panel so the two can never disagree
  // about share or rank — they only differ in which region they describe.
  const toTooltipContext = useCallback((region: PreparedRegion): TooltipContext => {
    const valued = regions.filter((candidate) => candidate.value !== null);
    // Ties share the better rank ("2nd of 36" twice, then 4th), which is what a
    // reader expects from a leaderboard and avoids an arbitrary tiebreak.
    const rank = region.value === null
      ? null
      : valued.filter((candidate) => (candidate.value ?? 0) > (region.value ?? 0)).length + 1;
    return {
      ...region,
      level,
      total,
      share: region.value === null || total === 0 ? null : (region.value / total) * 100,
      rank,
      rankedCount: valued.length,
    };
  }, [level, regions, total]);

  const tooltipContext = useMemo<TooltipContext | null>(
    () => inspected ? toTooltipContext(inspected) : null,
    [inspected, toTooltipContext],
  );
  // Unlike the tooltip, the host-owned insight panel is meant to stay informative
  // when nothing is hovered, so it still falls back to the selected region.
  const insightSource = inspected ?? selected;
  const insightContext = useMemo<InsightContext | null>(() => insightSource
    ? { ...toTooltipContext(insightSource), selected: insightSource.id === selected?.id }
    : null, [insightSource, selected?.id, toTooltipContext]);
  /**
   * Where each region's value label goes, and whether it needs a leader line.
   * Small regions are moved into clear space beside themselves; everything else
   * keeps its number at its centroid.
   */
  const valuePlacements = useMemo(() => {
    const coversAnother = (region: PreparedRegion, at: Point, halfWidth: number, halfHeight: number) => {
      const probes: Point[] = [
        at,
        [at[0] - halfWidth, at[1] - halfHeight],
        [at[0] + halfWidth, at[1] + halfHeight],
        [at[0] + halfWidth, at[1] - halfHeight],
        [at[0] - halfWidth, at[1] + halfHeight],
      ];
      return regions.some((other) => other.id !== region.id && other.partBounds.some(([minX, minY, maxX, maxY]) =>
        probes.some((probe) => probe[0] >= minX && probe[0] <= maxX && probe[1] >= minY && probe[1] <= maxY)));
    };

    return regions.map((region) => {
      const text = region.value === null ? "—" : formatValue(region.value);
      // Glyph metrics without measuring the DOM: the stylesheet sets 11px bold,
      // and digits in that face are close enough to half-em wide for placement.
      const halfWidth = Math.max(text.length * 3.1, 3);
      const halfHeight = 5.5;
      const isSmall = region.extent > 0 && region.extent < SMALL_REGION_EXTENT;
      const fitsInside = region.partBounds.some(([minX, minY, maxX, maxY]) =>
        maxX - minX >= halfWidth * 2 && maxY - minY >= halfHeight * 2);

      if (!isSmall && fitsInside) return { region, text, at: region.centroid as Point, leader: null };

      const outside = isSmall
        ? placeOutsideLabel({
          anchor: region.centroid,
          clearance: Math.max(region.extent, MIN_REGION_MARKER_SIZE) / 2 + 4 + halfWidth,
          halfSize: [halfWidth, halfHeight],
          viewBox: [VIEWBOX.width, VIEWBOX.height],
          centre: [VIEWBOX.width / 2, VIEWBOX.height / 2],
          // Moving a label out only helps if there is open space to move it into.
          // Goa and Puducherry have sea beside them; Delhi is ringed by other
          // states, so its number stays put rather than landing on a neighbour.
          isBlocked: (candidate) => coversAnother(region, candidate, halfWidth, halfHeight),
        })
        : null;

      if (!outside) {
        return fitsInside ? { region, text, at: region.centroid as Point, leader: null } : null;
      }

      const gap = Math.max(region.extent, MIN_REGION_MARKER_SIZE) / 2 + 1;
      const dx = outside[0] - region.centroid[0];
      const dy = outside[1] - region.centroid[1];
      const length = Math.hypot(dx, dy);
      if (length <= gap + halfWidth) return { region, text, at: outside, leader: null };
      return {
        region,
        text,
        at: outside,
        leader: [
          [region.centroid[0] + (dx / length) * gap, region.centroid[1] + (dy / length) * gap],
          [outside[0] - (dx / length) * (halfWidth + 1.5), outside[1] - (dy / length) * (halfWidth + 1.5)],
        ] as [Point, Point],
      };
    }).filter((placement): placement is NonNullable<typeof placement> => placement !== null);
  }, [formatValue, regions]);

  const smallMarkers = useMemo(
    () => regions.filter((region) => region.extent > 0 && region.extent < MIN_REGION_MARKER_SIZE),
    [regions],
  );

  /**
   * A click that reaches the svg itself missed every region path. Either it
   * landed near a small one — Goa, Puducherry, the island groups, all awkward to
   * hit — or it is a click on open sea, which clears the selection.
   */
  const handleBackgroundClick = (event: ReactMouseEvent<SVGSVGElement>) => {
    if (event.target !== event.currentTarget) return; // a region handled it
    // An unlaid-out svg (or a test environment that reports zero-size rects) has
    // no usable coordinates, so the proximity step is skipped — but the click is
    // still a click on the background and must clear the selection.
    const rect = event.currentTarget.getBoundingClientRect();
    const point: Point | null = rect.width > 0 && rect.height > 0
      ? (() => {
        // The svg scales its view box to fit while preserving aspect ratio, so
        // the scale is the smaller ratio and the remainder is centring.
        const scale = Math.min(rect.width / VIEWBOX.width, rect.height / VIEWBOX.height);
        return [
          (event.clientX - rect.left - (rect.width - VIEWBOX.width * scale) / 2) / scale,
          (event.clientY - rect.top - (rect.height - VIEWBOX.height * scale) / 2) / scale,
        ] as Point;
      })()
      : null;

    let nearest: PreparedRegion | null = null;
    if (point) {
      let nearestDistance = Infinity;
      for (const region of regions) {
        if (region.extent <= 0 || region.extent >= SMALL_REGION_EXTENT) continue;
        const distance = distanceToParts(point, region.partBounds);
        if (distance <= SMALL_REGION_CLICK_RADIUS && distance < nearestDistance) {
          nearestDistance = distance;
          nearest = region;
        }
      }
    }
    if (nearest) { activate(nearest); return; }

    onBackgroundClick?.();
    if (activeSelectedId !== null) {
      setActiveSelectedId(null);
      onSelectedChange?.(null, level);
    }
  };

  const canDrill = level === "state" ? Boolean(loadDistricts) : level === "district" ? Boolean(loadSubDistricts) : false;
  const drillActionLabel = level === "state" ? "Activate to view districts." : "Activate to view sub-districts.";
  const regionCanDrill = (id: string) => canDrill && !(level === "district" && leafDistrictIds.has(id));
  const visibleReferenceRegions = level === "state" ? referenceRegions : districtReferenceRegions;
  const mergedReferenceIds = useMemo(() => new Set(referenceOverlayMergeIds), [referenceOverlayMergeIds]);

  useEffect(() => { onInsight?.(insightContext); }, [insightContext, onInsight]);

  // Nudge the anchored tooltip back inside the map. This runs in a layout effect,
  // not an effect, so the un-nudged position never paints — that one frame would be
  // a visible jump on exactly the edge regions this exists to fix. Keyed on the
  // content, not just the region, because the box is sized by what's in it.
  useLayoutEffect(() => {
    const anchor = tooltipAnchorRef.current;
    const canvas = canvasRef.current;
    if (!anchor || !canvas) return;

    // Measure the default placement (centered, above), so the correction is
    // computed against a known starting point rather than the last region's.
    anchor.style.removeProperty("--india-map-tooltip-dx");
    anchor.style.removeProperty("--india-map-tooltip-dy");

    const tooltipRect = anchor.getBoundingClientRect();
    const boundsRect = canvas.getBoundingClientRect();
    if (tooltipRect.width === 0 || boundsRect.width === 0) return; // not laid out (hidden, or jsdom)

    const { dx, side } = placeTooltip(tooltipRect, boundsRect, TOOLTIP_GAP_PX);
    if (dx !== 0) anchor.style.setProperty("--india-map-tooltip-dx", `${Math.round(dx)}px`);
    if (side === "below") anchor.style.setProperty("--india-map-tooltip-dy", `${TOOLTIP_GAP_PX}px`);
  }, [tooltipContext?.id, tooltipContext?.value, tooltipContext?.label, renderTooltip]);

  return (
    <section className={["india-choropleth", !interactive && "india-choropleth--static", className].filter(Boolean).join(" ")} aria-busy={loadingState || loadingDistrict ? "true" : undefined}>
      {showBreadcrumb ? (
        <div className="india-choropleth__toolbar">
          <nav className="india-choropleth__breadcrumb" aria-label="Map hierarchy">
            {drilledState
              ? <button className="india-choropleth__back" type="button" onClick={goToStates}>All states</button>
              : <span>All states</span>}
            {drilledState ? (
              <>
                <span aria-hidden="true">/</span>
                {/* The state is a link back only once there is a level below it to
                    come back from; on the district view it is where you already are. */}
                {isSubDrillRequested
                  ? <button className="india-choropleth__back" type="button" onClick={goBack}>{drilledState.label}</button>
                  : <span aria-current="page">{drilledState.label}</span>}
              </>
            ) : null}
            {isSubDrillRequested && drilledDistrict ? (
              <><span aria-hidden="true">/</span><span aria-current="page">{drilledDistrict.label}</span></>
            ) : null}
          </nav>
        </div>
      ) : null}
      <div ref={canvasRef} className="india-choropleth__canvas" onMouseLeave={interactive ? () => inspect(null) : undefined}>
        {isSubDrillRequested && (!subDistrictLayer || subLoadError) ? (
          <div className="india-choropleth__status" role={subLoadError ? "alert" : "status"}>
            {subLoadError ? subLoadError.message : loadingDistrict ? "Loading sub-districts…" : "Sub-district data is unavailable for this district."}
          </div>
        ) : isDrillRequested && (!districtLayer || loadError) ? (
          <div className="india-choropleth__status" role={loadError ? "alert" : "status"}>
            {loadError ? loadError.message : loadingState ? "Loading districts…" : "District data is unavailable for this state."}
          </div>
        ) : regions.length === 0 ? (
          <div className="india-choropleth__status" role="status">
            {level === "subdistrict" ? "No sub-district data is available for this district." : "No district data is available for this state."}
          </div>
        ) : (
        <svg
          className={`india-choropleth__svg${filterBucket !== null ? " india-choropleth__svg--filtered" : ""}`}
          viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
          role="group"
          aria-label={ariaLabel}
          onKeyDown={interactive ? (event) => { if (event.key === "Escape") { event.preventDefault(); inspect(null); } } : undefined}
          onClick={interactive ? handleBackgroundClick : undefined}
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
                    fill={referenceOverlayFill === "solid" ? "var(--india-map-reference-bg)" : `url(#${hatchId})`}
                    aria-label={`${region.label}.${region.description ? ` ${region.description}` : ""}`}
                    role="img"
                  />
                ))}
              </g>
            </>
          ) : null}
          {/* Hit areas for scattered regions, first so that every real outline is
              painted on top of them: the hull spanning Lakshadweep's islands is
              open sea, but Puducherry's spans the Tamil Nadu coast, and a hull
              must never take a pointer from a region that is actually there.
              Not focusable — keyboard focus has no coordinates, so the one tab
              stop stays on the region itself. */}
          {interactive ? (
            <g className="india-choropleth__hit-areas" aria-hidden="true">
              {regions.filter((region) => region.hitPath).map((region) => (
                <path
                  key={region.id}
                  d={region.hitPath!}
                  fill="none"
                  pointerEvents="all"
                  tabIndex={-1}
                  onMouseEnter={() => inspect(region)}
                  onMouseLeave={() => inspect(null)}
                  onClick={() => activate(region)}
                />
              ))}
            </g>
          ) : null}
          {regions.map((region) => {
            const isInspected = region.id === inspected?.id;
            const isSelected = region.id === selected?.id;
            const action = regionCanDrill(region.id) ? drillActionLabel : "Activate to select.";
            const textValue = region.value === null ? "No data" : formatValue(region.value);
            return (
              <path
                key={region.id}
                className={`india-choropleth__region${isInspected ? " india-choropleth__region--inspected" : ""}${isSelected ? " india-choropleth__region--selected" : ""}${mergedReferenceIds.has(region.id) ? " india-choropleth__region--reference-merged" : ""}${isDimmed(region.id) ? " india-choropleth__dimmed" : ""}`}
                d={region.path}
                fill={colorFor(region.value, region, min, max, colorScale)}
                tabIndex={interactive ? 0 : -1}
                role={interactive ? "button" : undefined}
                aria-label={`${region.label}, ${textValue}. ${action}`}
                aria-pressed={interactive ? isSelected : undefined}
                aria-describedby={isInspected ? tooltipId : undefined}
                ref={(element) => { pathRefs.current[region.id] = element; }}
                onMouseEnter={interactive ? () => inspect(region) : undefined}
                // The canvas is much wider than the drawn map, so leaving a region
                // usually lands on blank canvas rather than leaving the canvas at all.
                // Without this the last-hovered tooltip stays pinned indefinitely.
                // Moving straight to a sibling region dispatches this leave and that
                // region's enter from the same native event, so the tooltip switches
                // in one batch instead of blanking.
                onMouseLeave={interactive ? () => inspect(null) : undefined}
                onFocus={interactive ? () => inspect(region) : undefined}
                // Tabbing to a sibling region re-inspects it synchronously right after
                // this fires, so clearing here only matters when focus leaves the map.
                onBlur={interactive ? () => inspect(null) : undefined}
                onClick={interactive ? () => activate(region) : undefined}
                onKeyDown={interactive ? (event) => {
                  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(region); }
                } : undefined}
              />
            );
          })}
          {/* A region whose largest part is smaller than the marker is invisible at
              this scale — Puducherry's enclaves are a couple of units — so it gets
              a dot in its own colour instead of nothing at all. The dot takes the
              pointer as well: it is painted over whatever is beneath it, so it is
              what the reader sees and aims at, and the outline it stands in for is
              too small to hover. Focus stays on the region path, its one tab stop. */}
          {smallMarkers.length > 0 ? (
            <g className="india-choropleth__small-markers" aria-hidden="true">
              {smallMarkers.map((region) => (
                <circle
                  key={region.id}
                  className={isDimmed(region.id) ? "india-choropleth__dimmed" : undefined}
                  cx={region.centroid[0]}
                  cy={region.centroid[1]}
                  r={MIN_REGION_MARKER_SIZE / 2}
                  fill={colorFor(region.value, region, min, max, colorScale)}
                  onMouseEnter={interactive ? () => inspect(region) : undefined}
                  onMouseLeave={interactive ? () => inspect(null) : undefined}
                  onClick={interactive ? () => activate(region) : undefined}
                />
              ))}
            </g>
          ) : null}
          {showRegionValues ? (
            <>
              <g className="india-choropleth__value-leaders" aria-hidden="true">
                {valuePlacements.filter((p) => p.leader).map((p) => (
                  <line
                    key={p.region.id}
                    className={isDimmed(p.region.id) ? "india-choropleth__dimmed" : undefined}
                    x1={p.leader![0][0]} y1={p.leader![0][1]} x2={p.leader![1][0]} y2={p.leader![1][1]}
                  />
                ))}
              </g>
              <g className={`india-choropleth__region-values${level === "state" ? "" : " india-choropleth__region-values--district"}`} aria-hidden="true">
                {valuePlacements.map((p) => (
                  <text
                    key={p.region.id}
                    className={isDimmed(p.region.id) ? "india-choropleth__dimmed" : undefined}
                    x={p.at[0]} y={p.at[1]} textAnchor="middle" dominantBaseline="central"
                  >
                    {p.text}
                  </text>
                ))}
              </g>
            </>
          ) : null}
          {visibleReferenceRegions.length > 0 ? (
            <g className="india-choropleth__reference-outline" aria-hidden="true">
              {visibleReferenceRegions.map((region) => <path key={region.id} d={region.path} fill="none" />)}
            </g>
          ) : null}
          {/* Selection is drawn as a ring on top of everything, rather than by recoloring
              the region: on a choropleth the fill *is* the data, so overwriting it made the
              selected region's color stop meaning anything. Hovering a region lifts it 2px,
              so the ring matches that lift when the selected region is also the inspected
              one — otherwise the fill slides out from under its own outline. */}
          {selected ? (
            <g
              className={`india-choropleth__selection${selected.id === inspected?.id ? " india-choropleth__selection--lifted" : ""}`}
              aria-hidden="true"
            >
              <path className="india-choropleth__selection-halo" d={selected.path} fill="none" />
              <path className="india-choropleth__selection-ring" d={selected.path} fill="none" />
            </g>
          ) : null}
        </svg>
        )}
        {tooltipContext && regions.length > 0 ? (
          <div ref={tooltipAnchorRef} className="india-choropleth__tooltip-anchor" style={{ left: `${(inspected!.centroid[0] / VIEWBOX.width) * 100}%`, top: `${(inspected!.centroid[1] / VIEWBOX.height) * 100}%` }}>
            {/* Deliberately not `role="status"`. As a live region it re-announced the whole
                tooltip on every hover *and* every focus move, and the content is richer now.
                The region aria-label already carries label + value, and `aria-describedby`
                reads this box out on focus — once, on demand. */}
            <div id={tooltipId} className="india-choropleth__tooltip">
              {renderTooltip ? renderTooltip(tooltipContext) : defaultTooltip(tooltipContext, formatValue)}
            </div>
          </div>
        ) : null}
      </div>
      {showLegend ? (
        <div
          className="india-choropleth__legend"
          role="group"
          aria-label={`Color scale: ${legendLabels[0]} to ${legendLabels[1]} values`}
          onKeyDown={interactive ? (event) => { if (event.key === "Escape") { event.preventDefault(); setActiveBucket(null); } } : undefined}
        >
          <span>{legendLabels[0]}</span><div className="india-choropleth__swatches" aria-hidden={interactive ? undefined : true}>
            {/* Each swatch filters the map to its own band. An empty band is left
                as a swatch you can still read — silently skipping it would hide
                the fact that the ramp has a gap there — but it does nothing,
                because filtering to nothing just dims the whole map. */}
            {buckets.map((bucket) => interactive ? (
              <button
                key={bucket.index}
                type="button"
                className={`india-choropleth__swatch${filterBucket === bucket.index ? " india-choropleth__swatch--active" : ""}${filterBucket !== null && filterBucket !== bucket.index ? " india-choropleth__swatch--muted" : ""}`}
                style={{ backgroundColor: bucket.color }}
                aria-pressed={filterBucket === bucket.index}
                aria-disabled={bucket.matches === 0 ? true : undefined}
                aria-label={legendBucketLabel(bucket, formatValue)}
                // Sighted readers get the same sentence the accessible name carries,
                // which is the only place an empty band explains itself now that it
                // is no longer faded.
                title={legendBucketLabel(bucket, formatValue)}
                onClick={() => {
                  if (bucket.matches === 0) return;
                  setActiveBucket(filterBucket === bucket.index ? null : bucket.index);
                }}
              />
            ) : (
              <i className="india-choropleth__swatch" key={bucket.index} style={{ backgroundColor: bucket.color }} />
            ))}
          </div><span>{legendLabels[1]}</span>
          {visibleReferenceRegions.length > 0 ? <><i className={`india-choropleth__reference-key${referenceOverlayFill === "solid" ? " india-choropleth__reference-key--solid" : ""}`} aria-hidden="true" /><span>{referenceOverlayLegendLabel}</span></> : null}
        </div>
      ) : null}
      {renderInsights ? <aside className="india-choropleth__insights" aria-live="polite">{renderInsights(insightContext)}</aside> : null}
    </section>
  );
}
