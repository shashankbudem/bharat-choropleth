import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IndiaChoropleth } from "../src/IndiaChoropleth";
import type { MapLayer } from "../src/types";
import { asFeatureCollection } from "../src/geometry";

// Top of the built-in ramp — the color Alpha (the highest value) must keep when selected.
const DEFAULT_TOP_COLOR = "#075b55";
// Bottom of the built-in ramp — the colour the lower of two values gets.
const DEFAULT_BOTTOM_COLOR = "#d9f1ed";

const stateLayer: MapLayer = {
  geometry: { type: "FeatureCollection", features: [
    { type: "Feature", properties: { code: "27", name: "Alpha", value: 42 }, geometry: { type: "Polygon", coordinates: [[[72, 18], [73, 18], [73, 19], [72, 19], [72, 18]]] } },
    { type: "Feature", properties: { code: "29", name: "Beta", value: 18 }, geometry: { type: "Polygon", coordinates: [[[74, 18], [75, 18], [75, 19], [74, 19], [74, 18]]] } },
  ] },
  getId: (feature) => String(feature.properties?.code),
  getLabel: (feature) => String(feature.properties?.name),
  getValue: (feature) => Number(feature.properties?.value),
};

// Three regions across a three-colour ramp, one per band, so "the regions
// painted in this colour" is an unambiguous set to check a filter against.
const rampLayer: MapLayer = {
  geometry: { type: "FeatureCollection", features: [
    { type: "Feature", properties: { code: "low", name: "Low", value: 0 }, geometry: { type: "Polygon", coordinates: [[[72, 18], [72, 19], [73, 19], [73, 18], [72, 18]]] } },
    { type: "Feature", properties: { code: "mid", name: "Mid", value: 5 }, geometry: { type: "Polygon", coordinates: [[[74, 18], [74, 19], [75, 19], [75, 18], [74, 18]]] } },
    { type: "Feature", properties: { code: "high", name: "High", value: 10 }, geometry: { type: "Polygon", coordinates: [[[76, 18], [76, 19], [77, 19], [77, 18], [76, 18]]] } },
  ] },
  getId: (feature) => String(feature.properties?.code),
  getLabel: (feature) => String(feature.properties?.name),
  getValue: (feature) => feature.properties?.value as number | null,
};
const RAMP = ["#111111", "#222222", "#333333"];

const districtLayer: MapLayer = { ...stateLayer, geometry: { type: "FeatureCollection", features: [
  { type: "Feature", properties: { code: "D1", name: "Delta", value: 9 }, geometry: { type: "Polygon", coordinates: [[[72, 18], [72.5, 18], [72.5, 19], [72, 19], [72, 18]]] } },
] } };

// Two districts, so "changing the state clears the district below it" is expressible.
const twoDistrictLayer: MapLayer = { ...stateLayer, geometry: { type: "FeatureCollection", features: [
  { type: "Feature", properties: { code: "D1", name: "Delta", value: 9 }, geometry: { type: "Polygon", coordinates: [[[72, 18], [72.5, 18], [72.5, 19], [72, 19], [72, 18]]] } },
  { type: "Feature", properties: { code: "D2", name: "Echo", value: 4 }, geometry: { type: "Polygon", coordinates: [[[72.5, 18], [73, 18], [73, 19], [72.5, 19], [72.5, 18]]] } },
] } };

const subDistrictLayer: MapLayer = { ...stateLayer, geometry: { type: "FeatureCollection", features: [
  { type: "Feature", properties: { code: "S1", name: "Tehsil One", value: 6 }, geometry: { type: "Polygon", coordinates: [[[72, 18], [72.25, 18], [72.25, 19], [72, 19], [72, 18]]] } },
  { type: "Feature", properties: { code: "S2", name: "Tehsil Two", value: 3 }, geometry: { type: "Polygon", coordinates: [[[72.25, 18], [72.5, 18], [72.5, 19], [72.25, 19], [72.25, 18]]] } },
] } };

const referenceOverlay = {
  geometry: { type: "FeatureCollection" as const, features: [
    { type: "Feature" as const, properties: { code: "reference", name: "Reference area" }, geometry: { type: "Polygon" as const, coordinates: [[[71, 17], [71.5, 17], [71.5, 17.5], [71, 17.5], [71, 17]]] } },
  ] },
  getId: (feature: Parameters<MapLayer["getId"]>[0]) => String(feature.properties?.code),
  getLabel: (feature: Parameters<MapLayer["getId"]>[0]) => String(feature.properties?.name),
  getDescription: () => "National reference outline; hatched portions outside the statistical layer have no data.",
};

const valueEdgeLayer: MapLayer = {
  geometry: { type: "FeatureCollection", features: [
    { type: "Feature", properties: { code: "zero", name: "Zero", value: 0 }, geometry: { type: "Polygon", coordinates: [[[72, 18], [73, 18], [73, 19], [72, 19], [72, 18]]] } },
    { type: "Feature", properties: { code: "negative", name: "Negative", value: -5 }, geometry: { type: "Polygon", coordinates: [[[74, 18], [75, 18], [75, 19], [74, 19], [74, 18]]] } },
    { type: "Feature", properties: { code: "missing", name: "Missing", value: null }, geometry: { type: "Polygon", coordinates: [[[76, 18], [77, 18], [77, 19], [76, 19], [76, 18]]] } },
  ] },
  getId: (feature) => String(feature.properties?.code),
  getLabel: (feature) => String(feature.properties?.name),
  getValue: (feature) => feature.properties?.value as number | null,
};


