import { IndiaChoropleth } from "./IndiaChoropleth";
import { asFeatureCollection } from "./geometry";
import {
  DEFAULT_DATA_BASE_URL,
  isInlineGeometry,
  loadDistrictTopology,
  resolveGeometry,
  statesUrl,
  type GeometryInput,
} from "./data-source";
import { normalizeStateKey, resolveState } from "./states";
import type { ColorScale, GeometrySource, IndiaChoroplethOptions, MapFeature, MapLayer, MapRegion } from "./types";

/**
 * `map.font_color = "maroon"` should set the option, not be mistaken for a state
 * named "font color". Snake_case is a natural way to write these from a plain
 * script, so any snake_case name whose camelCase form is a real property on the
 * instance (`font_color` → `fontColor`, `color_scale` → `colorScale`, ...) is
 * redirected there before the state-value fallback ever sees it.
 */
function optionAlias(prop: string, target: object): string | undefined {
  if (!prop.includes("_")) return undefined;
  const camel = prop.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
  return camel !== prop && camel in target ? camel : undefined;
}

/** Duck-typed so elements from another document/iframe still count as containers. */
function isElement(value: unknown): value is HTMLElement {
  return typeof value === "object" && value !== null && (value as Node).nodeType === 1;
}

/** Containers tried, in order, when no container is passed at all. */
const FALLBACK_CONTAINER_SELECTORS = ["#bharat-choropleth", "#map"];

export interface BharatChoroplethOptions extends Omit<IndiaChoroplethOptions, "states" | "colorScale"> {
  /** Where to render. A CSS selector or an element. Also accepted as the first constructor argument. */
  container?: HTMLElement | string;
  /**
   * Boundary data for the state/UT layer: inline GeoJSON/TopoJSON, a URL string
   * to fetch, or a promise of either. Omit to fetch the prepared current-vintage
   * state bundle from `dataBaseUrl`. The package itself bundles no geometry.
   */
  geometry?: GeometryInput;
  /** Base URL for the prepared boundary bundles. Point it at your own copy of `data/generated` to self-host. */
  dataBaseUrl?: string;
  /**
   * Click-to-drill-down into districts. Defaults to `true` when the state layer
   * came from `dataBaseUrl` (district files live beside it), `false` when you
   * supplied your own `geometry` — pass `loadDistricts` yourself in that case.
   */
  districts?: boolean;
  /** Reads a feature's stable id. Defaults to `feature.properties.id`. */
  getId?: (feature: MapFeature) => string;
  /** Reads a feature's display name. Defaults to `feature.properties.name`. This is what `.states[...]` is keyed by. */
  getLabel?: (feature: MapFeature) => string;
  /** Initial per-state values. Keys may be display names, slugs or ids. Anything omitted starts as `null` ("no data"). */
  values?: Record<string, number | null>;
  colorScale?: ColorScale;
  /** Sets the `--india-map-text` CSS variable (region label/value text color). */
  fontColor?: string;
  /** Sets the `--india-map-stroke` CSS variable (region border color). */
  borderColor?: string;
  /** Region border thickness in px. Sets `--india-map-border-width`. Defaults to 2.5. */
  borderWidth?: number;
  /** Selection ring thickness in px; the halo under it is twice this. Defaults to 3. */
  selectionWidth?: number;
  /** Called once the boundary data has rendered. */
  onReady?: (map: BharatChoropleth) => void;
  /** Called if boundary data fails to load. Default behavior also prints the message into the container. */
  onError?: (error: Error) => void;
}

function resolveContainer(container: HTMLElement | string | undefined): HTMLElement {
  if (isElement(container)) return container;

  if (typeof container === "string") {
    const found = document.querySelector<HTMLElement>(container);
    if (found) return found;
    throw new Error(`BharatChoropleth: container "${container}" was not found.`);
  }

  for (const selector of FALLBACK_CONTAINER_SELECTORS) {
    const found = document.querySelector<HTMLElement>(selector);
    if (found) return found;
  }
  throw new Error(
    `BharatChoropleth: no container given and none of ${FALLBACK_CONTAINER_SELECTORS.join(", ")} exist. ` +
      `Pass an element or selector: new BharatChoropleth("#map").`,
  );
}

