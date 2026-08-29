import { geoMercator, geoPath, type GeoProjection } from "d3-geo";
import { asFeatureCollection, totalOf } from "./geometry";
import { legendBucketLabel, legendBuckets, swatchIndexOf, type LegendBucket } from "./legend";
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
  IndiaChoroplethOptions,
  InsightContext,
  MapFeature,
  MapFeatureCollection,
  MapLayer,
  MapRegion,
  ReferenceOverlay,
  TooltipContext,
} from "./types";

const SVG_NS = "http://www.w3.org/2000/svg";
const VIEWBOX = { width: 960, height: 640, padding: 28 };
const DEFAULT_COLORS = ["#d9f1ed", "#b9e3dd", "#8fd1c8", "#5bb9ae", "#2f9c90", "#147b71", "#075b55"] as const;
const DEFAULT_FORMAT = new Intl.NumberFormat("en-IN").format;
// Space between the region centroid and the tooltip edge. Mirrors the .75rem in style.css.
const TOOLTIP_GAP_PX = 12;
// Small-region handling, in view-box units. Mirrors the Dart port's defaults.
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
type Level = "state" | "district" | "subdistrict";

let instanceCounter = 0;

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

/**
 * What the legend shows. A function colour scale has no swatches of its own, so
 * the default ramp stands in and the bands still read low to high.
 */
function legendColorsOf(options: IndiaChoroplethOptions): readonly string[] {
  return typeof options.colorScale === "function" ? DEFAULT_COLORS : (options.colorScale ?? DEFAULT_COLORS);
}

function makeProjection(collection: MapFeatureCollection): GeoProjection {
  return geoMercator().fitExtent(
    [[VIEWBOX.padding, VIEWBOX.padding], [VIEWBOX.width - VIEWBOX.padding, VIEWBOX.height - VIEWBOX.padding]],
    collection,
  );
}

function prepareLayer(layer: MapLayer, projection: GeoProjection, minPartExtent = 0): PreparedRegion[] {
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
    const exaggerated = minPartExtent > 0 && !keepsTrueGeometry(region.id);
    const rings = exaggerated
      ? enlargeSmallParts(projectedRings(feature, projection), minPartExtent)
      : projectedRings(feature, projection);
    const hull = scatteredHitArea(rings, SMALL_REGION_EXTENT);
    // With exaggeration on, the drawn outline has to come from the moved rings
    // rather than d3's path generator, so what is drawn, measured, labelled and
    // clicked are all the same geometry.
    return {
      ...region,
      path: exaggerated ? ringsToPath(rings) : (path(feature) ?? ""),
      hitPath: hull ? ringsToPath([hull]) : null,
      // The largest part's centroid, not the whole feature's: averaging across
      // parts puts an island group's label out at sea between its islands.
      centroid: rings.length > 0
        ? (labelPointFor(rings, centroid.every(Number.isFinite) ? centroid : fallbackCentroid) as [number, number])
        : (centroid.every(Number.isFinite) ? centroid : fallbackCentroid),
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

function defaultTooltip(context: TooltipContext, formatValue: (value: number) => string): Node {
  const fragment = document.createDocumentFragment();
  const strong = document.createElement("strong");
  strong.textContent = context.label;
  const b = document.createElement("b");
  // Same wording as the region's own aria-label, so the two never disagree.
  b.textContent = context.value === null ? "No data" : formatValue(context.value);
  fragment.append(strong, b);

  if (context.share !== null) {
    // A bar makes the share readable at a glance; it repeats the number beside
    // it, so it's decorative and hidden from assistive tech.
    const bar = document.createElement("span");
    bar.className = "india-choropleth__tooltip-bar";
    bar.setAttribute("aria-hidden", "true");
    const fill = document.createElement("span");
    fill.style.width = `${Math.max(context.share, 1.5)}%`;
    bar.append(fill);

    const small = document.createElement("small");
    const parts = [`${context.share.toFixed(1)}% of total`];
    if (context.rank !== null) parts.push(`${ordinal(context.rank)} of ${context.rankedCount}`);
    small.textContent = parts.join(" · ");
    fragment.append(bar, small);
  }
  return fragment;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Record<string, string>): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) node.setAttribute(key, value);
  return node;
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs?: Record<string, string>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs ?? {})) node.setAttribute(key, value);
  return node;
}

function mount(target: Node, content: string | Node) {
  if (typeof content === "string") target.textContent = content;
  else target.appendChild(content);
}

/**
 * A data-agnostic, accessible SVG India map renderer with no framework dependency.
 * Import `bharat-choropleth-js/style.css` once in the host page; data and
 * boundaries intentionally remain separate. Mirrors the React `IndiaChoropleth`
 * component's behavior and CSS classes, so the two are visually interchangeable.
 */
export class IndiaChoropleth {
  private readonly containerEl: HTMLElement;
  private options: IndiaChoroplethOptions;
  private readonly instanceId = `india-choropleth-${++instanceCounter}`;
  private readonly tooltipId = `${this.instanceId}-tooltip`;
  private readonly hatchId = `${this.instanceId}-hatch`;

  private activeDrillDownId: string | null;
  private activeSubDrillDownId: string | null;
  private activeSelectedId: string | null;
  private inspectedId: string | null = null;
  private loadedDistricts: { stateId: string; layer: MapLayer } | null = null;
  private loadedSubDistricts: { districtId: string; layer: MapLayer } | null = null;
  /**
   * Districts the loader has already answered `null` for. The renderer cannot know
   * which districts are leaves without asking, so the first activation asks — but
   * after that the region should stop announcing a level it will not open. Cleared
   * when the loader changes, since a different source may have sub-districts for them.
   */
  private leafDistrictIds = new Set<string>();
  private loadedDistrictReferenceOverlay: { stateId: string; overlay: ReferenceOverlay | null } | null = null;
  private loadingState: string | null = null;
  private loadingDistrict: string | null = null;
  private loadError: Error | null = null;
  private subLoadError: Error | null = null;
  private districtGeneration = 0;
  private subDistrictGeneration = 0;
  private overlayGeneration = 0;
  private restoreFocusId: string | null = null;
  private destroyed = false;
  // Tracks which drill-down id we've already kicked off a load attempt for — including
  // failed ones — so a render triggered by a *failed* load (which leaves `loadedDistricts`
  // null, same as "never loaded") doesn't read as "still needs loading" and retry forever.
  private attemptedDistrictLoadForId: string | null = null;
  private attemptedSubDistrictLoadForId: string | null = null;
  private attemptedOverlayLoadForId: string | null = null;

  private pathRefs = new Map<string, SVGPathElement>();
  private derived!: {
    stateRegions: PreparedRegion[];
    referenceRegions: PreparedReferenceOverlay[];
    drilledState: PreparedRegion | null;
    drilledDistrict: PreparedRegion | null;
    districtRegions: PreparedRegion[];
    level: Level;
    regions: PreparedRegion[];
    visibleReferenceRegions: PreparedReferenceOverlay[];
    selected: PreparedRegion | null;
    inspected: PreparedRegion | null;
    total: number;
    min: number;
    max: number;
    canDrill: boolean;
    mergedReferenceIds: Set<string>;
    /** The ramp described band by band, for the legend's filter controls. */
    buckets: LegendBucket[];
  };