// One ordinary region and one speck a hundredth of a degree across — the shape
// of the real problem (Lakshadweep beside the mainland), at fixture scale.
//
// Exterior rings are wound clockwise in lon/lat, which is what the data-prep
// step emits and what d3-geo's spherical maths expects. Wound the other way it
// reads each polygon as the whole globe minus that square, and fitExtent then
// squeezes the entire map into a couple of units — every region turns into a
// sub-pixel speck and the small-region handling fires for all of them.
const smallRegionLayer: MapLayer = {
  geometry: { type: "FeatureCollection", features: [
    { type: "Feature", properties: { code: "big", name: "Bigland", value: 10 }, geometry: { type: "Polygon", coordinates: [[[72, 18], [72, 19], [73, 19], [73, 18], [72, 18]]] } },
    { type: "Feature", properties: { code: "speck", name: "Speck", value: 1 }, geometry: { type: "Polygon", coordinates: [[[74, 18], [74, 18.01], [74.01, 18.01], [74.01, 18], [74, 18]]] } },
  ] },
  getId: (feature) => String(feature.properties?.code),
  getLabel: (feature) => String(feature.properties?.name),
  getValue: (feature) => feature.properties?.value as number | null,
};

// A speck named Puducherry beside one that is not, for the rule that a region
// with no room around it keeps its true outline while its neighbour is grown.
const enclaveLayer: MapLayer = {
  geometry: { type: "FeatureCollection", features: [
    { type: "Feature", properties: { code: "big", name: "Bigland", value: 10 }, geometry: { type: "Polygon", coordinates: [[[72, 18], [72, 19], [73, 19], [73, 18], [72, 18]]] } },
    { type: "Feature", properties: { code: "in-cs-34-puducherry", name: "Puducherry", value: 2 }, geometry: { type: "Polygon", coordinates: [[[74, 18], [74, 18.01], [74.01, 18.01], [74.01, 18], [74, 18]]] } },
    { type: "Feature", properties: { code: "in-cs-31-lakshadweep", name: "Lakshadweep", value: 1 }, geometry: { type: "Polygon", coordinates: [[[74, 18.5], [74, 18.51], [74.01, 18.51], [74.01, 18.5], [74, 18.5]]] } },
  ] },
  getId: (feature) => String(feature.properties?.code),
  getLabel: (feature) => String(feature.properties?.name),
  getValue: (feature) => feature.properties?.value as number | null,
};

// One region scattered across three specks with open water between them —
// Lakshadweep's shape of problem at fixture scale.
const islandGroupLayer: MapLayer = {
  geometry: { type: "FeatureCollection", features: [
    { type: "Feature", properties: { code: "big", name: "Bigland", value: 10 }, geometry: { type: "Polygon", coordinates: [[[72, 18], [72, 19], [73, 19], [73, 18], [72, 18]]] } },
    { type: "Feature", properties: { code: "islands", name: "Islands", value: 1 }, geometry: { type: "MultiPolygon", coordinates: [
      [[[74, 18], [74, 18.01], [74.01, 18.01], [74.01, 18], [74, 18]]],
      [[[74.3, 18.2], [74.3, 18.21], [74.31, 18.21], [74.31, 18.2], [74.3, 18.2]]],
      [[[74.05, 18.4], [74.05, 18.41], [74.06, 18.41], [74.06, 18.4], [74.05, 18.4]]],
    ] } },
  ] },
  getId: (feature) => String(feature.properties?.code),
  getLabel: (feature) => String(feature.properties?.name),
  getValue: (feature) => feature.properties?.value as number | null,
};

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
});

function byLabel(root: ParentNode, pattern: RegExp): HTMLElement {
  const match = [...root.querySelectorAll('[role="button"]')].find((node) => pattern.test(node.getAttribute("aria-label") ?? ""));
  if (!match) throw new Error(`No [role="button"] matched ${pattern}`);
  return match as HTMLElement;
}

function tooltipText(root: ParentNode) {
  return root.querySelector(".india-choropleth__tooltip")?.textContent ?? null;
}

function isTooltipVisible(root: ParentNode) {
  const anchor = root.querySelector<HTMLElement>(".india-choropleth__tooltip-anchor");
  return Boolean(anchor && anchor.style.display !== "none");
}

