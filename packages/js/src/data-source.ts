import type { GeometrySource, MapFeatureCollection } from "./types";
import type { Topology } from "topojson-specification";

/**
 * Where the optional prepared boundary bundles are fetched from when the caller
 * doesn't supply their own `geometry`.
 *
 * The files are *fetched*, never bundled — the package still ships no boundary
 * geometry, and each asset keeps its own source's licence and attribution
 * alongside it (see `data/ATTRIBUTION.md`). The default bundle is
 * `datta07/INDIAN-SHAPEFILES` (MIT):
 *
 * > State/UT boundaries derived from datta07/INDIAN-SHAPEFILES (MIT).
 *
 * Self-host by copying `data/generated/` next to your app and passing
 * `dataBaseUrl: "/maps"`, which is the right call for offline or air-gapped
 * deployments and avoids a third-party CDN request at runtime.
 *
 * The ref is pinned to an immutable tag on purpose. A branch ref (`@main`) is
 * mutable and cached by jsDelivr for hours, so a data change would silently
 * alter — or break — every consumer's map at a time nobody chose. Bump this
 * deliberately, alongside a release.
 */
export const DEFAULT_DATA_BASE_URL = "https://cdn.jsdelivr.net/gh/shashankbudem/bharat-choropleth@v0.1.0/data/generated";

export const ATTRIBUTION = "State/UT, district and sub-district boundaries derived from datta07/INDIAN-SHAPEFILES (MIT).";

/** Anything `geometry` accepts: inline data, a URL to fetch, or a promise of either. */
export type GeometryInput = GeometrySource | string | Promise<GeometrySource | Topology | MapFeatureCollection>;

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function statesUrl(baseUrl: string): string {
  return `${trimTrailingSlash(baseUrl)}/current-2019-states/states.topo.json`;
}

export function districtsUrl(baseUrl: string, stateId: string): string {
  return `${trimTrailingSlash(baseUrl)}/current-2019-districts/districts/${stateId}.topo.json`;
}

export function subDistrictsUrl(baseUrl: string, districtId: string): string {
  return `${trimTrailingSlash(baseUrl)}/current-2019-subdistricts/subdistricts/${districtId}.topo.json`;
}

async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  if (typeof fetch !== "function") {
    throw new Error(
      "BharatChoropleth: no global fetch is available, so boundary data cannot be downloaded. Pass `geometry` with data you loaded yourself.",
    );
  }
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(
      `BharatChoropleth: failed to load boundary data from ${url} (HTTP ${response.status}). ` +
        "Set `dataBaseUrl` to your own copy of data/generated, or pass `geometry` directly.",
    );
  }
  return response.json();
}

/**
 * Normalize a parsed payload into a `GeometrySource`. Accepts a raw TopoJSON
 * topology (the shape our own bundles have — the named object is picked for the
 * caller), a `{ topology, object }` pair, or a plain GeoJSON FeatureCollection.
 */
export function toGeometrySource(payload: unknown, preferredObject: string): GeometrySource {
  if (!payload || typeof payload !== "object") {
    throw new Error("BharatChoropleth: boundary data must be TopoJSON or a GeoJSON FeatureCollection.");
  }
  const candidate = payload as Record<string, unknown>;

  if (candidate.type === "FeatureCollection") return payload as MapFeatureCollection;
  if ("topology" in candidate && "object" in candidate) return payload as GeometrySource;

  if (candidate.type === "Topology" && candidate.objects && typeof candidate.objects === "object") {
    const objects = candidate.objects as Record<string, unknown>;
    const object = preferredObject in objects ? preferredObject : Object.keys(objects)[0];
    if (!object) throw new Error("BharatChoropleth: the TopoJSON topology contains no objects.");
    return { topology: payload as Topology, object };
  }

  throw new Error("BharatChoropleth: boundary data must be TopoJSON or a GeoJSON FeatureCollection.");
}

/** Resolve whichever form of `geometry` the caller passed into usable geometry. */
export async function resolveGeometry(
  input: GeometryInput,
  preferredObject: string,
  signal?: AbortSignal,
): Promise<GeometrySource> {
  if (typeof input === "string") return toGeometrySource(await fetchJson(input, signal), preferredObject);
  if (input instanceof Promise) return toGeometrySource(await input, preferredObject);
  return input;
}

/** True for geometry that is already in hand, so the map can render synchronously. */
export function isInlineGeometry(input: GeometryInput | undefined): input is GeometrySource {
  return typeof input === "object" && input !== null && !(input instanceof Promise);
}

export async function loadDistrictTopology(
  baseUrl: string,
  stateId: string,
  signal?: AbortSignal,
): Promise<GeometrySource> {
  return toGeometrySource(await fetchJson(districtsUrl(baseUrl, stateId), signal), "districts");
}

/**
 * Sub-districts for one district, or `null` where the bundle has no file for it.
 *
 * A missing file is the bundle's way of saying a district has no sub-district
 * level — three of the 788 current districts are in that position, and the
 * prepared bundle deliberately ships no asset for them. So a 404 resolves to
 * `null` (the district is a leaf) rather than raising, while any other failure
 * still surfaces as an error the map can report.
 */
export async function loadSubDistrictTopology(
  baseUrl: string,
  districtId: string,
  signal?: AbortSignal,
): Promise<GeometrySource | null> {
  const url = subDistrictsUrl(baseUrl, districtId);
  if (typeof fetch !== "function") {
    throw new Error(
      "BharatChoropleth: no global fetch is available, so boundary data cannot be downloaded. Pass `geometry` with data you loaded yourself.",
    );
  }
  const response = await fetch(url, { signal });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `BharatChoropleth: failed to load boundary data from ${url} (HTTP ${response.status}). ` +
        "Set `dataBaseUrl` to your own copy of data/generated, or pass `geometry` directly.",
    );
  }
  return toGeometrySource(await response.json(), "subdistricts");
}