  private rootEl!: HTMLElement;
  private toolbarEl!: HTMLElement;
  private canvasEl!: HTMLElement;
  private legendEl: HTMLElement | null = null;
  private swatchEls: HTMLElement[] = [];
  /** Every element that dulls when a legend band is picked, tagged with its band. */
  private bucketEls: { el: Element; bucket: number | null }[] = [];
  private activeBucket: number | null = null;
  private bandsKey: string | null = null;
  private insightsEl: HTMLElement | null = null;
  private tooltipAnchorEl: HTMLElement | null = null;
  private tooltipContentEl: HTMLElement | null = null;
  private svgRootEl: SVGSVGElement | null = null;
  private selectionGroupEl: SVGGElement | null = null;
  private selectionPathEls: SVGPathElement[] = [];

  constructor(container: HTMLElement | string, options: IndiaChoroplethOptions) {
    const resolved = typeof container === "string" ? document.querySelector<HTMLElement>(container) : container;
    if (!resolved) throw new Error(`IndiaChoropleth: container ${typeof container === "string" ? `"${container}"` : ""} was not found.`);
    this.containerEl = resolved;
    this.options = options;
    this.activeDrillDownId = options.drillDownId !== undefined ? options.drillDownId : (options.defaultDrillDownId ?? null);
    this.activeSubDrillDownId = options.subDistrictDrillDownId !== undefined
      ? options.subDistrictDrillDownId
      : (options.defaultSubDistrictDrillDownId ?? null);
    this.activeSelectedId = options.selectedId !== undefined ? options.selectedId : (options.defaultSelectedId ?? null);
    this.buildShell();
    this.renderStructure();
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  /** Merge new options (e.g. new `states`, controlled `selectedId`/`drillDownId`, callbacks) and re-render. */
  update(next: Partial<IndiaChoroplethOptions>) {
    // A swapped loader should retry for the current drill-down id even if that id
    // itself didn't change (mirrors including the loader in a React effect's deps).
    if ("loadDistricts" in next && next.loadDistricts !== this.options.loadDistricts) this.attemptedDistrictLoadForId = null;
    if ("loadSubDistricts" in next && next.loadSubDistricts !== this.options.loadSubDistricts) {
      this.attemptedSubDistrictLoadForId = null;
      this.leafDistrictIds.clear();
    }
    if ("loadDistrictReferenceOverlay" in next && next.loadDistrictReferenceOverlay !== this.options.loadDistrictReferenceOverlay) this.attemptedOverlayLoadForId = null;
    this.options = { ...this.options, ...next };
    if ("drillDownId" in next && next.drillDownId !== undefined) {
      // A district id means nothing outside the state it came from, so a changed
      // state drops the level below it.
      if (next.drillDownId !== this.activeDrillDownId) this.setActiveSubDrillDownId(null);
      this.activeDrillDownId = next.drillDownId;
    }
    if ("subDistrictDrillDownId" in next && next.subDistrictDrillDownId !== undefined) this.activeSubDrillDownId = next.subDistrictDrillDownId;
    if ("selectedId" in next && next.selectedId !== undefined) this.activeSelectedId = next.selectedId;
    this.renderStructure();
  }

  /** Select a region by id at the current level (does not change drill-down). */
  select(id: string | null) {
    const region = this.derived.regions.find((candidate) => candidate.id === id) ?? null;
    this.setActiveSelectedId(region?.id ?? null);
    if (region) this.options.onSelectedChange?.(region, this.derived.level);
    this.applyInteractionState();
  }

  /**
   * Drill into a state by id, or pass `null` to return to the state view.
   *
   * `null` returns to the national map from any depth — this is the state-level
   * control, not a one-step-up control, so it must not stop at the district view
   * when a sub-district is open.
   */
  drillDown(id: string | null) {
    if (id === null) {
      this.goToStates();
      return;
    }
    const region = this.derived.stateRegions.find((candidate) => candidate.id === id);
    if (!region) return;
    if (id !== this.activeDrillDownId) this.setActiveSubDrillDownId(null);
    this.setActiveDrillDownId(id);
    this.options.onDrillDownChange?.(id, region);
    this.renderStructure();
  }

  /**
   * Drill into a district by id, or pass `null` to return to the district view.
   * Only meaningful while a state is drilled into; the id must be one of that
   * state's districts, which means its layer has to have loaded first.
   */
  drillDownSubDistrict(id: string | null) {
    if (id === null) {
      if (this.derived.level === "subdistrict") this.goBack();
      return;
    }
    const region = this.derived.districtRegions.find((candidate) => candidate.id === id);
    if (!region) return;
    this.setActiveSubDrillDownId(id);
    this.options.onSubDistrictDrillDownChange?.(id, region);
    this.renderStructure();
  }

  getSelected(): MapRegion | null {
    return this.derived.selected;
  }

  getInspected(): MapRegion | null {
    return this.derived.inspected;
  }

  /** Remove all DOM content and cancel any in-flight loads. Call before discarding the instance. */
  destroy() {
    this.destroyed = true;
    this.districtGeneration += 1;
    this.subDistrictGeneration += 1;
    this.overlayGeneration += 1;
    this.pathRefs.clear();
    this.containerEl.textContent = "";
  }

  // ---------------------------------------------------------------------
  // Controlled/uncontrolled state helpers
  // ---------------------------------------------------------------------

  private setActiveDrillDownId(next: string | null) {
    if (this.options.drillDownId === undefined) this.activeDrillDownId = next;
  }

  private setActiveSubDrillDownId(next: string | null) {
    if (this.options.subDistrictDrillDownId === undefined) this.activeSubDrillDownId = next;
  }

  private setActiveSelectedId(next: string | null) {
    if (this.options.selectedId === undefined) this.activeSelectedId = next;
  }

  // ---------------------------------------------------------------------
  // Shell (built once)
  // ---------------------------------------------------------------------

  private buildShell() {
    this.rootEl = el("section");
    this.toolbarEl = el("div", { class: "india-choropleth__toolbar" });
    this.canvasEl = el("div", { class: "india-choropleth__canvas" });
    // canvasEl is persistent across renderCanvas() rebuilds (only its children are
    // replaced), so this listener is attached once here rather than in renderCanvas —
    // attaching it there on every structural render would accumulate a fresh listener
    // per render instead of replacing it.
    this.canvasEl.addEventListener("mouseleave", () => { if (this.options.interactive !== false) this.inspect(null); });
    this.rootEl.append(this.toolbarEl, this.canvasEl);
    this.containerEl.textContent = "";
    this.containerEl.appendChild(this.rootEl);
  }

  // ---------------------------------------------------------------------
  // Derived data + async loads
  // ---------------------------------------------------------------------

  private recompute() {
    const options = this.options;
    const stateCollection = asFeatureCollection(options.states.geometry);
    const referenceCollection = options.referenceOverlay ? asFeatureCollection(options.referenceOverlay.geometry) : null;
    const nationalProjection = makeProjection({
      type: "FeatureCollection",
      features: [...stateCollection.features, ...(referenceCollection?.features ?? [])],
    });
    const stateRegions = prepareLayer(options.states, nationalProjection, options.minPartExtent ?? 0);
    const referenceRegions = options.referenceOverlay ? prepareReferenceOverlay(options.referenceOverlay, nationalProjection) : [];

    const drilledState = stateRegions.find((region) => region.id === this.activeDrillDownId) ?? null;
    const isDrillRequested = Boolean(drilledState && this.activeDrillDownId);

    const districtLayer = this.loadedDistricts?.stateId === this.activeDrillDownId ? this.loadedDistricts.layer : null;
    const districtReferenceOverlay = this.loadedDistrictReferenceOverlay?.stateId === this.activeDrillDownId
      ? this.loadedDistrictReferenceOverlay.overlay
      : null;
    const districtCollection = districtLayer ? asFeatureCollection(districtLayer.geometry) : null;
    const districtReferenceCollection = districtReferenceOverlay ? asFeatureCollection(districtReferenceOverlay.geometry) : null;
    const districtProjection = districtCollection
      ? makeProjection({ type: "FeatureCollection", features: [...districtCollection.features, ...(districtReferenceCollection?.features ?? [])] })
      : null;

    // Districts are prepared whenever their layer is loaded rather than only while
    // they are the visible level, because the district below them has to be
    // resolvable — by id, for the breadcrumb and for the loader — from one level down.
    const districtRegions = districtLayer && districtProjection
      ? prepareLayer(districtLayer, districtProjection, options.minDistrictPartExtent ?? options.minPartExtent ?? 0)
      : [];
    const drilledDistrict = districtRegions.find((region) => region.id === this.activeSubDrillDownId) ?? null;
    const isSubDrillRequested = Boolean(isDrillRequested && drilledDistrict && this.activeSubDrillDownId);
    const level: Level = isSubDrillRequested ? "subdistrict" : isDrillRequested ? "district" : "state";

    const subDistrictLayer = this.loadedSubDistricts?.districtId === this.activeSubDrillDownId ? this.loadedSubDistricts.layer : null;
    const subDistrictCollection = subDistrictLayer ? asFeatureCollection(subDistrictLayer.geometry) : null;
    const subDistrictProjection = subDistrictCollection ? makeProjection(subDistrictCollection) : null;
    // Sub-districts share the district knob rather than adding a fourth: they are
    // drawn at the same zoom as districts and want the same small-part treatment.
    const subDistrictRegions = subDistrictLayer && subDistrictProjection
      ? prepareLayer(subDistrictLayer, subDistrictProjection, options.minDistrictPartExtent ?? options.minPartExtent ?? 0)
      : [];

    const regions = level === "subdistrict" ? subDistrictRegions : level === "district" ? districtRegions : stateRegions;
    const districtReferenceRegions = level === "district" && districtReferenceOverlay && districtProjection
      ? prepareReferenceOverlay(districtReferenceOverlay, districtProjection)
      : [];

    const selected = regions.find((region) => region.id === this.activeSelectedId) ?? null;
    // Hover/focus only — no fallback to `selected`, so the floating tooltip clears
    // when the pointer/focus leaves instead of sticking on the selected region.
    const inspected = regions.find((region) => region.id === this.inspectedId) ?? null;
    if (this.inspectedId && !inspected) this.inspectedId = null;

    const values = regions.map((region) => region.value).filter((value): value is number => value !== null);
    const total = totalOf(values);
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 0;

    this.derived = {
      stateRegions,
      referenceRegions,
      drilledState,
      drilledDistrict,
      districtRegions,
      level,
      regions,
      visibleReferenceRegions: level === "state" ? referenceRegions : districtReferenceRegions,
      selected,
      inspected,
      total,
      min,
      max,
      canDrill: level === "state" ? Boolean(options.loadDistricts) : level === "district" ? Boolean(options.loadSubDistricts) : false,
      mergedReferenceIds: new Set(options.referenceOverlayMergeIds ?? []),
      buckets: legendBuckets(legendColorsOf(options), regions.map((region) => region.value), min, max),
    };
    // Bands come from this level's own min and max, and change with the ramp, so
    // an index picked under one of them means something else under another. Keyed
    // on the ramp's contents rather than its identity, so a host passing a fresh
    // array literal each render doesn't clear the filter out from under the user.
    const bands = [
      level,
      this.activeDrillDownId ?? "",
      this.activeSubDrillDownId ?? "",
      typeof options.colorScale === "function" ? "function" : (options.colorScale ?? DEFAULT_COLORS).join(","),
    ].join("|");
    if (bands !== this.bandsKey) {
      this.bandsKey = bands;
      this.activeBucket = null;
    }
    if (this.activeBucket !== null && this.activeBucket >= this.derived.buckets.length) this.activeBucket = null;
  }

  private loadDistrictsFor(stateId: string) {
    const options = this.options;
    if (!options.loadDistricts) {
      this.loadedDistricts = null;
      this.loadingState = null;
      this.loadError = null;
      return;
    }
    const sourceState = this.derived.stateRegions.find((region) => region.id === stateId);
    if (!sourceState) return;
    const generation = ++this.districtGeneration;
    this.loadingState = stateId;
    this.loadError = null;
    this.loadedDistricts = null;
    options.loadDistricts(stateId, sourceState)
      .then((loaded) => {
        if (this.destroyed || generation !== this.districtGeneration) return;
        this.loadedDistricts = { stateId, layer: loaded };
        this.loadingState = null;
        this.renderStructure();
      })
      .catch((error: unknown) => {
        if (this.destroyed || generation !== this.districtGeneration) return;
        this.loadError = error instanceof Error ? error : new Error("Unable to load districts.");
        this.loadingState = null;
        this.renderStructure();
      });
  }

  private loadSubDistrictsFor(districtId: string) {
    const options = this.options;
    if (!options.loadSubDistricts) {
      this.loadedSubDistricts = null;
      this.loadingDistrict = null;
      this.subLoadError = null;
      return;
    }
    const sourceDistrict = this.derived.districtRegions.find((region) => region.id === districtId);
    // The district layer has not arrived yet, so there is nothing to load from.
    // renderStructure runs again once it does.
    if (!sourceDistrict || !this.activeDrillDownId) return;
    const generation = ++this.subDistrictGeneration;
    this.loadingDistrict = districtId;
    this.subLoadError = null;
    this.loadedSubDistricts = null;
    options.loadSubDistricts(districtId, sourceDistrict, this.activeDrillDownId)
      .then((loaded) => {
        if (this.destroyed || generation !== this.subDistrictGeneration) return;
        this.loadingDistrict = null;
        if (!loaded) {
          // This district is a leaf. Step back to the district view and leave it
          // selected, rather than opening a level with nothing in it.
          this.leafDistrictIds.add(districtId);
          this.setActiveSubDrillDownId(null);
          this.setActiveSelectedId(sourceDistrict.id);
          options.onSubDistrictDrillDownChange?.(null, sourceDistrict);
          this.renderStructure();
          return;
        }
        this.loadedSubDistricts = { districtId, layer: loaded };
        this.renderStructure();
      })
      .catch((error: unknown) => {
        if (this.destroyed || generation !== this.subDistrictGeneration) return;
        this.subLoadError = error instanceof Error ? error : new Error("Unable to load sub-districts.");
        this.loadingDistrict = null;
        this.renderStructure();
      });
  }

  private loadDistrictReferenceOverlayFor(stateId: string) {
    const options = this.options;
    if (!options.loadDistrictReferenceOverlay) {
      this.loadedDistrictReferenceOverlay = null;
      return;
    }
    const sourceState = this.derived.stateRegions.find((region) => region.id === stateId);
    if (!sourceState) return;
    const generation = ++this.overlayGeneration;
    this.loadedDistrictReferenceOverlay = null;
    options.loadDistrictReferenceOverlay(stateId, sourceState)
      .then((overlay) => {
        if (this.destroyed || generation !== this.overlayGeneration) return;
        this.loadedDistrictReferenceOverlay = { stateId, overlay };
        this.renderStructure();
      })
      // Optional reference context must not prevent a usable district data view.
      .catch(() => {
        if (this.destroyed || generation !== this.overlayGeneration) return;
        this.loadedDistrictReferenceOverlay = { stateId, overlay: null };
        this.renderStructure();
      });
  }

  // ---------------------------------------------------------------------
  // Interaction
  // ---------------------------------------------------------------------

  // Mirrors `inspectedId` synchronously so a single gesture that exits both a region
  // and the canvas doesn't report the clear twice. Deliberately limited to redundant
  // clears: re-inspecting the same region must still notify, because focus restoration
  // after breadcrumb-back re-inspects the region `goBack` already primed.
  private inspect(region: PreparedRegion | null) {
    const nextId = region?.id ?? null;
    if (nextId === null && this.inspectedId === null) return;
    this.inspectedId = nextId;
    this.derived.inspected = region;
    this.options.onInspect?.(region ?? null, this.derived.level);
    this.applyInteractionState();
  }

  /** Turn a pointer event into view-box coordinates via the SVG's own matrix. */
  private toViewBox(event: MouseEvent): Point | null {
    const svg = this.canvasEl.querySelector("svg");
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    // The svg scales its view box to fit while preserving aspect ratio, so the
    // scale is the smaller of the two ratios and the rest is centring.
    const scale = Math.min(rect.width / VIEWBOX.width, rect.height / VIEWBOX.height);
    const offsetX = (rect.width - VIEWBOX.width * scale) / 2;
    const offsetY = (rect.height - VIEWBOX.height * scale) / 2;
    return [
      (event.clientX - rect.left - offsetX) / scale,
      (event.clientY - rect.top - offsetY) / scale,
    ];
  }

  /**
   * The nearest small region within the click buffer, or null. Only ever called
   * after every region path has missed, so the buffer fills empty sea and can
   * never take a click that belonged to a neighbouring state.
   */
  private smallRegionNear(point: Point): PreparedRegion | null {
    let best: PreparedRegion | null = null;
    let bestDistance = Infinity;
    for (const region of this.derived.regions) {
      if (region.extent <= 0 || region.extent >= SMALL_REGION_EXTENT) continue;
      const distance = distanceToParts(point, region.partBounds);
      if (distance <= SMALL_REGION_CLICK_RADIUS && distance < bestDistance) {
        bestDistance = distance;
        best = region;
      }
    }
    return best;
  }

  private activate(region: PreparedRegion) {
    const options = this.options;
    options.onRegionClick?.(region, this.derived.level);
    this.setActiveSelectedId(region.id);
    options.onSelectedChange?.(region, this.derived.level);
    if (this.derived.level === "state" && options.loadDistricts) {
      this.setActiveSelectedId(null);
      this.setActiveDrillDownId(region.id);
      options.onDrillDownChange?.(region.id, region);
      this.renderStructure();
      return;
    }
    // A district is a leaf unless the host offers a level below it. Whether this
    // particular district actually has one is only known once the loader answers,
    // so the drill is entered optimistically and stepped back out if it returns null.
    if (this.derived.level === "district" && options.loadSubDistricts && !this.leafDistrictIds.has(region.id)) {
      this.setActiveSelectedId(null);
      this.setActiveSubDrillDownId(region.id);
      options.onSubDistrictDrillDownChange?.(region.id, region);
      this.renderStructure();
      return;
    }
    this.applyInteractionState();
  }

  /** Steps up exactly one level, so the breadcrumb and the back button agree. */
  private goBack() {
    if (this.derived.level === "subdistrict") {
      const priorDistrict = this.derived.drilledDistrict ?? undefined;
      this.setActiveSubDrillDownId(null);
      this.setActiveSelectedId(priorDistrict?.id ?? null);
      this.inspectedId = priorDistrict?.id ?? null;
      this.restoreFocusId = priorDistrict?.id ?? null;
      this.options.onSubDistrictDrillDownChange?.(null, priorDistrict);
      this.renderStructure();
      return;
    }
    this.goToStates();
  }

  /** Jumps straight to the national map from any level. */
  private goToStates() {
    const priorState = this.derived.drilledState ?? undefined;
    const wasDrilledDistrict = this.derived.drilledDistrict ?? undefined;
    this.setActiveSubDrillDownId(null);
    this.setActiveDrillDownId(null);
    this.setActiveSelectedId(priorState?.id ?? null);
    this.inspectedId = priorState?.id ?? null;
    this.restoreFocusId = priorState?.id ?? null;
    if (wasDrilledDistrict) this.options.onSubDistrictDrillDownChange?.(null, wasDrilledDistrict);
    this.options.onDrillDownChange?.(null, priorState);
    this.renderStructure();
  }

  // ---------------------------------------------------------------------
  // Structural render (region set / level changed — safe to rebuild the DOM)
  // ---------------------------------------------------------------------

  private renderStructure() {
    if (this.destroyed) return;
    this.recompute();
    const options = this.options;

    // Kick off any loads the current drill-down state requires before building the
    // canvas below, so `this.loadingState` is already current and the first paint
    // shows "Loading…" rather than a flash of "unavailable" before it catches up.
    // Gated on `attemptedDistrictLoadForId`, not `loadedDistricts`/`loadingState`: a
    // failed load leaves `loadedDistricts` null (same shape as "never loaded"), and
    // gating on that would retrigger the same failing load on every render forever.
    if (this.activeDrillDownId && options.loadDistricts && this.attemptedDistrictLoadForId !== this.activeDrillDownId) {
      this.attemptedDistrictLoadForId = this.activeDrillDownId;
      this.loadDistrictsFor(this.activeDrillDownId);
    }
    if (!this.activeDrillDownId) {
      this.loadedDistricts = null;
      this.loadingState = null;
      this.loadError = null;
      this.attemptedDistrictLoadForId = null;
    }
    if (this.activeDrillDownId && options.loadDistrictReferenceOverlay && this.attemptedOverlayLoadForId !== this.activeDrillDownId) {
      this.attemptedOverlayLoadForId = this.activeDrillDownId;
      this.loadDistrictReferenceOverlayFor(this.activeDrillDownId);
    }
    if (!this.activeDrillDownId || !options.loadDistrictReferenceOverlay) {
      this.loadedDistrictReferenceOverlay = null;
      this.attemptedOverlayLoadForId = null;
    }
    // Same gating as districts, one level down. `loadSubDistrictsFor` returns
    // without doing anything while the district layer is still in flight, so the
    // attempt marker is only claimed once there is a district to load from.
    if (this.activeSubDrillDownId && options.loadSubDistricts && this.attemptedSubDistrictLoadForId !== this.activeSubDrillDownId
      && this.derived.districtRegions.some((region) => region.id === this.activeSubDrillDownId)) {
      this.attemptedSubDistrictLoadForId = this.activeSubDrillDownId;
      this.loadSubDistrictsFor(this.activeSubDrillDownId);
    }
    if (!this.activeSubDrillDownId) {
      this.loadedSubDistricts = null;
      this.loadingDistrict = null;
      this.subLoadError = null;
      this.attemptedSubDistrictLoadForId = null;
    }

    const interactive = options.interactive !== false;
    this.rootEl.className = ["india-choropleth", !interactive && "india-choropleth--static", options.className].filter(Boolean).join(" ");
    if (this.loadingState || this.loadingDistrict) this.rootEl.setAttribute("aria-busy", "true");
    else this.rootEl.removeAttribute("aria-busy");

    this.renderToolbar();
    this.renderCanvas();
    // Legend content only depends on colorScale/legendLabels/reference regions, none
    // of which change on hover — rebuilt here (structural render) rather than from
    // applyInteractionState, so hovering doesn't churn this DOM on every gesture.
    this.renderLegend();

    // Focus is restored onto the region that was just stepped out of, so it waits
    // until the level holding that region is the one being drawn.
    if (this.restoreFocusId && this.derived.regions.some((region) => region.id === this.restoreFocusId)) {
      const id = this.restoreFocusId;
      this.restoreFocusId = null;
      this.pathRefs.get(id)?.focus();
    }
  }

  private renderToolbar() {
    const options = this.options;
    this.toolbarEl.textContent = "";
    if (options.showBreadcrumb === false) return;
    const nav = el("nav", { class: "india-choropleth__breadcrumb", "aria-label": "Map hierarchy" });
    const separator = () => {
      const sep = el("span", { "aria-hidden": "true" });
      sep.textContent = "/";
      return sep;
    };
    if (!this.derived.drilledState) {
      const label = el("span");
      label.textContent = "All states";
      nav.append(label);
      this.toolbarEl.append(nav);
      return;
    }
    const root = el("button", { class: "india-choropleth__back", type: "button" });
    root.textContent = "All states";
    root.addEventListener("click", () => this.goToStates());
    nav.append(root, separator());

    const atSubDistrict = this.derived.level === "subdistrict" && this.derived.drilledDistrict;
    // The state is a link back only once there is a level below it to come back
    // from; on the district view it is where you already are.
    if (atSubDistrict) {
      const stateStep = el("button", { class: "india-choropleth__back", type: "button" });
      stateStep.textContent = this.derived.drilledState.label;
      stateStep.addEventListener("click", () => this.goBack());
      const current = el("span", { "aria-current": "page" });
      current.textContent = this.derived.drilledDistrict!.label;
      nav.append(stateStep, separator(), current);
    } else {
      const current = el("span", { "aria-current": "page" });
      current.textContent = this.derived.drilledState.label;
      nav.append(current);
    }
    this.toolbarEl.append(nav);
  }

  private renderCanvas() {
    const options = this.options;
    const interactive = options.interactive !== false;
    this.canvasEl.textContent = "";
    this.pathRefs.clear();
    this.bucketEls = [];
    this.svgRootEl = null;
    this.tooltipAnchorEl = null;
    this.tooltipContentEl = null;
    this.selectionGroupEl = null;
    this.selectionPathEls = [];

    const isDrillRequested = Boolean(this.derived.drilledState && this.activeDrillDownId);
    const isSubDrillRequested = this.derived.level === "subdistrict";
    const showSubLoadStatus = isSubDrillRequested
      && (!this.loadedSubDistricts || this.loadedSubDistricts.districtId !== this.activeSubDrillDownId || this.subLoadError);
    const showLoadStatus = !showSubLoadStatus && isDrillRequested
      && (!this.loadedDistricts || this.loadedDistricts.stateId !== this.activeDrillDownId || this.loadError);
    const showEmptyStatus = !showSubLoadStatus && !showLoadStatus && this.derived.regions.length === 0;
    if (showSubLoadStatus || showLoadStatus || showEmptyStatus) {
      const failed = (showSubLoadStatus && this.subLoadError) || (showLoadStatus && this.loadError);
      const status = el("div", { class: "india-choropleth__status", role: failed ? "alert" : "status" });
      status.textContent = showSubLoadStatus
        ? this.subLoadError ? this.subLoadError.message
          : this.loadingDistrict ? "Loading sub-districts…" : "Sub-district data is unavailable for this district."
        : showEmptyStatus
          ? isSubDrillRequested ? "No sub-district data is available for this district." : "No district data is available for this state."
          : this.loadError ? this.loadError.message : this.loadingState ? "Loading districts…" : "District data is unavailable for this state.";
      this.canvasEl.append(status);
      this.applyInteractionState();
      return;
    }

    const svg = svgEl("svg", {
      class: "india-choropleth__svg",
      viewBox: `0 0 ${VIEWBOX.width} ${VIEWBOX.height}`,
      role: "group",
      "aria-label": options.ariaLabel ?? "Interactive choropleth map",
    }) as SVGSVGElement;
    this.svgRootEl = svg;
    if (interactive) {
      svg.addEventListener("keydown", (event) => {
        if (event.key === "Escape") { event.preventDefault(); this.inspect(null); }
      });
      // A click that reaches the svg missed every region path. Either it landed
      // near a small one — Goa, Puducherry, the island groups, all awkward to
      // hit — or it is a click on open sea, which clears the selection.
      svg.addEventListener("click", (event) => {
        if (event.target !== svg) return; // a region handled it already
        const point = this.toViewBox(event);
        const nearby = point ? this.smallRegionNear(point) : null;
        if (nearby) { this.activate(nearby); return; }
        this.options.onBackgroundClick?.();
        if (this.activeSelectedId !== null) {
          this.setActiveSelectedId(null);
          this.options.onSelectedChange?.(null, this.derived.level);
          this.applyInteractionState();
        }
      });
    }

    if (this.derived.visibleReferenceRegions.length > 0) {
      const defs = svgEl("defs");
      const pattern = svgEl("pattern", { id: this.hatchId, width: "8", height: "8", patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
      pattern.append(
        svgEl("rect", { width: "8", height: "8", fill: "var(--india-map-reference-bg)" }),
        svgEl("line", { x1: "0", y1: "0", x2: "0", y2: "8", stroke: "var(--india-map-reference-hatch)", "stroke-width": "2" }),
      );
      defs.append(pattern);
      svg.append(defs);

      const referenceFillGroup = svgEl("g", { class: "india-choropleth__reference-fill", role: "group", "aria-label": "Non-statistical reference context." });
      for (const region of this.derived.visibleReferenceRegions) {
        referenceFillGroup.append(svgEl("path", {
          d: region.path,
          fill: options.referenceOverlayFill === "solid" ? "var(--india-map-reference-bg)" : `url(#${this.hatchId})`,
          "aria-label": `${region.label}.${region.description ? ` ${region.description}` : ""}`,
          role: "img",
        }));
      }
      svg.append(referenceFillGroup);
    }

    // Hit areas for scattered regions, appended first so that every real outline
    // is painted on top of them: the hull spanning Lakshadweep's islands is open
    // sea, but Puducherry's spans the Tamil Nadu coast, and a hull must never
    // take a pointer from a region that is actually there. Not focusable —
    // keyboard focus has no coordinates, so the one tab stop stays on the region.
    const scattered = interactive ? this.derived.regions.filter((region) => region.hitPath) : [];
    if (scattered.length > 0) {
      const group = svgEl("g", { class: "india-choropleth__hit-areas", "aria-hidden": "true" });
      for (const region of scattered) {
        const hit = svgEl("path", { d: region.hitPath!, fill: "none", "pointer-events": "all", tabindex: "-1" });
        hit.addEventListener("mouseenter", () => this.inspect(region));
        hit.addEventListener("mouseleave", () => this.inspect(null));
        hit.addEventListener("click", () => this.activate(region));
        group.append(hit);
      }
      svg.append(group);
    }

    const bucketOf = (region: PreparedRegion) =>
      swatchIndexOf(region.value, this.derived.min, this.derived.max, legendColorsOf(options).length);

    for (const region of this.derived.regions) {
      const canDrillHere = this.derived.canDrill
        && !(this.derived.level === "district" && this.leafDistrictIds.has(region.id));
      const action = canDrillHere
        ? this.derived.level === "state" ? "Activate to view districts." : "Activate to view sub-districts."
        : "Activate to select.";
      const textValue = region.value === null ? "No data" : (options.formatValue ?? DEFAULT_FORMAT)(region.value);
      const path = svgEl("path", {
        class: "india-choropleth__region",
        d: region.path,
        fill: colorFor(region.value, region, this.derived.min, this.derived.max, options.colorScale ?? DEFAULT_COLORS),
        tabindex: interactive ? "0" : "-1",
        "aria-label": `${region.label}, ${textValue}. ${action}`,
      });
      if (interactive) path.setAttribute("role", "button");
      if (this.derived.mergedReferenceIds.has(region.id)) path.classList.add("india-choropleth__region--reference-merged");
      if (interactive) {
        path.setAttribute("aria-pressed", region.id === this.derived.selected?.id ? "true" : "false");
        path.addEventListener("mouseenter", () => this.inspect(region));
        // The canvas is much wider than the drawn map, so leaving a region usually
        // lands on blank canvas rather than leaving the canvas at all. Without this
        // the last-hovered tooltip stays pinned indefinitely. Moving straight to a
        // sibling region fires this leave and that region's enter back to back, so
        // the tooltip switches in one step instead of blanking.
        path.addEventListener("mouseleave", () => this.inspect(null));
        path.addEventListener("focus", () => this.inspect(region));
        // Tabbing to a sibling region re-inspects it right after this fires, so
        // clearing here only matters when focus leaves the map entirely.
        path.addEventListener("blur", () => this.inspect(null));
        path.addEventListener("click", () => this.activate(region));
        path.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); this.activate(region); }
        });
      }
      svg.append(path);
      this.pathRefs.set(region.id, path);
      this.bucketEls.push({ el: path, bucket: bucketOf(region) });
    }