/**
 * The drop-a-script-tag API: set numbers on states, get a map.
 *
 * ```html
 * <div id="map"></div>
 * <script src="https://cdn.jsdelivr.net/npm/bharat-choropleth-js"></script>
 * <script>
 *   var map = new BharatChoropleth("#map");
 *   map.fontColor = "maroon";   // `map.font_color` works too
 *   map.goa = 6;
 *   map.gujarat = 7;
 * </script>
 * ```
 *
 * Boundary data is fetched (never bundled) on construction, so writes like
 * `map.goa = 6` that run before it lands are buffered and applied on arrival —
 * calling code never has to await anything. `map.ready` is there if you want to.
 *
 * This is sugar, not a replacement: `IndiaChoropleth` remains the full-featured
 * engine (custom tooltips, controlled selection, reference overlays, ...) for
 * anything beyond "map a name to a number." Reach it via `.engine`.
 */
export class BharatChoropleth {
  [stateNameOrOption: string]: unknown;

  /** Resolves once boundary data has loaded and the map is on screen; rejects if it can't load. */
  readonly ready: Promise<BharatChoropleth>;

  private engineInstance: IndiaChoropleth | null = null;
  private readonly containerEl: HTMLElement;
  private readonly options: BharatChoroplethOptions;
  private readonly dataBaseUrl: string;
  private readonly usingDefaultData: boolean;
  private readonly values = new Map<string, number | null>();
  private readonly labelByKey = new Map<string, string>();
  /** Original spelling per key, so a deferred "unknown state" warning quotes what the caller actually typed. */
  private readonly writtenAs = new Map<string, string>();
  private readonly statesAccessor: Record<string, number | null>;
  private readonly abortController: AbortController | null;
  private readonly getId: (feature: MapFeature) => string;
  private readonly getLabel: (feature: MapFeature) => string;
  private loadingEl: HTMLElement | null = null;
  private destroyed = false;
  private _fontColor: string | undefined;
  private _borderColor: string | undefined;
  private _borderWidth: number | undefined;
  private _selectionWidth: number | undefined;
  private _colorScale: ColorScale | undefined;

