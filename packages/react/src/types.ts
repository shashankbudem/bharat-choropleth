import type { Feature, FeatureCollection, Geometry, GeoJsonProperties } from "geojson";
import type { GeometryObject, Topology } from "topojson-specification";
import type { ReactNode } from "react";

/** A GeoJSON feature as consumed by the renderer. Keep properties data-provider defined. */
export type MapFeature = Feature<Geometry, GeoJsonProperties>;
export type MapFeatureCollection = FeatureCollection<Geometry, GeoJsonProperties>;

/**
 * A layer can be plain GeoJSON, or TopoJSON plus the named object to unpack.
 * Boundary data intentionally remains outside this package.
 */
export type GeometrySource =
  | MapFeatureCollection
  | { topology: Topology; object: string | GeometryObject };

export type ColorScale = readonly string[] | ((value: number | null, context: ColorContext) => string);

export interface ColorContext {
  min: number;
  max: number;
  feature: MapFeature;
  id: string;
}

export interface MapLayer {
  /** GeoJSON or TopoJSON data for precisely this map level. */
  geometry: GeometrySource;
  /** Stable ID. Use LGD codes (not display names) for India boundary data. */
  getId: (feature: MapFeature) => string;
  /** Human-readable text used by labels and the default tooltip. */
  getLabel: (feature: MapFeature) => string;
  /** Return null for intentionally missing data. */
  getValue: (feature: MapFeature) => number | null;
  /** Optional change/secondary metric for render slots; never rendered by default. */
  getMeta?: (feature: MapFeature) => Record<string, unknown> | undefined;
}

/**
 * Non-statistical geometry shown only on the national map, for example a
 * reference outline or claimed area that must not inherit choropleth values.
 * It has no value accessor by design, so it can never inherit statistical data.
 */
export interface ReferenceOverlay {
  geometry: GeometrySource;
  getId: (feature: MapFeature) => string;
  getLabel: (feature: MapFeature) => string;
  /**
   * Required accessible context, such as “National reference outline; hatched
   * portions outside the statistical layer have no data.” The renderer uses it
   * verbatim and does not infer status for the entire geometry.
   */
  getDescription: (feature: MapFeature) => string;
}

export interface MapRegion {
  id: string;
  label: string;
  value: number | null;
  meta?: Record<string, unknown>;
  feature: MapFeature;
}

export interface TooltipContext extends MapRegion {
  level: "state" | "district";
  total: number;
  share: number | null;
  /** 1-based position among regions that have a value, highest first. Null when this region has no value. */
  rank: number | null;
  /** How many regions at this level have a value — the denominator for `rank`. */
  rankedCount: number;
}

export interface InsightContext extends TooltipContext {
  selected: boolean;
}

export type DistrictLoader = (stateId: string, state: MapRegion) => Promise<MapLayer>;
/** Lazily provides non-statistical context geometry for a selected state's district map. */
export type DistrictReferenceOverlayLoader = (stateId: string, state: MapRegion) => Promise<ReferenceOverlay | null>;

export interface IndiaChoroplethProps {
  /** State/UT layer. The library does not bundle any geographic boundaries. */
  states: MapLayer;
  /**
   * Optional non-statistical national geometry, rendered as a neutral hatch.
   * It never receives a choropleth value, click handler, selection, or drill-down.
   */
  referenceOverlay?: ReferenceOverlay;
  /** Called only after a state is requested, so district geometry can be code-split. */
  loadDistricts?: DistrictLoader;
  /**
   * Optional lazy non-statistical context geometry for a district view. It is
   * keyed to the drilled state, cancelled safely on navigation, and rendered
   * only with that state's districts.
   */
  loadDistrictReferenceOverlay?: DistrictReferenceOverlayLoader;
  /** Controlled state drill-down. Use null for the state map. */
  drillDownId?: string | null;
  /** Initial state drill-down when uncontrolled. */
  defaultDrillDownId?: string | null;
  onDrillDownChange?: (stateId: string | null, state?: MapRegion) => void;
  /** Controlled selected feature (state ID on national level; district ID when drilled in). */
  selectedId?: string | null;
  defaultSelectedId?: string | null;
  /** Fires with null when a click on open sea clears the selection. */
  onSelectedChange?: (region: MapRegion | null, level: "state" | "district") => void;
  /** Fires for hover and keyboard focus with the same shape payload. */
  onInspect?: (region: MapRegion | null, level: "state" | "district") => void;
  /** Receives tooltip-ready data, including the current scope total and share. */
  onInsight?: (context: InsightContext | null) => void;
  /** Receives every activation before state drill-down / district selection. */
  onRegionClick?: (region: MapRegion, level: "state" | "district") => void;
  /**
   * Called for a click that hit no region and was not close enough to a small
   * one. The component also clears its own uncontrolled selection on such a
   * click, so clicking the sea drops the selection ring.
   */
  onBackgroundClick?: () => void;
  /** Colors are data-driven; strings work as an ordered low-to-high ramp. */
  colorScale?: ColorScale;
  /** Format both tooltip and legend values. */
  formatValue?: (value: number) => string;
  renderTooltip?: (context: TooltipContext) => ReactNode;
  renderInsights?: (context: InsightContext | null) => ReactNode;
  /**
   * Map-level visual chrome can be independently disabled/composed.
   *
   * On an interactive map the legend is also a filter: each swatch highlights
   * the regions painted in it and dulls the rest, picked again or Escape to
   * clear. A swatch with nothing in it is inert. Set `interactive: false` for a
   * legend that is a key and nothing more.
   */
  showLegend?: boolean;
  showBreadcrumb?: boolean;
  legendLabels?: readonly [lower: string, higher: string];
  /** Label paired with the neutral hatch in either map-level legend. */
  referenceOverlayLegendLabel?: string;
  /** State IDs whose statistical fill should visually merge with the reference overlay. */
  referenceOverlayMergeIds?: readonly string[];
  /** Render the non-statistical reference geometry as a hatch or neutral solid fill. */
  referenceOverlayFill?: "hatch" | "solid";
  /** Show formatted values at region centroids. */
  showRegionValues?: boolean;
  /**
   * Grow any part smaller than this (view-box units) about its own centre, so it
   * can be seen and clicked. Off by default.
   *
   * An archipelago cannot be drawn to scale and still be usable: Lakshadweep's
   * islands are one to two kilometres across and spread over 250, so even
   * drilled into they are a few pixels each. This trades exact size for
   * visibility, keeping every part in its true position; growth is capped so a
   * speck never reads as a real landmass.
   *
   * Regions with nowhere to grow into are left at their true size regardless —
   * Puducherry is enclaves inside Tamil Nadu, and growing them would put a
   * Puducherry of the wrong shape in the wrong place. Those fall back to the
   * marker dot, which is a pointer target in its own right.
   */
  minPartExtent?: number;
  className?: string;
  ariaLabel?: string;
  /** Set false where a host app provides its own keyboard focus management. */
  interactive?: boolean;
}