    // A region whose largest part is smaller than the marker is invisible at this
    // scale — Puducherry's enclaves are a couple of units — so it gets a dot in
    // its own colour instead of nothing at all. The dot takes the pointer as well:
    // it is painted over whatever is beneath it, so it is what the reader sees and
    // aims at, and the outline it stands in for is too small to hover. Focus stays
    // on the region path, its one tab stop.
    const markers = this.derived.regions.filter((region) => region.extent > 0 && region.extent < MIN_REGION_MARKER_SIZE);
    if (markers.length > 0) {
      const group = svgEl("g", { class: "india-choropleth__small-markers", "aria-hidden": "true" });
      for (const region of markers) {
        const marker = svgEl("circle", {
          cx: String(region.centroid[0]),
          cy: String(region.centroid[1]),
          r: String(MIN_REGION_MARKER_SIZE / 2),
          fill: colorFor(region.value, region, this.derived.min, this.derived.max, options.colorScale ?? DEFAULT_COLORS),
        });
        if (interactive) {
          marker.addEventListener("mouseenter", () => this.inspect(region));
          marker.addEventListener("mouseleave", () => this.inspect(null));
          marker.addEventListener("click", () => this.activate(region));
        }
        this.bucketEls.push({ el: marker, bucket: bucketOf(region) });
        group.append(marker);
      }
      svg.append(group);
    }