  constructor(
    container?: HTMLElement | string | BharatChoroplethOptions,
    options: BharatChoroplethOptions = {},
  ) {
    // `new BharatChoropleth({ container: "#map", ... })` and
    // `new BharatChoropleth("#map", { ... })` are the same call.
    const optionsFirst = typeof container === "object" && container !== null && !isElement(container);
    const merged: BharatChoroplethOptions = optionsFirst
      ? { ...(container as BharatChoroplethOptions) }
      : { ...options, container: (container as HTMLElement | string | undefined) ?? options.container };

    this.options = merged;
    this.containerEl = resolveContainer(merged.container);
    this.dataBaseUrl = merged.dataBaseUrl ?? DEFAULT_DATA_BASE_URL;
    this.usingDefaultData = merged.geometry === undefined;

    this.getId = merged.getId ?? ((feature) => String(feature.properties?.id ?? feature.properties?.name));
    this.getLabel = merged.getLabel ?? ((feature) => String(feature.properties?.name ?? feature.properties?.id));

    for (const [name, value] of Object.entries(merged.values ?? {})) {
      const key = this.keyFor(name);
      this.values.set(key, value);
      this.writtenAs.set(key, name);
    }

    this._colorScale = merged.colorScale;
    this._fontColor = merged.fontColor;
    this._borderColor = merged.borderColor;
    this._borderWidth = merged.borderWidth;
    this._selectionWidth = merged.selectionWidth;

    this.statesAccessor = new Proxy({} as Record<string, number | null>, {
      get: (_target, prop) => (typeof prop === "string" ? this.getValue(prop) : undefined),
      has: (_target, prop) => typeof prop === "string" && this.values.has(this.keyFor(prop)),
      ownKeys: () => [...this.labelByKey.values()],
      getOwnPropertyDescriptor: (_target, prop) =>
        typeof prop === "string" && this.values.has(this.keyFor(prop))
          ? { enumerable: true, configurable: true, value: this.getValue(prop) }
          : undefined,
      set: (_target, prop, value) => {
        if (typeof prop !== "string") return false;
        this.setValue(prop, value as number | null);
        return true;
      },
    });

    // Inline geometry renders synchronously — no loading flash, and `.engine` is
    // available on the very next line. Everything else resolves in the background.
    if (isInlineGeometry(merged.geometry)) {
      this.abortController = null;
      this.ready = Promise.resolve(this);
      this.mount(merged.geometry);
    } else {
      this.abortController = typeof AbortController === "function" ? new AbortController() : null;
      this.showLoading();
      this.ready = resolveGeometry(
        merged.geometry ?? statesUrl(this.dataBaseUrl),
        "states",
        this.abortController?.signal,
      )
        .then((geometry) => {
          if (this.destroyed) return this.proxied ?? this;
          this.mount(geometry);
          return this.proxied ?? this;
        })
        .catch((error: Error) => {
          if (this.destroyed || error.name === "AbortError") return this.proxied ?? this;
          this.showError(error);
          throw error;
        });

      // The documented usage never awaits `ready`, so a load failure would raise
      // an unhandled rejection on top of the message already shown in the
      // container. Attaching a no-op handler marks it handled; a caller's own
      // `.catch()` on `ready` still fires, because that's a separate branch.
      this.ready.catch(() => {});
    }

    // Beyond this point `this` is the Proxy below — every real field/getter/method
    // above stays reachable via `prop in target`; only genuinely unknown property
    // names (the `map.goa = 6` shortcuts) get special handling.
    this.proxied = new Proxy(this, {
      get: (target, prop, receiver) => {
        if (typeof prop === "string" && !(prop in target)) {
          const option = optionAlias(prop, target);
          if (option) return Reflect.get(target, option, receiver);
          return this.getValue(prop);
        }
        return Reflect.get(target, prop, receiver);
      },
      set: (target, prop, value, receiver) => {
        if (typeof prop === "string" && !(prop in target)) {
          const option = optionAlias(prop, target);
          if (option) return Reflect.set(target, option, value, receiver);
          this.setValue(prop, value as number | null);
          return true;
        }
        return Reflect.set(target, prop, value, receiver);
      },
    });
    return this.proxied;
  }

  /** The Proxy wrapper returned from the constructor, so async callbacks hand back the same object the caller holds. */
  private proxied: BharatChoropleth | undefined;

  // ---------------------------------------------------------------- values

  /**
   * Canonical storage key for a name. Known states/UTs collapse to their LGD id,
   * so `"Goa"`, `"goa"`, `"GOA"` and `"in-cs-30-goa"` are one entry; anything
   * else (custom geometry with its own labels) falls back to its normalized name.
   */
  private keyFor(name: string): string {
    return resolveState(name)?.id ?? normalizeStateKey(name);
  }

  private keyForFeature(feature: MapFeature): string {
    const id = this.getId(feature);
    return resolveState(id)?.id ?? resolveState(this.getLabel(feature))?.id ?? normalizeStateKey(this.getLabel(feature));
  }

  private getValue(name: string): number | null {
    return this.values.get(this.keyFor(name)) ?? null;
  }

  private setValue(name: string, value: number | null) {
    const key = this.keyFor(name);
    this.values.set(key, value);
    if (!this.writtenAs.has(key)) this.writtenAs.set(key, name);
    // Unknown names can't be judged until the boundary data has landed and told
    // us the real label set — so the warning is deferred, never guessed at.
    if (this.engineInstance) {
      if (!this.labelByKey.has(key)) this.warnUnknown(name);
      else this.engineInstance.update({});
    }
  }

  private warnUnknown(name: string) {
    console.warn(`BharatChoropleth: "${name}" is not a recognized state/UT — its value is ignored.`);
  }