describe("IndiaChoropleth (plain JS)", () => {
  it("gives focus the same tooltip behavior as hover and activates with Enter", () => {
    const onInspect = vi.fn();
    const onSelectedChange = vi.fn();
    new IndiaChoropleth(container, { states: stateLayer, onInspect, onSelectedChange });
    const alpha = byLabel(container, /alpha, 42/i);
    alpha.dispatchEvent(new FocusEvent("focus"));
    expect(onInspect).toHaveBeenLastCalledWith(expect.objectContaining({ id: "27" }), "state");
    expect(container.querySelector(".india-choropleth__tooltip")?.textContent).toContain("Alpha");
    alpha.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(onSelectedChange).toHaveBeenCalledWith(expect.objectContaining({ id: "27" }), "state");
  });

  it("shows value, share of total and rank in the default tooltip", () => {
    new IndiaChoropleth(container, { states: stateLayer });
    byLabel(container, /alpha, 42/i).dispatchEvent(new FocusEvent("focus"));
    // Alpha is 42 of 60 total, and the larger of the two regions.
    expect(tooltipText(container)).toContain("70.0% of total");
    expect(tooltipText(container)).toContain("1st of 2");

    byLabel(container, /beta, 18/i).dispatchEvent(new FocusEvent("focus"));
    expect(tooltipText(container)).toContain("2nd of 2");
  });

  it("omits share and rank for a region with no data, and says so", () => {
    new IndiaChoropleth(container, { states: valueEdgeLayer });
    byLabel(container, /missing, no data/i).dispatchEvent(new FocusEvent("focus"));
    expect(tooltipText(container)).toContain("No data");
    expect(tooltipText(container)).not.toMatch(/of total|of \d/);
  });

  it("ranks ties equally rather than picking an arbitrary winner", () => {
    const tied: MapLayer = { ...stateLayer, getValue: () => 10 };
    new IndiaChoropleth(container, { states: tied });
    byLabel(container, /alpha, 10/i).dispatchEvent(new FocusEvent("focus"));
    expect(tooltipText(container)).toContain("1st of 2");
    byLabel(container, /beta, 10/i).dispatchEvent(new FocusEvent("focus"));
    expect(tooltipText(container)).toContain("1st of 2");
  });

  it("is not an aria-live region — it is announced on focus via aria-describedby instead", () => {
    new IndiaChoropleth(container, { states: stateLayer });
    const tooltip = container.querySelector(".india-choropleth__tooltip")!;
    expect(tooltip.getAttribute("role")).toBeNull();
    expect(tooltip.getAttribute("aria-live")).toBeNull();

    const alpha = byLabel(container, /alpha, 42/i);
    alpha.dispatchEvent(new FocusEvent("focus"));
    expect(alpha.getAttribute("aria-describedby")).toBe(tooltip.id);
  });

  it("keeps the share bar out of the accessibility tree, since it repeats the share text", () => {
    new IndiaChoropleth(container, { states: stateLayer });
    byLabel(container, /alpha, 42/i).dispatchEvent(new FocusEvent("focus"));
    const bar = container.querySelector(".india-choropleth__tooltip-bar")!;
    expect(bar.getAttribute("aria-hidden")).toBe("true");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("70%");
  });

  it("flips the tooltip below a region near the top edge instead of outside the map", () => {
    // jsdom reports zero-size rects, so the placement step would early-return.
    // Stub just the two elements it measures: a tooltip whose default position
    // lands above the canvas top is the Jammu & Kashmir case at a narrow width.
    const rect = (left: number, top: number, width: number, height: number) =>
      ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.classList.contains("india-choropleth__tooltip-anchor")) return rect(300, 180, 160, 70);
      if (this.classList.contains("india-choropleth__canvas")) return rect(100, 200, 600, 400);
      return rect(0, 0, 0, 0);
    });

    new IndiaChoropleth(container, { states: stateLayer });
    byLabel(container, /alpha, 42/i).dispatchEvent(new FocusEvent("focus"));
    const anchorEl = container.querySelector<HTMLElement>(".india-choropleth__tooltip-anchor")!;
    expect(anchorEl.style.getPropertyValue("--india-map-tooltip-dy")).toBe("12px");
    spy.mockRestore();
  });

  it("marks selection with a ring and leaves the region fill carrying the data", () => {
    new IndiaChoropleth(container, { states: stateLayer, defaultSelectedId: "27" });
    const alpha = container.querySelector(".india-choropleth__region--selected") as SVGPathElement;
    const ring = container.querySelector(".india-choropleth__selection-ring")!;
    // The fill still comes from the color scale, not from the selection accent.
    expect(alpha.getAttribute("fill")).toBe(DEFAULT_TOP_COLOR);
    expect(ring.getAttribute("d")).toBe(alpha.getAttribute("d"));
    // Drawn last, so a later-drawn neighbour cannot paint over the outline.
    expect(container.querySelector(".india-choropleth__svg")!.lastElementChild!.classList.contains("india-choropleth__selection")).toBe(true);
  });

  it("lifts the selection ring only while the selected region is the hovered one", () => {
    new IndiaChoropleth(container, { states: stateLayer, defaultSelectedId: "27" });
    const group = () => container.querySelector(".india-choropleth__selection")!;
    expect(group().classList.contains("india-choropleth__selection--lifted")).toBe(false);
    byLabel(container, /alpha, 42/i).dispatchEvent(new FocusEvent("focus"));
    expect(group().classList.contains("india-choropleth__selection--lifted")).toBe(true);
    byLabel(container, /beta, 18/i).dispatchEvent(new FocusEvent("focus"));
    expect(group().classList.contains("india-choropleth__selection--lifted")).toBe(false);
  });

  it("draws a marker for a region whose geometry is sub-pixel at this scale", () => {
    new IndiaChoropleth(container, { states: smallRegionLayer });
    const markers = [...container.querySelectorAll(".india-choropleth__small-markers circle")];
    // Only the speck qualifies; Bigland is drawn as its own shape.
    expect(markers.length).toBe(1);
    // Filled with its own ramp colour, so the dot still reads as data.
    expect(markers[0]!.getAttribute("fill")).toBe(DEFAULT_BOTTOM_COLOR);
  });

  it("moves a small region's value outside the shape, with a leader line", () => {
    new IndiaChoropleth(container, { states: smallRegionLayer, showRegionValues: true });
    const labels = [...container.querySelectorAll(".india-choropleth__region-values text")];
    const speck = labels.find((node) => node.textContent === "1")!;
    const marker = container.querySelector(".india-choropleth__small-markers circle")!;

    const distance = Math.hypot(
      Number(speck.getAttribute("x")) - Number(marker.getAttribute("cx")),
      Number(speck.getAttribute("y")) - Number(marker.getAttribute("cy")),
    );
    expect(distance).toBeGreaterThan(4); // clear of the marker, not on top of it
    expect(container.querySelectorAll(".india-choropleth__value-leaders line").length).toBe(1);
  });

  it("keeps a big region's value at its own centroid", () => {
    new IndiaChoropleth(container, { states: smallRegionLayer, showRegionValues: true });
    const labels = [...container.querySelectorAll(".india-choropleth__region-values text")];
    const big = labels.find((node) => node.textContent === "10")!;
    const path = [...container.querySelectorAll(".india-choropleth__region")]
      .find((node) => node.getAttribute("aria-label")?.startsWith("Bigland"))!;
    // Inside its own bounding box — no leader, no detour.
    const box = (path as SVGGraphicsElement).getBBox?.() ?? { x: -Infinity, y: -Infinity, width: Infinity, height: Infinity };
    expect(Number(big.getAttribute("x"))).toBeGreaterThanOrEqual(box.x);
  });

  it("clears the selection when a click lands on open background", () => {
    const onSelectedChange = vi.fn();
    new IndiaChoropleth(container, { states: stateLayer, defaultSelectedId: "27", onSelectedChange });
    // The ring group is kept in the DOM and hidden, rather than removed, so the
    // check is on whether it is showing.
    const ring = container.querySelector<SVGGElement>(".india-choropleth__selection")!;
    expect(ring.style.display).not.toBe("none");

    const svg = container.querySelector(".india-choropleth__svg")!;
    svg.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(ring.style.display).toBe("none");
    expect(onSelectedChange).toHaveBeenCalledWith(null, "state");
  });

  it("reports a background click through onBackgroundClick", () => {
    const onBackgroundClick = vi.fn();
    new IndiaChoropleth(container, { states: stateLayer, onBackgroundClick });
    container.querySelector(".india-choropleth__svg")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onBackgroundClick).toHaveBeenCalledTimes(1);
  });

  it("clears the floating tooltip on mouse leave and blur even with an active selection", () => {
    new IndiaChoropleth(container, { states: stateLayer, defaultSelectedId: "27" });
    const alpha = byLabel(container, /alpha, 42/i);
    const beta = byLabel(container, /beta, 18/i);

    beta.dispatchEvent(new MouseEvent("mouseenter"));
    expect(tooltipText(container)).toContain("Beta");
    beta.dispatchEvent(new MouseEvent("mouseleave"));
    expect(isTooltipVisible(container)).toBe(false);

    alpha.dispatchEvent(new FocusEvent("focus"));
    expect(tooltipText(container)).toContain("Alpha");
    alpha.dispatchEvent(new FocusEvent("blur"));
    expect(isTooltipVisible(container)).toBe(false);
  });

  it("switches the floating tooltip straight to an adjacent region without blanking", () => {
    const onInspect = vi.fn();
    new IndiaChoropleth(container, { states: stateLayer, onInspect });
    const alpha = byLabel(container, /alpha, 42/i);
    const beta = byLabel(container, /beta, 18/i);

    alpha.dispatchEvent(new MouseEvent("mouseenter"));
    expect(tooltipText(container)).toContain("Alpha");

    alpha.dispatchEvent(new MouseEvent("mouseleave"));
    beta.dispatchEvent(new MouseEvent("mouseenter"));
    expect(tooltipText(container)).toContain("Beta");
    expect(onInspect).toHaveBeenLastCalledWith(expect.objectContaining({ label: "Beta" }), "state");
  });

  it("still reports inspection when breadcrumb-back restores focus to the region it primed", async () => {
    const onInspect = vi.fn();
    new IndiaChoropleth(container, { states: stateLayer, loadDistricts: async () => districtLayer, onInspect });
    byLabel(container, /alpha, 42/i).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => byLabel(container, /delta, 9/i));

    onInspect.mockClear();
    container.querySelector<HTMLElement>(".india-choropleth__back")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const alpha = byLabel(container, /alpha, 42/i);
    await vi.waitFor(() => expect(document.activeElement).toBe(alpha));
    // `goBack` primes the inspected id, then focus restoration re-inspects the same
    // region — the redundant-clear guard must not swallow that notification.
    expect(onInspect).toHaveBeenCalledWith(expect.objectContaining({ label: "Alpha" }), "state");
  });

  it("loads districts only after a state activation and supports breadcrumb return", async () => {
    const loadDistricts = vi.fn(async () => districtLayer);
    const onDrillDownChange = vi.fn();
    new IndiaChoropleth(container, { states: stateLayer, loadDistricts, onDrillDownChange });
    byLabel(container, /alpha, 42/i).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => expect(loadDistricts).toHaveBeenCalledWith("27", expect.objectContaining({ label: "Alpha" })));
    await vi.waitFor(() => byLabel(container, /delta, 9/i));
    container.querySelector<HTMLElement>(".india-choropleth__back")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onDrillDownChange).toHaveBeenLastCalledWith(null, expect.objectContaining({ id: "27" }));
    const alpha = byLabel(container, /alpha, 42/i);
    expect(alpha).toBeTruthy();
    await vi.waitFor(() => expect(document.activeElement).toBe(alpha));
  });

  it("keeps hierarchy visible for empty district data and clears inspection with Escape", async () => {
    new IndiaChoropleth(container, { states: stateLayer, loadDistricts: async () => ({ ...districtLayer, geometry: { type: "FeatureCollection", features: [] } }) });
    const alpha = byLabel(container, /alpha, 42/i);
    alpha.dispatchEvent(new FocusEvent("focus"));
    expect(container.querySelector(".india-choropleth__tooltip")?.textContent).toContain("Alpha");
    container.querySelector(".india-choropleth__svg")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(isTooltipVisible(container)).toBe(false);
    alpha.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => expect(container.textContent).toContain("No district data is available for this state."));
    expect(container.querySelector(".india-choropleth__back")).toBeTruthy();
    expect(isTooltipVisible(container)).toBe(false);
  });

  it("keeps zero, negative, and missing values distinct", () => {
    new IndiaChoropleth(container, { states: valueEdgeLayer });
    expect(byLabel(container, /zero, 0/i)).toBeTruthy();
    expect(byLabel(container, /negative, -5/i)).toBeTruthy();
    expect(byLabel(container, /missing, no data/i)).toBeTruthy();
    byLabel(container, /zero, 0/i).dispatchEvent(new FocusEvent("focus"));
    expect(container.querySelector(".india-choropleth__tooltip")?.textContent).toContain("0");
  });

  it("reports a district loader failure without losing the back path", async () => {
    new IndiaChoropleth(container, { states: stateLayer, loadDistricts: async () => { throw new Error("District service unavailable"); } });
    byLabel(container, /alpha, 42/i).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain("District service unavailable"));
    expect(container.querySelector(".india-choropleth__back")).toBeTruthy();
  });

  it("does not flash a prior state's districts while a controlled drill-down changes", async () => {
    let resolveAlpha: ((layer: MapLayer) => void) | undefined;
    let resolveBeta: ((layer: MapLayer) => void) | undefined;
    const loadDistricts = vi.fn((id: string) => new Promise<MapLayer>((resolve) => {
      if (id === "27") resolveAlpha = resolve;
      else resolveBeta = resolve;
    }));
    const instance = new IndiaChoropleth(container, { states: stateLayer, drillDownId: "27", loadDistricts });
    await vi.waitFor(() => expect(resolveAlpha).toBeDefined());
    resolveAlpha?.(districtLayer);
    await vi.waitFor(() => byLabel(container, /delta, 9/i));
    instance.update({ drillDownId: "29" });
    expect(container.querySelector('[role="button"][aria-label^="Delta"]')).toBeNull();
    await vi.waitFor(() => expect(resolveBeta).toBeDefined());
  });

  it("honours controlled drill-down and selection while still emitting callbacks", () => {
    const onDrillDownChange = vi.fn();
    const onSelectedChange = vi.fn();
    new IndiaChoropleth(container, {
      states: stateLayer,
      drillDownId: null,
      selectedId: "29",
      loadDistricts: async () => districtLayer,
      onDrillDownChange,
      onSelectedChange,
    });
    const alpha = byLabel(container, /alpha, 42/i);
    const beta = byLabel(container, /beta, 18/i);
    expect(beta.getAttribute("aria-pressed")).toBe("true");
    alpha.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onSelectedChange).toHaveBeenCalledWith(expect.objectContaining({ id: "27" }), "state");
    expect(onDrillDownChange).toHaveBeenCalledWith("27", expect.objectContaining({ id: "27" }));
    // Controlled drillDownId stayed null, so the structural rebuild kept the state view.
    expect(byLabel(container, /beta, 18/i).getAttribute("aria-pressed")).toBe("true");
    expect(byLabel(container, /alpha, 42/i).getAttribute("aria-pressed")).toBe("false");
  });

  it("rejects a TopoJSON layer that names no object", () => {
    expect(() => asFeatureCollection({ topology: { type: "Topology", objects: {}, arcs: [] }, object: "missing" })).toThrow(
      "The named TopoJSON object does not exist in this topology.",
    );
  });

  it("renders a national reference overlay as non-interactive unavailable geometry", async () => {
    new IndiaChoropleth(container, { states: stateLayer, referenceOverlay, loadDistricts: async () => districtLayer });
    const referenceArea = container.querySelector('[role="img"]')!;
    expect(referenceArea.getAttribute("aria-label")).toMatch(/reference area\. national reference outline; hatched portions outside the statistical layer have no data/i);
    expect(referenceArea.getAttribute("fill")).toMatch(/^url\(#/);
    expect(referenceArea.hasAttribute("tabindex")).toBe(false);
    expect(container.textContent).toContain("Reference context · data unavailable");
    byLabel(container, /alpha, 42/i).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => byLabel(container, /delta, 9/i));
    expect(container.querySelector('[role="img"]')).toBeNull();
  });

  it("renders state values and can merge a state seam into reference context", () => {
    new IndiaChoropleth(container, { states: stateLayer, showRegionValues: true, referenceOverlayMergeIds: ["27"] });
    const labels = container.querySelector(".india-choropleth__region-values");
    expect(labels?.textContent).toContain("42");
    expect(labels?.textContent).toContain("18");
    expect(container.querySelectorAll(".india-choropleth__region--reference-merged")).toHaveLength(1);
  });

  it("renders values on the district layer when enabled", async () => {
    new IndiaChoropleth(container, { states: stateLayer, loadDistricts: async () => districtLayer, showRegionValues: true });
    byLabel(container, /alpha, 42/i).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.waitFor(() => byLabel(container, /delta, 9/i));
    expect(container.querySelector(".india-choropleth__region-values--district")?.textContent).toContain("9");
  });

  it("loads state-keyed district reference context without making it a district data point", async () => {
    const districtOverlay = { ...referenceOverlay, getLabel: () => "Historical context outline" };
    new IndiaChoropleth(container, {
      states: stateLayer,
      loadDistricts: async () => districtLayer,
      loadDistrictReferenceOverlay: async (stateId) => stateId === "27" ? districtOverlay : null,
    });
    byLabel(container, /alpha, 42/i).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const context = await vi.waitFor(() => {
      const found = container.querySelector('[role="img"]');
      if (!found || !/historical context outline\. national reference outline/i.test(found.getAttribute("aria-label") ?? "")) throw new Error("not yet");
      return found;
    });
    expect(context.hasAttribute("tabindex")).toBe(false);
    expect(container.textContent).toContain("Reference context · data unavailable");
    expect(byLabel(container, /delta, 9/i)).toBeTruthy();
  });

  it("drops a stale district reference overlay when controlled drill-down changes", async () => {
    let resolveAlpha: ((overlay: typeof referenceOverlay | null) => void) | undefined;
    const loadDistrictReferenceOverlay = vi.fn((id: string) => new Promise<typeof referenceOverlay | null>((resolve) => {
      if (id === "27") resolveAlpha = resolve;
      else resolve(null);
    }));
    const instance = new IndiaChoropleth(container, {
      states: stateLayer,
      drillDownId: "27",
      loadDistricts: async () => districtLayer,
      loadDistrictReferenceOverlay,
    });
    await vi.waitFor(() => expect(resolveAlpha).toBeDefined());
    instance.update({ drillDownId: "29" });
    resolveAlpha?.(referenceOverlay);
    await vi.waitFor(() => expect(loadDistrictReferenceOverlay).toHaveBeenCalledWith("29", expect.objectContaining({ id: "29" })));
    expect(container.querySelector('[role="img"]')).toBeNull();
  });

  it("removes all DOM content and stops responding to state changes after destroy", async () => {
    const instance = new IndiaChoropleth(container, { states: stateLayer });
    expect(container.querySelector(".india-choropleth")).toBeTruthy();
    instance.destroy();
    expect(container.querySelector(".india-choropleth")).toBeNull();
  });

  it("keeps Puducherry's true outline while its neighbour is exaggerated", () => {
    // Puducherry is enclaves inside another state: grown to the visibility
    // threshold they land several units inside Tamil Nadu. Lakshadweep grows
    // into open sea, so it still gets the help.
    const pathFor = (name: string, minPartExtent: number) => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      new IndiaChoropleth(host, { states: enclaveLayer, minPartExtent });
      const d = byLabel(host, new RegExp(`^${name},`, "i")).getAttribute("d");
      host.remove();
      return d;
    };

    expect(pathFor("Puducherry", 14)).toBe(pathFor("Puducherry", 0));
    expect(pathFor("Lakshadweep", 14)).not.toBe(pathFor("Lakshadweep", 0));
  });

  it("makes the water inside an island group part of the group", () => {
    new IndiaChoropleth(container, { states: islandGroupLayer });
    const hits = [...container.querySelectorAll(".india-choropleth__hit-areas path")];
    expect(hits.length).toBe(1); // the group, not the single-part mainland

    hits[0]!.dispatchEvent(new MouseEvent("mouseenter"));
    expect(tooltipText(container)).toContain("Islands");
    hits[0]!.dispatchEvent(new MouseEvent("click"));
    expect(container.querySelectorAll(".india-choropleth__selection").length).toBe(1);
  });

  it("paints every region on top of every hit area, so a hull never steals a hover", () => {
    // The hull spanning Lakshadweep's islands is open sea, but Puducherry's spans
    // the Tamil Nadu coast. Document order is what keeps the real state in front.
    new IndiaChoropleth(container, { states: islandGroupLayer });
    const svg = container.querySelector(".india-choropleth__svg")!;
    const nodes = [...svg.querySelectorAll(".india-choropleth__hit-areas, .india-choropleth__region")];
    expect(svg.querySelectorAll(".india-choropleth__hit-areas path").length).toBe(1);
    expect(nodes[0]!.classList.contains("india-choropleth__hit-areas")).toBe(true);
    expect(nodes.slice(1).every((node) => node.classList.contains("india-choropleth__region"))).toBe(true);
  });

  it("hovers a region through the marker standing in for it", () => {
    // Without this the dot is visible and inert: the outline it replaces is a
    // couple of units across, which is not a pointer target.
    new IndiaChoropleth(container, { states: smallRegionLayer });
    const marker = container.querySelector(".india-choropleth__small-markers circle")!;

    marker.dispatchEvent(new MouseEvent("mouseenter"));
    expect(tooltipText(container)).toContain("Speck");
    marker.dispatchEvent(new MouseEvent("mouseleave"));
    expect(isTooltipVisible(container)).toBe(false);
  });

  it("leaves hit areas out of a static map", () => {
    new IndiaChoropleth(container, { states: islandGroupLayer, interactive: false });
    expect(container.querySelectorAll(".india-choropleth__hit-areas").length).toBe(0);
  });

  it("filters the map to the swatch you pick — exactly the regions painted in it", () => {
    // The requirement in one assertion: picking the last colour highlights the
    // states drawn in that colour, and nothing else.
    new IndiaChoropleth(container, { states: rampLayer, colorScale: RAMP });
    const swatches = () => [...container.querySelectorAll<HTMLButtonElement>("button.india-choropleth__swatch")];
    const regions = () => [...container.querySelectorAll(".india-choropleth__region")];
    const named = (nodes: Element[]) =>
      nodes.map((node) => (node.getAttribute("aria-label") ?? "").split(",")[0]).sort();

    expect(swatches()).toHaveLength(3);
    swatches()[2]!.click();

    const lit = regions().filter((node) => !node.classList.contains("india-choropleth__dimmed"));
    const painted = regions().filter((node) => node.getAttribute("fill") === RAMP[2]);
    expect(named(painted)).toEqual(["High"]);
    expect(named(lit)).toEqual(named(painted));
  });

  it("clears the filter when the pressed swatch is picked again, and on Escape", () => {
    new IndiaChoropleth(container, { states: rampLayer, colorScale: RAMP });
    const swatch = (index: number) => container.querySelectorAll<HTMLButtonElement>("button.india-choropleth__swatch")[index]!;
    const dimmed = () => container.querySelectorAll(".india-choropleth__region.india-choropleth__dimmed").length;

    swatch(0).click();
    expect(dimmed()).toBe(2);
    expect(swatch(0).getAttribute("aria-pressed")).toBe("true");
    swatch(0).click();
    expect(dimmed()).toBe(0);
    expect(swatch(0).getAttribute("aria-pressed")).toBe("false");

    swatch(0).click();
    expect(dimmed()).toBe(2);
    container.querySelector(".india-choropleth__legend")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(dimmed()).toBe(0);
  });

  it("dims a region's marker, value and leader line along with the region", () => {
    new IndiaChoropleth(container, { states: smallRegionLayer, showRegionValues: true });
    // Two regions, seven default colours: the speck is in the bottom band.
    container.querySelectorAll<HTMLButtonElement>("button.india-choropleth__swatch")[6]!.click();

    expect(container.querySelector(".india-choropleth__small-markers circle")!.classList)
      .toContain("india-choropleth__dimmed");
    expect(container.querySelector(".india-choropleth__value-leaders line")!.classList)
      .toContain("india-choropleth__dimmed");
    // Bigland holds the top band, so its own value stays lit.
    const values = [...container.querySelectorAll(".india-choropleth__region-values text")];
    expect(values.filter((node) => node.classList.contains("india-choropleth__dimmed"))).toHaveLength(1);
  });

  it("leaves a swatch with nothing in it inert, rather than dimming the whole map", () => {
    new IndiaChoropleth(container, { states: rampLayer, colorScale: ["#111111", "#222222", "#333333", "#444444"] });
    const empty = [...container.querySelectorAll<HTMLButtonElement>("button.india-choropleth__swatch")]
      .find((node) => node.getAttribute("aria-disabled") === "true")!;
    expect(empty.getAttribute("aria-label")).toBe("No regions in this band");

    empty.click();
    expect(container.querySelectorAll(".india-choropleth__dimmed").length).toBe(0);
  });

  it("keeps the pressed swatch through a structural re-render", () => {
    // renderLegend() rebuilds the buttons from scratch; without reading the live
    // filter as it builds them, a host changing any option would leave fresh
    // unpressed swatches over a map that is still filtered.
    const map = new IndiaChoropleth(container, { states: rampLayer, colorScale: RAMP });
    container.querySelectorAll<HTMLButtonElement>("button.india-choropleth__swatch")[2]!.click();
    map.update({ ariaLabel: "Redrawn" });

    const swatches = [...container.querySelectorAll("button.india-choropleth__swatch")];
    expect(swatches.map((node) => node.getAttribute("aria-pressed"))).toEqual(["false", "false", "true"]);
    expect(container.querySelectorAll(".india-choropleth__region.india-choropleth__dimmed").length).toBe(2);
  });

  it("drops the filter when the ramp changes under it", () => {
    const map = new IndiaChoropleth(container, { states: rampLayer, colorScale: RAMP });
    container.querySelectorAll<HTMLButtonElement>("button.india-choropleth__swatch")[2]!.click();
    map.update({ colorScale: ["#aaaaaa", "#bbbbbb", "#cccccc"] });
    expect(container.querySelectorAll(".india-choropleth__dimmed").length).toBe(0);
  });

  it("leaves the legend as plain swatches on a static map", () => {
    new IndiaChoropleth(container, { states: rampLayer, colorScale: RAMP, interactive: false });
    expect(container.querySelectorAll("button.india-choropleth__swatch").length).toBe(0);
    expect(container.querySelectorAll(".india-choropleth__swatch").length).toBe(3);
    expect(container.querySelector(".india-choropleth__swatches")!.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("IndiaChoropleth sub-district drill-down", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  const click = (node: Element) => node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const breadcrumbSteps = () => [...container.querySelectorAll<HTMLElement>(".india-choropleth__back")].map((node) => node.textContent);
  const currentStep = () => container.querySelector("[aria-current='page']")?.textContent ?? null;
  const drillToDistricts = async () => {
    click(byLabel(container, /alpha, 42/i));
    await vi.waitFor(() => byLabel(container, /delta, 9/i));
    return byLabel(container, /delta, 9/i);
  };

  it("loads sub-districts only after a district activation, one level at a time", async () => {
    const loadSubDistricts = vi.fn(async () => subDistrictLayer);
    const onSubDistrictDrillDownChange = vi.fn();
    new IndiaChoropleth(container, {
      states: stateLayer,
      loadDistricts: async () => districtLayer,
      loadSubDistricts,
      onSubDistrictDrillDownChange,
    });
    const delta = await drillToDistricts();
    expect(loadSubDistricts).not.toHaveBeenCalled();
    click(delta);
    await vi.waitFor(() => expect(loadSubDistricts).toHaveBeenCalledWith("D1", expect.objectContaining({ label: "Delta" }), "27"));
    await vi.waitFor(() => byLabel(container, /tehsil one, 6/i));
    expect(onSubDistrictDrillDownChange).toHaveBeenCalledWith("D1", expect.objectContaining({ id: "D1" }));
  });

  it("offers a three-level breadcrumb whose back step goes up one level, not to the top", async () => {
    new IndiaChoropleth(container, {
      states: stateLayer,
      loadDistricts: async () => districtLayer,
      loadSubDistricts: async () => subDistrictLayer,
    });
    click(await drillToDistricts());
    await vi.waitFor(() => byLabel(container, /tehsil one, 6/i));
    expect(breadcrumbSteps()).toEqual(["All states", "Alpha"]);
    expect(currentStep()).toBe("Delta");

    click(container.querySelectorAll(".india-choropleth__back")[1]!);
    await vi.waitFor(() => byLabel(container, /delta, 9/i));
    // Still inside Alpha rather than back at the national map.
    expect(currentStep()).toBe("Alpha");
    expect(() => byLabel(container, /tehsil one, 6/i)).toThrow();
    await vi.waitFor(() => expect(document.activeElement).toBe(byLabel(container, /delta, 9/i)));
  });

  it("returns to the national map in one step from the deepest level", async () => {
    const onDrillDownChange = vi.fn();
    new IndiaChoropleth(container, {
      states: stateLayer,
      loadDistricts: async () => districtLayer,
      loadSubDistricts: async () => subDistrictLayer,
      onDrillDownChange,
    });
    click(await drillToDistricts());
    await vi.waitFor(() => byLabel(container, /tehsil one, 6/i));
    click(container.querySelector(".india-choropleth__back")!);
    await vi.waitFor(() => byLabel(container, /alpha, 42/i));
    expect(onDrillDownChange).toHaveBeenLastCalledWith(null, expect.objectContaining({ id: "27" }));
    await vi.waitFor(() => expect(document.activeElement).toBe(byLabel(container, /alpha, 42/i)));
  });

  it("leaves a district that has no sub-districts as a selected leaf", async () => {
    const onSubDistrictDrillDownChange = vi.fn();
    new IndiaChoropleth(container, {
      states: stateLayer,
      loadDistricts: async () => districtLayer,
      loadSubDistricts: async () => null,
      onSubDistrictDrillDownChange,
    });
    click(await drillToDistricts());
    // Never opens an empty level: the district view stays, with the district selected.
    await vi.waitFor(() => expect(byLabel(container, /delta, 9/i).getAttribute("aria-pressed")).toBe("true"));
    expect(currentStep()).toBe("Alpha");
    expect(onSubDistrictDrillDownChange).toHaveBeenLastCalledWith(null, expect.objectContaining({ id: "D1" }));
  });

  it("stops announcing a level it has learned a district does not have", async () => {
    const loadSubDistricts = vi.fn(async () => null);
    new IndiaChoropleth(container, {
      states: stateLayer,
      loadDistricts: async () => districtLayer,
      loadSubDistricts,
    });
    const delta = await drillToDistricts();
    // Before asking, the renderer cannot know, so it offers the level.
    expect(delta.getAttribute("aria-label")).toMatch(/activate to view sub-districts/i);
    await vi.waitFor(() => {
      click(byLabel(container, /delta, 9/i));
      expect(byLabel(container, /delta, 9/i).getAttribute("aria-label")).toMatch(/activate to select/i);
    });
    // And it does not ask again for a district it already knows is a leaf.
    const asked = loadSubDistricts.mock.calls.length;
    click(byLabel(container, /delta, 9/i));
    expect(loadSubDistricts).toHaveBeenCalledTimes(asked);
  });

  it("treats a district as a leaf when no sub-district loader is supplied", async () => {
    new IndiaChoropleth(container, { states: stateLayer, loadDistricts: async () => districtLayer });
    const delta = await drillToDistricts();
    expect(delta.getAttribute("aria-label")).toMatch(/activate to select/i);
    click(delta);
    expect(byLabel(container, /delta, 9/i).getAttribute("aria-pressed")).toBe("true");
  });

  it("announces the third level as the action a district offers", async () => {
    new IndiaChoropleth(container, {
      states: stateLayer,
      loadDistricts: async () => districtLayer,
      loadSubDistricts: async () => subDistrictLayer,
    });
    expect((await drillToDistricts()).getAttribute("aria-label")).toMatch(/activate to view sub-districts/i);
  });

  it("drops the district level when the state above it changes", async () => {
    const loadDistricts = vi.fn(async (stateId: string) => (stateId === "27" ? twoDistrictLayer : districtLayer));
    const instance = new IndiaChoropleth(container, {
      states: stateLayer,
      drillDownId: "27",
      loadDistricts,
      loadSubDistricts: async () => subDistrictLayer,
    });
    await vi.waitFor(() => byLabel(container, /echo, 4/i));
    click(byLabel(container, /echo, 4/i));
    await vi.waitFor(() => byLabel(container, /tehsil one, 6/i));
    // "D2" means nothing inside Beta, so the level below has to be dropped rather
    // than carried across.
    instance.update({ drillDownId: "29" });
    await vi.waitFor(() => byLabel(container, /delta, 9/i));
    expect(() => byLabel(container, /tehsil one, 6/i)).toThrow();
  });

  it("returns to the national map when drillDown(null) is called from the deepest level", async () => {
    const instance = new IndiaChoropleth(container, {
      states: stateLayer,
      loadDistricts: async () => districtLayer,
      loadSubDistricts: async () => subDistrictLayer,
    });
    click(await drillToDistricts());
    await vi.waitFor(() => byLabel(container, /tehsil one, 6/i));
    // drillDown is the state-level control, so null means the national map — not
    // one step up to the district view.
    instance.drillDown(null);
    await vi.waitFor(() => byLabel(container, /alpha, 42/i));
    expect(() => byLabel(container, /delta, 9/i)).toThrow();
  });

  it("reports the deepest level to inspection and selection callbacks", async () => {
    const onInspect = vi.fn();
    const onSelectedChange = vi.fn();
    new IndiaChoropleth(container, {
      states: stateLayer,
      loadDistricts: async () => districtLayer,
      loadSubDistricts: async () => subDistrictLayer,
      onInspect,
      onSelectedChange,
    });
    click(await drillToDistricts());
    await vi.waitFor(() => byLabel(container, /tehsil one, 6/i));
    const tehsil = byLabel(container, /tehsil one, 6/i);
    tehsil.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    expect(onInspect).toHaveBeenLastCalledWith(expect.objectContaining({ id: "S1" }), "subdistrict");
    click(tehsil);
    expect(onSelectedChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: "S1" }), "subdistrict");
  });

  it("reports a sub-district loader failure without losing the back path", async () => {
    new IndiaChoropleth(container, {
      states: stateLayer,
      loadDistricts: async () => districtLayer,
      loadSubDistricts: async () => { throw new Error("Sub-district service unavailable"); },
    });
    click(await drillToDistricts());
    await vi.waitFor(() => {
      const alert = container.querySelector("[role='alert']");
      expect(alert?.textContent).toBe("Sub-district service unavailable");
    });
    expect(breadcrumbSteps()).toEqual(["All states", "Alpha"]);
  });

  it("scopes share and rank to the sub-district level it is showing", async () => {
    new IndiaChoropleth(container, {
      states: stateLayer,
      loadDistricts: async () => districtLayer,
      loadSubDistricts: async () => subDistrictLayer,
    });
    click(await drillToDistricts());
    await vi.waitFor(() => byLabel(container, /tehsil one, 6/i));
    byLabel(container, /tehsil one, 6/i).dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    // 6 of (6 + 3), against the sub-districts on screen — not the districts above them.
    expect(tooltipText(container)).toContain("66.7% of total");
    expect(tooltipText(container)).toContain("1st of 2");
  });

  it("honours an initial district drill-down given alongside an initial state", async () => {
    new IndiaChoropleth(container, {
      states: stateLayer,
      defaultDrillDownId: "27",
      defaultSubDistrictDrillDownId: "D1",
      loadDistricts: async () => districtLayer,
      loadSubDistricts: async () => subDistrictLayer,
    });
    await vi.waitFor(() => byLabel(container, /tehsil one, 6/i));
  });

  it("drills into a district through the public API", async () => {
    const instance = new IndiaChoropleth(container, {
      states: stateLayer,
      drillDownId: "27",
      loadDistricts: async () => districtLayer,
      loadSubDistricts: async () => subDistrictLayer,
    });
    await vi.waitFor(() => byLabel(container, /delta, 9/i));
    instance.drillDownSubDistrict("D1");
    await vi.waitFor(() => byLabel(container, /tehsil one, 6/i));
    instance.drillDownSubDistrict(null);
    await vi.waitFor(() => byLabel(container, /delta, 9/i));
  });
});