    if (options.showRegionValues) {
      const group = svgEl("g", { class: `india-choropleth__region-values${this.derived.level === "state" ? "" : " india-choropleth__region-values--district"}`, "aria-hidden": "true" });
      const leaders = svgEl("g", { class: "india-choropleth__value-leaders", "aria-hidden": "true" });
      for (const region of this.derived.regions) {
        if (!region.centroid.every(Number.isFinite)) continue;
        const text = region.value === null ? "—" : (options.formatValue ?? DEFAULT_FORMAT)(region.value);
        const placement = this.placeRegionValue(region, text);
        if (!placement) continue;

        const node = svgEl("text", { x: String(placement.at[0]), y: String(placement.at[1]), "text-anchor": "middle", "dominant-baseline": "central" });
        node.textContent = text;
        group.append(node);
        this.bucketEls.push({ el: node, bucket: bucketOf(region) });
        if (placement.leader) {
          const leader = svgEl("line", {
            x1: String(placement.leader[0][0]),
            y1: String(placement.leader[0][1]),
            x2: String(placement.leader[1][0]),
            y2: String(placement.leader[1][1]),
          });
          this.bucketEls.push({ el: leader, bucket: bucketOf(region) });
          leaders.append(leader);
        }
      }
      svg.append(leaders, group);
    }