  // ---------------------------------------------------------------- mounting

  private mount(geometry: GeometrySource) {
    this.clearPlaceholder();

    for (const feature of asFeatureCollection(geometry).features) {
      const key = this.keyForFeature(feature);
      this.labelByKey.set(key, this.getLabel(feature));
      if (!this.values.has(key)) this.values.set(key, null);
    }

    // Now that the real label set is known, anything written before the boundary
    // data landed can finally be judged — and only now is a warning trustworthy.
    for (const [key, value] of this.values) {
      if (!this.labelByKey.has(key) && value !== null) this.warnUnknown(this.writtenAs.get(key) ?? key);
    }

    const {
      container: _container,
      geometry: _geometry,
      dataBaseUrl: _dataBaseUrl,
      districts,
      getId: _getId,
      getLabel: _getLabel,
      values: _values,
      fontColor: _fontColor,
      borderColor: _borderColor,
      borderWidth: _borderWidth,
      selectionWidth: _selectionWidth,
      colorScale,
      onReady,
      onError: _onError,
      ...rest
    } = this.options;

    const drillDownEnabled = districts ?? this.usingDefaultData;

    this.engineInstance = new IndiaChoropleth(this.containerEl, {
      ...rest,
      colorScale,
      loadDistricts: rest.loadDistricts ?? (drillDownEnabled ? this.defaultDistrictLoader : undefined),
      states: {
        geometry,
        getId: this.getId,
        getLabel: this.getLabel,
        getValue: (feature) => this.values.get(this.keyForFeature(feature)) ?? null,
      },
    });

    // CSS custom properties have to land on the engine's own root element, which
    // only exists now — see the comment on `mapRootEl`. Re-applying here is what
    // makes `map.fontColor = "maroon"` on the line after `new` actually stick.
    if (this._fontColor) this.mapRootEl.style.setProperty("--india-map-text", this._fontColor);
    if (this._borderColor) this.mapRootEl.style.setProperty("--india-map-stroke", this._borderColor);
    if (this._borderWidth !== undefined) this.mapRootEl.style.setProperty("--india-map-border-width", String(this._borderWidth));
    if (this._selectionWidth !== undefined) this.mapRootEl.style.setProperty("--india-map-selection-width", String(this._selectionWidth));

    onReady?.(this.proxied ?? this);
  }

  /** Districts for the drilled-in state, fetched from the same base URL as the state layer. */
  private defaultDistrictLoader = async (stateId: string): Promise<MapLayer> => {
    const geometry = await loadDistrictTopology(this.dataBaseUrl, stateId, this.abortController?.signal);
    return {
      geometry,
      getId: (feature) => String(feature.properties?.id ?? feature.properties?.name),
      getLabel: (feature) => String(feature.properties?.name ?? feature.properties?.id),
      getValue: (feature) => this.values.get(normalizeStateKey(String(feature.properties?.name ?? ""))) ?? null,
    };
  };

  private showLoading() {
    this.loadingEl = document.createElement("div");
    this.loadingEl.className = "bharat-choropleth__status";
    this.loadingEl.setAttribute("role", "status");
    this.loadingEl.textContent = "Loading map…";
    this.containerEl.appendChild(this.loadingEl);
  }

  private showError(error: Error) {
    this.clearPlaceholder();
    const node = document.createElement("div");
    node.className = "bharat-choropleth__status bharat-choropleth__status--error";
    node.setAttribute("role", "alert");
    node.textContent = error.message;
    this.containerEl.appendChild(node);
    this.loadingEl = node;
    if (this.options.onError) this.options.onError(error);
    else console.error(error);
  }

  private clearPlaceholder() {
    this.loadingEl?.remove();
    this.loadingEl = null;
  }

  // ---------------------------------------------------------------- public API

  /** The underlying `IndiaChoropleth`, or `null` until boundary data has loaded. */
  get engine(): IndiaChoropleth | null {
    return this.engineInstance;
  }