    if (this.derived.visibleReferenceRegions.length > 0) {
      const outlineGroup = svgEl("g", { class: "india-choropleth__reference-outline", "aria-hidden": "true" });
      for (const region of this.derived.visibleReferenceRegions) outlineGroup.append(svgEl("path", { d: region.path, fill: "none" }));
      svg.append(outlineGroup);
    }

    // Selection is drawn as a ring on top of everything, rather than by recoloring
    // the region: on a choropleth the fill *is* the data, so overwriting it made the
    // selected region's color stop meaning anything. A separate overlay (instead of
    // re-appending the region path) keeps it above later-drawn neighbours without
    // moving a node that may currently hold focus. Halo first, then the accent ring,
    // so the ring stays legible on both pale and saturated fills.
    const selectionGroup = svgEl("g", { class: "india-choropleth__selection", "aria-hidden": "true" });
    const selectionHalo = svgEl("path", { class: "india-choropleth__selection-halo", fill: "none" });
    const selectionRing = svgEl("path", { class: "india-choropleth__selection-ring", fill: "none" });
    selectionGroup.append(selectionHalo, selectionRing);
    svg.append(selectionGroup);
    this.selectionGroupEl = selectionGroup;
    this.selectionPathEls = [selectionHalo, selectionRing];

    this.canvasEl.append(svg);

    const anchor = el("div", { class: "india-choropleth__tooltip-anchor" });
    anchor.style.display = "none";
    // Deliberately not `role="status"`. As a live region it re-announced the whole
    // tooltip on every hover *and* every focus move, and the content is richer now.
    // The region's own aria-label already carries label + value, and `aria-describedby`
    // (set in applyInteractionState) reads this box out on focus — once, on demand.
    const tooltip = el("div", { id: this.tooltipId, class: "india-choropleth__tooltip" });
    anchor.append(tooltip);
    this.canvasEl.append(anchor);
    this.tooltipAnchorEl = anchor;
    this.tooltipContentEl = tooltip;

    this.applyInteractionState();
  }

  /**
   * Where a region's value label goes, and whether it needs a leader line back
   * to the region. Small regions are moved into clear space beside themselves;
   * everything else keeps its number at its centroid.
   */
  private placeRegionValue(
    region: PreparedRegion,
    text: string,
  ): { at: Point; leader?: [Point, Point] } | null {
    const isSmall = region.extent > 0 && region.extent < SMALL_REGION_EXTENT;
    // Glyph metrics without measuring the DOM: the stylesheet sets 11px bold, and
    // digits in that face are close enough to half-em wide for placement.
    const halfWidth = Math.max(text.length * 3.1, 3);
    const halfHeight = 5.5;
    const fitsInside = region.partBounds.some(([minX, minY, maxX, maxY]) =>
      maxX - minX >= halfWidth * 2 && maxY - minY >= halfHeight * 2);

    if (!isSmall && fitsInside) return { at: region.centroid };

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
        isBlocked: (candidate) => this.coversAnotherRegion(region, candidate, halfWidth, halfHeight),
      })
      : null;

    if (!outside) return fitsInside ? { at: region.centroid } : null;

    const gap = Math.max(region.extent, MIN_REGION_MARKER_SIZE) / 2 + 1;
    const dx = outside[0] - region.centroid[0];
    const dy = outside[1] - region.centroid[1];
    const length = Math.hypot(dx, dy);
    if (length <= gap + halfWidth) return { at: outside };
    const start: Point = [region.centroid[0] + (dx / length) * gap, region.centroid[1] + (dy / length) * gap];
    const end: Point = [outside[0] - (dx / length) * (halfWidth + 1.5), outside[1] - (dy / length) * (halfWidth + 1.5)];
    return { at: outside, leader: [start, end] };
  }

  /** True when a label centred here would sit on top of a different region. */
  private coversAnotherRegion(region: PreparedRegion, at: Point, halfWidth: number, halfHeight: number): boolean {
    const corners: Point[] = [
      at,
      [at[0] - halfWidth, at[1] - halfHeight],
      [at[0] + halfWidth, at[1] + halfHeight],
      [at[0] + halfWidth, at[1] - halfHeight],
      [at[0] - halfWidth, at[1] + halfHeight],
    ];
    for (const other of this.derived.regions) {
      if (other.id === region.id) continue;
      for (const corner of corners) {
        // A part's box is a cheap over-approximation of its outline; erring
        // toward "blocked" keeps a number off a neighbour, which is the point.
        if (other.partBounds.some(([minX, minY, maxX, maxY]) =>
          corner[0] >= minX && corner[0] <= maxX && corner[1] >= minY && corner[1] <= maxY)) return true;
      }
    }
    return false;
  }

  private renderLegend() {
    const options = this.options;
    if (this.legendEl) { this.legendEl.remove(); this.legendEl = null; }
    if (options.showLegend === false) return;
    const [lower, higher] = options.legendLabels ?? ["Lower", "Higher"];
    const legend = el("div", { class: "india-choropleth__legend", role: "group", "aria-label": `Color scale: ${lower} to ${higher} values` });
    const lowerSpan = el("span");
    lowerSpan.textContent = lower;
    const interactive = options.interactive !== false;
    const swatches = el("div", { class: "india-choropleth__swatches" });
    if (!interactive) swatches.setAttribute("aria-hidden", "true");
    this.swatchEls = [];
    // Each swatch filters the map to its own band. An empty band is left as a
    // swatch you can still read — silently skipping it would hide the fact that
    // the ramp has a gap there — but it does nothing, because filtering to
    // nothing just dims the whole map. Pressed state is read from the current
    // filter as the buttons are built: a structural re-render rebuilds this DOM,
    // and the map underneath keeps whatever band was already picked.
    for (const bucket of this.derived.buckets) {
      const swatch = el(interactive ? "button" : "i", { class: "india-choropleth__swatch" });
      swatch.style.backgroundColor = bucket.color;
      if (interactive) {
        swatch.setAttribute("type", "button");
        const description = legendBucketLabel(bucket, options.formatValue ?? DEFAULT_FORMAT);
        swatch.setAttribute("aria-label", description);
        // Sighted readers get the same sentence, which is the only place an empty
        // band explains itself now that it is no longer faded.
        swatch.setAttribute("title", description);
        if (bucket.matches === 0) swatch.setAttribute("aria-disabled", "true");
        swatch.addEventListener("click", () => {
          if (bucket.matches === 0) return;
          this.activeBucket = this.activeBucket === bucket.index ? null : bucket.index;
          this.applyInteractionState();
        });
        this.swatchEls.push(swatch);
      }
      swatches.append(swatch);
    }
    const higherSpan = el("span");
    higherSpan.textContent = higher;
    legend.append(lowerSpan, swatches, higherSpan);
    if (this.derived.visibleReferenceRegions.length > 0) {
      const key = el("i", { class: `india-choropleth__reference-key${options.referenceOverlayFill === "solid" ? " india-choropleth__reference-key--solid" : ""}`, "aria-hidden": "true" });
      const label = el("span");
      label.textContent = options.referenceOverlayLegendLabel ?? "Reference context · data unavailable";
      legend.append(key, label);
    }
    // The insights panel is appended during interaction rendering, which runs
    // before this; inserting ahead of it keeps the order map → legend → insights,
    // matching the React component's JSX order so the two look the same.
    if (this.insightsEl) this.rootEl.insertBefore(legend, this.insightsEl);
    else this.rootEl.append(legend);
    this.legendEl = legend;
    if (interactive) {
      legend.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        this.activeBucket = null;
        this.applyInteractionState();
      });
    }
    this.applyLegendState();
  }

  private renderInsights() {
    const options = this.options;
    if (this.insightsEl) { this.insightsEl.remove(); this.insightsEl = null; }
    if (!options.renderInsights) return;
    const aside = el("aside", { class: "india-choropleth__insights", "aria-live": "polite" });
    options.renderInsights(this.computeInsightContext(), aside);
    this.rootEl.append(aside);
    this.insightsEl = aside;
  }

  // ---------------------------------------------------------------------
  // Lightweight interaction update (hover/focus/selection — never rebuilds the DOM)
  // ---------------------------------------------------------------------

  private applyInteractionState() {
    if (this.destroyed) return;
    this.derived.selected = this.derived.regions.find((region) => region.id === this.activeSelectedId) ?? null;
    this.derived.inspected = this.derived.regions.find((region) => region.id === this.inspectedId) ?? null;
    const interactive = this.options.interactive !== false;

    for (const [id, path] of this.pathRefs) {
      const isInspected = id === this.derived.inspected?.id;
      const isSelected = id === this.derived.selected?.id;
      path.classList.toggle("india-choropleth__region--inspected", isInspected);
      path.classList.toggle("india-choropleth__region--selected", isSelected);
      if (interactive) {
        path.setAttribute("aria-pressed", isSelected ? "true" : "false");
        if (isInspected) path.setAttribute("aria-describedby", this.tooltipId);
        else path.removeAttribute("aria-describedby");
      }
    }

    for (const { el: element, bucket } of this.bucketEls) {
      element.classList.toggle("india-choropleth__dimmed", this.activeBucket !== null && bucket !== this.activeBucket);
    }
    this.svgRootEl?.classList.toggle("india-choropleth__svg--filtered", this.activeBucket !== null);
    this.applyLegendState();

    this.renderSelectionRing();
    this.renderTooltip();
    this.renderInsights();
    this.options.onInsight?.(this.computeInsightContext());
  }

  /**
   * Pressed and muted states for the legend's filter controls. Null-guarded like
   * the selection ring: an interaction can be applied before the legend exists,
   * on the loading and empty branches that return early from rendering.
   */
  private applyLegendState() {
    if (!this.legendEl) return;
    for (const [index, swatch] of this.swatchEls.entries()) {
      const active = this.activeBucket === index;
      swatch.classList.toggle("india-choropleth__swatch--active", active);
      swatch.classList.toggle("india-choropleth__swatch--muted", this.activeBucket !== null && !active);
      swatch.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  private renderTooltip() {
    if (!this.tooltipAnchorEl || !this.tooltipContentEl) return;
    const inspected = this.derived.inspected;
    if (!inspected) {
      this.tooltipAnchorEl.style.display = "none";
      return;
    }
    const context = this.toTooltipContext(inspected);
    this.tooltipAnchorEl.style.display = "";
    this.tooltipAnchorEl.style.left = `${(inspected.centroid[0] / VIEWBOX.width) * 100}%`;
    this.tooltipAnchorEl.style.top = `${(inspected.centroid[1] / VIEWBOX.height) * 100}%`;
    this.tooltipContentEl.textContent = "";
    const rendered = this.options.renderTooltip ? this.options.renderTooltip(context) : defaultTooltip(context, this.options.formatValue ?? DEFAULT_FORMAT);
    mount(this.tooltipContentEl, rendered);
    this.positionTooltip();
  }

  /**
   * Trace the selected region with a ring drawn above every other region. The
   * region keeps its data-driven fill; only the outline says "this one is picked".
   */
  private renderSelectionRing() {
    const group = this.selectionGroupEl;
    if (!group) return;

    const selected = this.derived.selected;
    if (!selected) {
      group.style.display = "none";
      return;
    }
    group.style.display = "";
    for (const path of this.selectionPathEls) path.setAttribute("d", selected.path);

    // Hovering a region lifts it 2px (see .india-choropleth__region). The ring is a
    // separate element, so without matching that lift the fill would slide out from
    // under its own outline the moment you moved back onto the region you clicked.
    group.classList.toggle("india-choropleth__selection--lifted", selected.id === this.derived.inspected?.id);
  }

  /**
   * Nudge the anchored tooltip back inside the map. Measured after mounting
   * because the box is sized by its content, which changes per region.
   */
  private positionTooltip() {
    const anchor = this.tooltipAnchorEl;
    if (!anchor) return;

    // Measure the default placement (centered, above), so the correction is
    // computed against a known starting point rather than the last region's.
    anchor.style.removeProperty("--india-map-tooltip-dx");
    anchor.style.removeProperty("--india-map-tooltip-dy");

    const tooltipRect = anchor.getBoundingClientRect();
    const boundsRect = this.canvasEl.getBoundingClientRect();
    if (tooltipRect.width === 0 || boundsRect.width === 0) return; // not laid out (hidden, or jsdom)

    const { dx, side } = placeTooltip(tooltipRect, boundsRect, TOOLTIP_GAP_PX);
    if (dx !== 0) anchor.style.setProperty("--india-map-tooltip-dx", `${Math.round(dx)}px`);
    if (side === "below") anchor.style.setProperty("--india-map-tooltip-dy", `${TOOLTIP_GAP_PX}px`);
  }

  private toTooltipContext(region: PreparedRegion): TooltipContext {
    const valued = this.derived.regions.filter((candidate) => candidate.value !== null);
    // Ties share the better rank ("2nd of 36" twice, then 4th), which is what a
    // reader expects from a leaderboard and avoids an arbitrary tiebreak.
    const rank =
      region.value === null ? null : valued.filter((candidate) => (candidate.value ?? 0) > (region.value ?? 0)).length + 1;

    return {
      ...region,
      level: this.derived.level,
      total: this.derived.total,
      share: region.value === null || this.derived.total === 0 ? null : (region.value / this.derived.total) * 100,
      rank,
      rankedCount: valued.length,
    };
  }

  private computeInsightContext(): InsightContext | null {
    // Unlike the tooltip, the host-owned insight panel is meant to stay informative
    // when nothing is hovered, so it still falls back to the selected region.
    const source = this.derived.inspected ?? this.derived.selected;
    if (!source) return null;
    return {
      ...this.toTooltipContext(source),
      selected: source.id === this.derived.selected?.id,
    };
  }
}