  /** `map.states["Tamil Nadu"] = 6` — the canonical accessor; works for every label, however it's spelled. */
  get states(): Record<string, number | null> {
    return this.statesAccessor;
  }

  /** Set many values at once with a single re-render. Unlisted states are left untouched. */
  setValues(values: Record<string, number | null>) {
    for (const [name, value] of Object.entries(values)) {
      const key = this.keyFor(name);
      this.values.set(key, value);
      if (!this.writtenAs.has(key)) this.writtenAs.set(key, name);
      if (this.engineInstance && !this.labelByKey.has(key)) this.warnUnknown(name);
    }
    this.engineInstance?.update({});
  }

  /** Every state/UT that currently has a value, keyed by display name. */
  getValues(): Record<string, number | null> {
    const out: Record<string, number | null> = {};
    for (const [key, label] of this.labelByKey) out[label] = this.values.get(key) ?? null;
    return out;
  }

  // `.india-choropleth` (the engine's own root element) declares --india-map-text/
  // --india-map-stroke directly on itself as defaults, not as `var(..., fallback)` —
  // so those local declarations win over anything inherited from an ancestor. Setting
  // the override on `containerEl` (its parent) would silently do nothing; it has to
  // land on this element itself.
  private get mapRootEl(): HTMLElement {
    return this.containerEl.querySelector<HTMLElement>(".india-choropleth") ?? this.containerEl;
  }

  get fontColor(): string | undefined {
    return this._fontColor;
  }
  set fontColor(color: string | undefined) {
    this._fontColor = color;
    if (!this.engineInstance) return; // re-applied by mount() once the root element exists
    if (color) this.mapRootEl.style.setProperty("--india-map-text", color);
    else this.mapRootEl.style.removeProperty("--india-map-text");
  }

  get borderColor(): string | undefined {
    return this._borderColor;
  }
  set borderColor(color: string | undefined) {
    this._borderColor = color;
    if (!this.engineInstance) return;
    if (color) this.mapRootEl.style.setProperty("--india-map-stroke", color);
    else this.mapRootEl.style.removeProperty("--india-map-stroke");
  }

  /** Region border thickness in px. Sets `--india-map-border-width`. */
  get borderWidth(): number | undefined {
    return this._borderWidth;
  }
  set borderWidth(width: number | undefined) {
    this._borderWidth = width;
    this.setWidthVar("--india-map-border-width", width);
  }

  /** Selection ring thickness in px; its halo is drawn at twice this. Sets `--india-map-selection-width`. */
  get selectionWidth(): number | undefined {
    return this._selectionWidth;
  }
  set selectionWidth(width: number | undefined) {
    this._selectionWidth = width;
    this.setWidthVar("--india-map-selection-width", width);
  }

  // Same reason as the colour setters: the variable has to land on the engine's
  // own root element, which doesn't exist until the geometry has loaded.
  private setWidthVar(name: string, width: number | undefined) {
    if (!this.engineInstance) return; // re-applied by mount()
    if (width === undefined) this.mapRootEl.style.removeProperty(name);
    else this.mapRootEl.style.setProperty(name, String(width));
  }

  get colorScale(): ColorScale | undefined {
    return this._colorScale;
  }
  set colorScale(scale: ColorScale | undefined) {
    this._colorScale = scale;
    this.options.colorScale = scale; // so a pre-load assignment survives into mount()
    this.engineInstance?.update({ colorScale: scale });
  }

  select(id: string | null) {
    this.engineInstance?.select(id);
  }
  drillDown(id: string | null) {
    const resolved = id === null ? null : (resolveState(id)?.id ?? id);
    this.engineInstance?.drillDown(resolved);
  }
  getSelected(): MapRegion | null {
    return this.engineInstance?.getSelected() ?? null;
  }
  getInspected(): MapRegion | null {
    return this.engineInstance?.getInspected() ?? null;
  }
  destroy() {
    this.destroyed = true;
    this.abortController?.abort();
    this.clearPlaceholder();
    this.engineInstance?.destroy();
    this.engineInstance = null;
  }
}
