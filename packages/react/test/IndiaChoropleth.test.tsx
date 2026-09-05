import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { IndiaChoropleth } from "../src";
import type { MapLayer } from "../src";
import { asFeatureCollection } from "../src/geometry";

// Top of the built-in ramp — the color Alpha (the highest value) must keep when selected.
const DEFAULT_TOP_COLOR = "#075b55";
// Bottom of the built-in ramp — the colour the lower of two values gets.
const DEFAULT_BOTTOM_COLOR = "#d9f1ed";

// One ordinary region and one speck a hundredth of a degree across — the shape
// of the real problem (Lakshadweep beside the mainland), at fixture scale.
// Exterior rings wound clockwise in lon/lat, matching the prepared data; the
// other winding reads as the whole globe minus the square and shrinks the map.
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

const stateLayer: MapLayer = {
  geometry: { type: "FeatureCollection", features: [
    { type: "Feature", properties: { code: "27", name: "Alpha", value: 42 }, geometry: { type: "Polygon", coordinates: [[[72, 18], [73, 18], [73, 19], [72, 19], [72, 18]]] } },
    { type: "Feature", properties: { code: "29", name: "Beta", value: 18 }, geometry: { type: "Polygon", coordinates: [[[74, 18], [75, 18], [75, 19], [74, 19], [74, 18]]] } },
  ] },
  getId: (feature) => String(feature.properties?.code),
  getLabel: (feature) => String(feature.properties?.name),
  getValue: (feature) => Number(feature.properties?.value),
};

const districtLayer: MapLayer = { ...stateLayer, geometry: { type: "FeatureCollection", features: [
  { type: "Feature", properties: { code: "D1", name: "Delta", value: 9 }, geometry: { type: "Polygon", coordinates: [[[72, 18], [72.5, 18], [72.5, 19], [72, 19], [72, 18]]] } },
] } };

// Two districts, so "changing the state clears the district below it" and "one
// district is a leaf while its sibling is not" are both expressible.
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

describe("IndiaChoropleth", () => {
  it("gives focus the same tooltip behavior as hover and activates with Enter", async () => {
    const onInspect = vi.fn();
    const onSelectedChange = vi.fn();
    const { container } = render(<IndiaChoropleth states={stateLayer} onInspect={onInspect} onSelectedChange={onSelectedChange} />);
    const alpha = screen.getByRole("button", { name: /alpha, 42/i });
    fireEvent.focus(alpha);
    expect(onInspect).toHaveBeenLastCalledWith(expect.objectContaining({ id: "27" }), "state");
    expect(container.querySelector(".india-choropleth__tooltip")).toHaveTextContent("Alpha");
    fireEvent.keyDown(alpha, { key: "Enter" });
    expect(onSelectedChange).toHaveBeenCalledWith(expect.objectContaining({ id: "27" }), "state");
  });

  it("clears the floating tooltip on mouse leave and blur even with an active selection", async () => {
    const { container } = render(<IndiaChoropleth states={stateLayer} defaultSelectedId="27" />);
    const alpha = screen.getByRole("button", { name: /alpha, 42/i });
    const beta = screen.getByRole("button", { name: /beta, 18/i });

    fireEvent.mouseEnter(beta);
    expect(container.querySelector(".india-choropleth__tooltip")).toHaveTextContent("Beta");
    fireEvent.mouseLeave(container.querySelector(".india-choropleth__canvas")!);
    expect(container.querySelector(".india-choropleth__tooltip")).not.toBeInTheDocument();

    fireEvent.focus(alpha);
    expect(container.querySelector(".india-choropleth__tooltip")).toHaveTextContent("Alpha");
    fireEvent.blur(alpha);
    expect(container.querySelector(".india-choropleth__tooltip")).not.toBeInTheDocument();
  });

  it("clears the floating tooltip when the pointer moves onto blank canvas without leaving the canvas", () => {
    // The canvas is far wider than the drawn map, so the common real-world gesture is
    // region -> empty space *inside* the canvas, which never fires the canvas mouse leave.
    // Driving mouseOut/mouseOver with relatedTarget is what makes React derive the
    // enter/leave pair the way a real pointer does.
    const { container } = render(<IndiaChoropleth states={stateLayer} defaultSelectedId="27" />);
    const svg = container.querySelector(".india-choropleth__svg")!;
    const beta = screen.getByRole("button", { name: /beta, 18/i });

    fireEvent.mouseOver(beta, { relatedTarget: null });
    expect(container.querySelector(".india-choropleth__tooltip")).toHaveTextContent("Beta");

    // A real pointer moving from a region onto blank canvas fires mouseout on the
    // region; React derives the leave from it. The canvas itself is never left.
    fireEvent.mouseOut(beta, { relatedTarget: svg });
    expect(container.querySelector(".india-choropleth__tooltip")).not.toBeInTheDocument();
  });

  it("switches the floating tooltip straight to an adjacent region without blanking", () => {
    const onInspect = vi.fn();
    const { container } = render(<IndiaChoropleth states={stateLayer} onInspect={onInspect} />);
    const alpha = screen.getByRole("button", { name: /alpha, 42/i });
    const beta = screen.getByRole("button", { name: /beta, 18/i });

    fireEvent.mouseOver(alpha, { relatedTarget: null });
    expect(container.querySelector(".india-choropleth__tooltip")).toHaveTextContent("Alpha");

    fireEvent.mouseOut(alpha, { relatedTarget: beta });
    fireEvent.mouseOver(beta, { relatedTarget: alpha });
    expect(container.querySelector(".india-choropleth__tooltip")).toHaveTextContent("Beta");
    expect(onInspect).toHaveBeenLastCalledWith(expect.objectContaining({ label: "Beta" }), "state");
  });

  it("still reports inspection when breadcrumb-back restores focus to the region it primed", async () => {
    const onInspect = vi.fn();
    render(<IndiaChoropleth states={stateLayer} loadDistricts={async () => districtLayer} onInspect={onInspect} />);
    fireEvent.click(screen.getByRole("button", { name: /alpha, 42/i }));
    expect(await screen.findByRole("button", { name: /delta, 9/i })).toBeInTheDocument();

    onInspect.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "All states" }));
    const alpha = screen.getByRole("button", { name: /alpha, 42/i });
    await waitFor(() => expect(alpha).toHaveFocus());
    // `goBack` primes the inspected id, then focus restoration re-inspects the same
    // region — the redundant-clear guard must not swallow that notification.
    expect(onInspect).toHaveBeenCalledWith(expect.objectContaining({ label: "Alpha" }), "state");
  });

  it("loads districts only after a state activation and supports breadcrumb return", async () => {
    const loadDistricts = vi.fn(async () => districtLayer);
    const onDrillDownChange = vi.fn();
    render(<IndiaChoropleth states={stateLayer} loadDistricts={loadDistricts} onDrillDownChange={onDrillDownChange} />);
    fireEvent.click(screen.getByRole("button", { name: /alpha, 42/i }));
    await waitFor(() => expect(loadDistricts).toHaveBeenCalledWith("27", expect.objectContaining({ label: "Alpha" })));
    expect(await screen.findByRole("button", { name: /delta, 9/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All states" }));
    expect(onDrillDownChange).toHaveBeenLastCalledWith(null, expect.objectContaining({ id: "27" }));
    const alpha = screen.getByRole("button", { name: /alpha, 42/i });
    expect(alpha).toBeInTheDocument();
    await waitFor(() => expect(alpha).toHaveFocus());
  });

  it("keeps hierarchy visible for empty district data and clears inspection with Escape", async () => {
    const { container } = render(<IndiaChoropleth states={stateLayer} loadDistricts={async () => ({ ...districtLayer, geometry: { type: "FeatureCollection", features: [] } })} />);
    const alpha = screen.getByRole("button", { name: /alpha, 42/i });
    fireEvent.focus(alpha);
    expect(container.querySelector(".india-choropleth__tooltip")).toHaveTextContent("Alpha");
    fireEvent.keyDown(alpha, { key: "Escape" });
    expect(container.querySelector(".india-choropleth__tooltip")).not.toBeInTheDocument();
    fireEvent.click(alpha);
    expect(await screen.findByText("No district data is available for this state.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All states" })).toBeInTheDocument();
    expect(container.querySelector(".india-choropleth__tooltip")).not.toBeInTheDocument();
  });

  it("keeps zero, negative, and missing values distinct", () => {
    const { container } = render(<IndiaChoropleth states={valueEdgeLayer} />);
    expect(screen.getByRole("button", { name: /zero, 0/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /negative, -5/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /missing, no data/i })).toBeInTheDocument();
    fireEvent.focus(screen.getByRole("button", { name: /zero, 0/i }));
    expect(container.querySelector(".india-choropleth__tooltip")).toHaveTextContent("0");
  });

  it("reports a district loader failure without losing the back path", async () => {
    render(<IndiaChoropleth states={stateLayer} loadDistricts={async () => { throw new Error("District service unavailable"); }} />);
    fireEvent.click(screen.getByRole("button", { name: /alpha, 42/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("District service unavailable");
    expect(screen.getByRole("button", { name: "All states" })).toBeInTheDocument();
  });

  it("does not flash a prior state's districts while a controlled drill-down changes", async () => {
    let resolveAlpha: ((layer: MapLayer) => void) | undefined;
    let resolveBeta: ((layer: MapLayer) => void) | undefined;
    const loadDistricts = vi.fn((id: string) => new Promise<MapLayer>((resolve) => {
      if (id === "27") resolveAlpha = resolve;
      else resolveBeta = resolve;
    }));
    const { rerender } = render(<IndiaChoropleth states={stateLayer} defaultDrillDownId="27" loadDistricts={loadDistricts} />);
    await waitFor(() => expect(resolveAlpha).toBeDefined());
    resolveAlpha?.(districtLayer);
    expect(await screen.findByRole("button", { name: /delta, 9/i })).toBeInTheDocument();
    rerender(<IndiaChoropleth states={stateLayer} drillDownId="29" loadDistricts={loadDistricts} />);
    expect(screen.queryByRole("button", { name: /delta, 9/i })).not.toBeInTheDocument();
    await waitFor(() => expect(resolveBeta).toBeDefined());
  });

  it("honours controlled drill-down and selection while still emitting callbacks", () => {
    const onDrillDownChange = vi.fn();
    const onSelectedChange = vi.fn();
    render(
      <IndiaChoropleth
        states={stateLayer}
        drillDownId={null}
        selectedId="29"
        loadDistricts={async () => districtLayer}
        onDrillDownChange={onDrillDownChange}
        onSelectedChange={onSelectedChange}
      />,
    );
    const alpha = screen.getByRole("button", { name: /alpha, 42/i });
    const beta = screen.getByRole("button", { name: /beta, 18/i });
    expect(beta).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(alpha);
    expect(onSelectedChange).toHaveBeenCalledWith(expect.objectContaining({ id: "27" }), "state");
    expect(onDrillDownChange).toHaveBeenCalledWith("27", expect.objectContaining({ id: "27" }));
    expect(beta).toHaveAttribute("aria-pressed", "true");
    expect(alpha).toHaveAttribute("aria-pressed", "false");
  });

  it("rejects a TopoJSON layer that names no object", () => {
    expect(() => asFeatureCollection({ topology: { type: "Topology", objects: {}, arcs: [] }, object: "missing" })).toThrow(
      "The named TopoJSON object does not exist in this topology.",
    );
  });

  it("renders safely through the server renderer", () => {
    expect(renderToString(<IndiaChoropleth states={stateLayer} />)).toContain("Interactive choropleth map");
  });

  it("renders a national reference overlay as non-interactive unavailable geometry", async () => {
    render(<IndiaChoropleth states={stateLayer} referenceOverlay={referenceOverlay} loadDistricts={async () => districtLayer} />);
    const referenceArea = screen.getByRole("img", { name: /reference area\. national reference outline; hatched portions outside the statistical layer have no data/i });
    expect(referenceArea).toHaveAttribute("fill", expect.stringMatching(/^url\(#/));
    expect(referenceArea).not.toHaveAttribute("tabindex");
    expect(screen.getByText("Reference context · data unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /alpha, 42/i }));
    await screen.findByRole("button", { name: /delta, 9/i });
    expect(screen.queryByRole("img", { name: /reference area/i })).not.toBeInTheDocument();
  });

  it("renders state values and can merge a state seam into reference context", () => {
    const { container } = render(
      <IndiaChoropleth
        states={stateLayer}
        showRegionValues
        referenceOverlayMergeIds={["27"]}
      />,
    );
    const labels = container.querySelector(".india-choropleth__region-values");
    expect(labels?.textContent).toContain("42");
    expect(labels?.textContent).toContain("18");
    expect(container.querySelectorAll(".india-choropleth__region--reference-merged")).toHaveLength(1);
  });

  it("renders values on the district layer when enabled", async () => {
    render(<IndiaChoropleth states={stateLayer} loadDistricts={async () => districtLayer} showRegionValues />);
    fireEvent.click(screen.getByRole("button", { name: /alpha, 42/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /delta, 9/i })).toBeInTheDocument());
    expect(document.querySelector(".india-choropleth__region-values--district")?.textContent).toContain("9");
  });

  it("loads state-keyed district reference context without making it a district data point", async () => {
    const districtOverlay = { ...referenceOverlay, getLabel: () => "Historical context outline" };
    render(
      <IndiaChoropleth
        states={stateLayer}
        loadDistricts={async () => districtLayer}
        loadDistrictReferenceOverlay={async (stateId) => stateId === "27" ? districtOverlay : null}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /alpha, 42/i }));
    const context = await screen.findByRole("img", { name: /historical context outline\. national reference outline/i });
    expect(context).not.toHaveAttribute("tabindex");
    expect(screen.getByText("Reference context · data unavailable")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delta, 9/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /historical context outline/i })).not.toBeInTheDocument();
  });

  it("drops a stale district reference overlay when controlled drill-down changes", async () => {
    let resolveAlpha: ((overlay: typeof referenceOverlay | null) => void) | undefined;
    const loadDistrictReferenceOverlay = vi.fn((id: string) => new Promise<typeof referenceOverlay | null>((resolve) => {
      if (id === "27") resolveAlpha = resolve;
      else resolve(null);
    }));
    const { rerender } = render(
      <IndiaChoropleth states={stateLayer} drillDownId="27" loadDistricts={async () => districtLayer} loadDistrictReferenceOverlay={loadDistrictReferenceOverlay} />,
    );
    await waitFor(() => expect(resolveAlpha).toBeDefined());
    rerender(<IndiaChoropleth states={stateLayer} drillDownId="29" loadDistricts={async () => districtLayer} loadDistrictReferenceOverlay={loadDistrictReferenceOverlay} />);
    resolveAlpha?.(referenceOverlay);
    await waitFor(() => expect(loadDistrictReferenceOverlay).toHaveBeenCalledWith("29", expect.objectContaining({ id: "29" })));
    expect(screen.queryByRole("img", { name: /reference area/i })).not.toBeInTheDocument();
  });
  // These mirror packages/js/test/IndiaChoropleth.test.ts case for case. The two
  // renderers are meant to stay behaviorally identical; drift shows up here first.
  it("shows value, share of total and rank in the default tooltip", () => {
    const { container } = render(<IndiaChoropleth states={stateLayer} />);
    fireEvent.focus(screen.getByRole("button", { name: /alpha, 42/i }));
    expect(container.querySelector(".india-choropleth__tooltip")).toHaveTextContent("70.0% of total");
    expect(container.querySelector(".india-choropleth__tooltip")).toHaveTextContent("1st of 2");

    fireEvent.focus(screen.getByRole("button", { name: /beta, 18/i }));
    expect(container.querySelector(".india-choropleth__tooltip")).toHaveTextContent("2nd of 2");
  });

  it("omits share and rank for a region with no data, and says so", () => {
    const { container } = render(<IndiaChoropleth states={valueEdgeLayer} />);
    fireEvent.focus(screen.getByRole("button", { name: /missing, no data/i }));
    const tooltip = container.querySelector(".india-choropleth__tooltip")!;
    expect(tooltip).toHaveTextContent("No data");
    expect(tooltip.textContent).not.toMatch(/of total|of \d/);
  });

  it("ranks ties equally rather than picking an arbitrary winner", () => {
    const tied: MapLayer = { ...stateLayer, getValue: () => 10 };
    const { container } = render(<IndiaChoropleth states={tied} />);
    fireEvent.focus(screen.getByRole("button", { name: /alpha, 10/i }));
    expect(container.querySelector(".india-choropleth__tooltip")).toHaveTextContent("1st of 2");
    fireEvent.focus(screen.getByRole("button", { name: /beta, 10/i }));
    expect(container.querySelector(".india-choropleth__tooltip")).toHaveTextContent("1st of 2");
  });

  it("is not an aria-live region — it is announced on focus via aria-describedby instead", () => {
    const { container } = render(<IndiaChoropleth states={stateLayer} />);
    const alpha = screen.getByRole("button", { name: /alpha, 42/i });
    fireEvent.focus(alpha);
    const tooltip = container.querySelector(".india-choropleth__tooltip")!;
    expect(tooltip.getAttribute("role")).toBeNull();
    expect(tooltip.getAttribute("aria-live")).toBeNull();
    expect(alpha.getAttribute("aria-describedby")).toBe(tooltip.id);
  });

  it("keeps the share bar out of the accessibility tree, since it repeats the share text", () => {
    const { container } = render(<IndiaChoropleth states={stateLayer} />);
    fireEvent.focus(screen.getByRole("button", { name: /alpha, 42/i }));
    const bar = container.querySelector(".india-choropleth__tooltip-bar")!;
    expect(bar.getAttribute("aria-hidden")).toBe("true");
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("70%");
  });

  it("marks selection with a ring and leaves the region fill carrying the data", () => {
    const { container } = render(<IndiaChoropleth states={stateLayer} defaultSelectedId="27" />);
    const alpha = container.querySelector(".india-choropleth__region--selected") as SVGPathElement;
    const ring = container.querySelector(".india-choropleth__selection-ring")!;
    // The fill still comes from the color scale, not from the selection accent.
    expect(alpha.getAttribute("fill")).toBe(DEFAULT_TOP_COLOR);
    expect(ring.getAttribute("d")).toBe(alpha.getAttribute("d"));
    // Drawn last, so a later-drawn neighbour cannot paint over the outline.
    expect(container.querySelector(".india-choropleth__svg")!.lastElementChild!.classList.contains("india-choropleth__selection")).toBe(true);
  });

  it("lifts the selection ring only while the selected region is the hovered one", () => {
    const { container } = render(<IndiaChoropleth states={stateLayer} defaultSelectedId="27" />);
    const group = () => container.querySelector(".india-choropleth__selection")!;
    expect(group().classList.contains("india-choropleth__selection--lifted")).toBe(false);
    fireEvent.focus(screen.getByRole("button", { name: /alpha, 42/i }));
    expect(group().classList.contains("india-choropleth__selection--lifted")).toBe(true);
    fireEvent.focus(screen.getByRole("button", { name: /beta, 18/i }));
    expect(group().classList.contains("india-choropleth__selection--lifted")).toBe(false);
  });

  it("flips the tooltip below a region near the top edge instead of outside the map", () => {
    // jsdom reports zero-size rects, so the placement effect would early-return.
    // Stub just the two elements it measures: a tooltip whose default position
    // lands above the canvas top is the Jammu & Kashmir case at a narrow width.
    const rect = (left: number, top: number, width: number, height: number) =>
      ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
    const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.classList.contains("india-choropleth__tooltip-anchor")) return rect(300, 180, 160, 70);
      if (this.classList.contains("india-choropleth__canvas")) return rect(100, 200, 600, 400);
      return rect(0, 0, 0, 0);
    });

    const { container } = render(<IndiaChoropleth states={stateLayer} />);
    fireEvent.focus(screen.getByRole("button", { name: /alpha, 42/i }));
    const anchor = container.querySelector<HTMLElement>(".india-choropleth__tooltip-anchor")!;
    expect(anchor.style.getPropertyValue("--india-map-tooltip-dy")).toBe("12px");
    spy.mockRestore();
  });

  it("draws a marker for a region whose geometry is sub-pixel at this scale", () => {
    const { container } = render(<IndiaChoropleth states={smallRegionLayer} />);
    const markers = [...container.querySelectorAll(".india-choropleth__small-markers circle")];
    expect(markers.length).toBe(1);
    expect(markers[0]!.getAttribute("fill")).toBe(DEFAULT_BOTTOM_COLOR);
  });

  it("moves a small region's value outside the shape, with a leader line", () => {
    const { container } = render(<IndiaChoropleth states={smallRegionLayer} showRegionValues />);
    const speck = [...container.querySelectorAll(".india-choropleth__region-values text")]
      .find((node) => node.textContent === "1")!;
    const marker = container.querySelector(".india-choropleth__small-markers circle")!;
    const distance = Math.hypot(
      Number(speck.getAttribute("x")) - Number(marker.getAttribute("cx")),
      Number(speck.getAttribute("y")) - Number(marker.getAttribute("cy")),
    );
    expect(distance).toBeGreaterThan(4);
    expect(container.querySelectorAll(".india-choropleth__value-leaders line").length).toBe(1);
  });

  it("clears the selection when a click lands on open background", () => {
    const onSelectedChange = vi.fn();
    const { container } = render(
      <IndiaChoropleth states={stateLayer} defaultSelectedId="27" onSelectedChange={onSelectedChange} />,
    );
    expect(container.querySelectorAll(".india-choropleth__selection").length).toBe(1);

    fireEvent.click(container.querySelector(".india-choropleth__svg")!);

    expect(container.querySelectorAll(".india-choropleth__selection").length).toBe(0);
    expect(onSelectedChange).toHaveBeenCalledWith(null, "state");
  });

  it("reports a background click through onBackgroundClick", () => {
    const onBackgroundClick = vi.fn();
    const { container } = render(<IndiaChoropleth states={stateLayer} onBackgroundClick={onBackgroundClick} />);
    fireEvent.click(container.querySelector(".india-choropleth__svg")!);
    expect(onBackgroundClick).toHaveBeenCalledTimes(1);
  });


  it("keeps Puducherry's true outline while its neighbour is exaggerated", () => {
    // Puducherry is enclaves inside another state: grown to the visibility
    // threshold they land several units inside Tamil Nadu. Lakshadweep grows
    // into open sea, so it still gets the help.
    const pathFor = (id: string, minPartExtent: number) => {
      const { container, unmount } = render(
        <IndiaChoropleth states={enclaveLayer} minPartExtent={minPartExtent} />,
      );
      const d = [...container.querySelectorAll(".india-choropleth__region")]
        .find((node) => (node.getAttribute("aria-label") ?? "").startsWith(id))!
        .getAttribute("d");
      unmount();
      return d;
    };

    expect(pathFor("Puducherry", 14)).toBe(pathFor("Puducherry", 0));
    expect(pathFor("Lakshadweep", 14)).not.toBe(pathFor("Lakshadweep", 0));
  });

  it("makes the water inside an island group part of the group", () => {
    const { container } = render(<IndiaChoropleth states={islandGroupLayer} />);
    const hits = [...container.querySelectorAll(".india-choropleth__hit-areas path")];
    expect(hits.length).toBe(1); // the group, not the single-part mainland

    fireEvent.mouseEnter(hits[0]!);
    expect(container.querySelector(".india-choropleth__tooltip")).toHaveTextContent("Islands");
    fireEvent.click(hits[0]!);
    expect(container.querySelectorAll(".india-choropleth__selection").length).toBe(1);
  });

  it("paints every region on top of every hit area, so a hull never steals a hover", () => {
    // The hull spanning Lakshadweep's islands is open sea, but Puducherry's spans
    // the Tamil Nadu coast. Document order is what keeps the real state in front.
    const { container } = render(<IndiaChoropleth states={islandGroupLayer} />);
    const svg = container.querySelector(".india-choropleth__svg")!;
    const nodes = [...svg.querySelectorAll(".india-choropleth__hit-areas, .india-choropleth__region")];
    expect(svg.querySelectorAll(".india-choropleth__hit-areas path").length).toBe(1);
    expect(nodes[0]!.classList.contains("india-choropleth__hit-areas")).toBe(true);
    expect(nodes.slice(1).every((node) => node.classList.contains("india-choropleth__region"))).toBe(true);
  });

  it("hovers a region through the marker standing in for it", () => {
    // Without this the dot is visible and inert: the outline it replaces is a
    // couple of units across, which is not a pointer target.
    const { container } = render(<IndiaChoropleth states={smallRegionLayer} />);
    const marker = container.querySelector(".india-choropleth__small-markers circle")!;

    fireEvent.mouseEnter(marker);
    expect(container.querySelector(".india-choropleth__tooltip")).toHaveTextContent("Speck");
    fireEvent.mouseLeave(marker);
    expect(container.querySelectorAll(".india-choropleth__tooltip").length).toBe(0);
  });

  it("leaves hit areas and marker taps out of a static map", () => {
    const { container } = render(<IndiaChoropleth states={islandGroupLayer} interactive={false} />);
    expect(container.querySelectorAll(".india-choropleth__hit-areas").length).toBe(0);
  });

  it("filters the map to the swatch you pick — exactly the regions painted in it", () => {
    // The requirement in one assertion: picking the last colour highlights the
    // states drawn in that colour, and nothing else.
    const { container } = render(<IndiaChoropleth states={rampLayer} colorScale={RAMP} />);
    const swatches = () => [...container.querySelectorAll<HTMLButtonElement>("button.india-choropleth__swatch")];
    const regions = () => [...container.querySelectorAll(".india-choropleth__region")];
    const named = (nodes: Element[]) =>
      nodes.map((node) => (node.getAttribute("aria-label") ?? "").split(",")[0]).sort();

    expect(swatches()).toHaveLength(3);
    fireEvent.click(swatches()[2]!);

    const lit = regions().filter((node) => !node.classList.contains("india-choropleth__dimmed"));
    const painted = regions().filter((node) => node.getAttribute("fill") === RAMP[2]);
    expect(named(painted)).toEqual(["High"]);
    expect(named(lit)).toEqual(named(painted));
  });

  it("clears the filter when the pressed swatch is picked again, and on Escape", () => {
    const { container } = render(<IndiaChoropleth states={rampLayer} colorScale={RAMP} />);
    const swatch = (index: number) => container.querySelectorAll<HTMLButtonElement>("button.india-choropleth__swatch")[index]!;
    const dimmed = () => container.querySelectorAll(".india-choropleth__region.india-choropleth__dimmed").length;

    fireEvent.click(swatch(0));
    expect(dimmed()).toBe(2);
    expect(swatch(0).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(swatch(0));
    expect(dimmed()).toBe(0);
    expect(swatch(0).getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(swatch(0));
    expect(dimmed()).toBe(2);
    fireEvent.keyDown(container.querySelector(".india-choropleth__legend")!, { key: "Escape" });
    expect(dimmed()).toBe(0);
  });

  it("dims a region's marker, value and leader line along with the region", () => {
    const { container } = render(<IndiaChoropleth states={smallRegionLayer} showRegionValues />);
    // Two regions, seven default colours: the speck is in the bottom band.
    fireEvent.click(container.querySelectorAll<HTMLButtonElement>("button.india-choropleth__swatch")[6]!);

    expect(container.querySelector(".india-choropleth__small-markers circle")!.classList)
      .toContain("india-choropleth__dimmed");
    expect(container.querySelector(".india-choropleth__value-leaders line")!.classList)
      .toContain("india-choropleth__dimmed");
    // Bigland holds the top band, so its own value stays lit.
    const values = [...container.querySelectorAll(".india-choropleth__region-values text")];
    expect(values.filter((node) => node.classList.contains("india-choropleth__dimmed"))).toHaveLength(1);
  });

  it("leaves a swatch with nothing in it inert, rather than dimming the whole map", () => {
    // Values 0, 5 and 10 on a three-colour ramp fill every band; adding a fourth
    // colour leaves one with nothing near its stop.
    const { container } = render(<IndiaChoropleth states={rampLayer} colorScale={["#111111", "#222222", "#333333", "#444444"]} />);
    const empty = [...container.querySelectorAll<HTMLButtonElement>("button.india-choropleth__swatch")]
      .find((node) => node.getAttribute("aria-disabled") === "true")!;
    expect(empty.getAttribute("aria-label")).toBe("No regions in this band");

    fireEvent.click(empty);
    expect(container.querySelectorAll(".india-choropleth__dimmed").length).toBe(0);
  });

  it("names each swatch by what it would highlight", () => {
    const { container } = render(<IndiaChoropleth states={rampLayer} colorScale={RAMP} />);
    const labels = [...container.querySelectorAll("button.india-choropleth__swatch")]
      .map((node) => node.getAttribute("aria-label"));
    expect(labels).toEqual([
      "Highlight 1 region, 0",
      "Highlight 1 region, 5",
      "Highlight 1 region, 10",
    ]);
  });

  it("drops the filter on drill-down, where the bands mean something else", async () => {
    const { container } = render(
      <IndiaChoropleth states={stateLayer} loadDistricts={async () => districtLayer} />,
    );
    fireEvent.click(container.querySelectorAll<HTMLButtonElement>("button.india-choropleth__swatch")[6]!);
    expect(container.querySelectorAll(".india-choropleth__region.india-choropleth__dimmed").length).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: /alpha, 42/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /delta, 9/i })).toBeTruthy());
    expect(container.querySelectorAll(".india-choropleth__dimmed").length).toBe(0);
    expect([...container.querySelectorAll("button.india-choropleth__swatch")]
      .every((node) => node.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("leaves the legend as plain swatches on a static map", () => {
    const { container } = render(<IndiaChoropleth states={rampLayer} colorScale={RAMP} interactive={false} />);
    expect(container.querySelectorAll("button.india-choropleth__swatch").length).toBe(0);
    expect(container.querySelectorAll(".india-choropleth__swatch").length).toBe(3);
    expect(container.querySelector(".india-choropleth__swatches")!.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("IndiaChoropleth sub-district drill-down", () => {
  const drillToDistricts = async () => {
    fireEvent.click(screen.getByRole("button", { name: /alpha, 42/i }));
    return screen.findByRole("button", { name: /delta, 9/i });
  };

  it("loads sub-districts only after a district activation, one level at a time", async () => {
    const loadSubDistricts = vi.fn(async () => subDistrictLayer);
    const onSubDistrictDrillDownChange = vi.fn();
    render(
      <IndiaChoropleth
        states={stateLayer}
        loadDistricts={async () => districtLayer}
        loadSubDistricts={loadSubDistricts}
        onSubDistrictDrillDownChange={onSubDistrictDrillDownChange}
      />,
    );
    const delta = await drillToDistricts();
    expect(loadSubDistricts).not.toHaveBeenCalled();
    fireEvent.click(delta);
    await waitFor(() => expect(loadSubDistricts).toHaveBeenCalledWith("D1", expect.objectContaining({ label: "Delta" }), "27"));
    expect(await screen.findByRole("button", { name: /tehsil one, 6/i })).toBeInTheDocument();
    expect(onSubDistrictDrillDownChange).toHaveBeenCalledWith("D1", expect.objectContaining({ id: "D1" }));
  });

  it("offers a three-level breadcrumb whose back step goes up one level, not to the top", async () => {
    render(<IndiaChoropleth states={stateLayer} loadDistricts={async () => districtLayer} loadSubDistricts={async () => subDistrictLayer} />);
    fireEvent.click(await drillToDistricts());
    expect(await screen.findByRole("button", { name: /tehsil one, 6/i })).toBeInTheDocument();
    // At the deepest level both ancestors are reachable and the leaf is current.
    expect(screen.getByRole("button", { name: "All states" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByText("Delta", { selector: "[aria-current='page']" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    const delta = await screen.findByRole("button", { name: /delta, 9/i });
    expect(delta).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /tehsil one, 6/i })).not.toBeInTheDocument();
    // Still inside Alpha rather than back at the national map.
    expect(screen.getByText("Alpha", { selector: "[aria-current='page']" })).toBeInTheDocument();
    await waitFor(() => expect(delta).toHaveFocus());
  });

  it("returns to the national map in one step from the deepest level", async () => {
    const onDrillDownChange = vi.fn();
    render(
      <IndiaChoropleth
        states={stateLayer}
        loadDistricts={async () => districtLayer}
        loadSubDistricts={async () => subDistrictLayer}
        onDrillDownChange={onDrillDownChange}
      />,
    );
    fireEvent.click(await drillToDistricts());
    expect(await screen.findByRole("button", { name: /tehsil one, 6/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All states" }));
    const alpha = await screen.findByRole("button", { name: /alpha, 42/i });
    expect(alpha).toBeInTheDocument();
    expect(onDrillDownChange).toHaveBeenLastCalledWith(null, expect.objectContaining({ id: "27" }));
    await waitFor(() => expect(alpha).toHaveFocus());
  });

  it("leaves a district that has no sub-districts as a selected leaf", async () => {
    const onSubDistrictDrillDownChange = vi.fn();
    render(
      <IndiaChoropleth
        states={stateLayer}
        loadDistricts={async () => districtLayer}
        loadSubDistricts={async () => null}
        onSubDistrictDrillDownChange={onSubDistrictDrillDownChange}
      />,
    );
    const delta = await drillToDistricts();
    fireEvent.click(delta);
    // Never opens an empty level: the district view stays, with the district selected.
    await waitFor(() => expect(screen.getByRole("button", { name: /delta, 9/i })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByText("Alpha", { selector: "[aria-current='page']" })).toBeInTheDocument();
    expect(onSubDistrictDrillDownChange).toHaveBeenLastCalledWith(null, expect.objectContaining({ id: "D1" }));
  });

  it("stops announcing a level it has learned a district does not have", async () => {
    const loadSubDistricts = vi.fn(async () => null);
    render(<IndiaChoropleth states={stateLayer} loadDistricts={async () => districtLayer} loadSubDistricts={loadSubDistricts} />);
    const delta = await drillToDistricts();
    // Before asking, the renderer cannot know, so it offers the level.
    expect(delta).toHaveAccessibleName(/activate to view sub-districts/i);
    fireEvent.click(delta);
    await waitFor(() => expect(screen.getByRole("button", { name: /delta, 9/i })).toHaveAccessibleName(/activate to select/i));
    // And it does not ask again for a district it already knows is a leaf.
    fireEvent.click(screen.getByRole("button", { name: /delta, 9/i }));
    expect(loadSubDistricts).toHaveBeenCalledTimes(1);
  });

  it("treats a district as a leaf when no sub-district loader is supplied", async () => {
    render(<IndiaChoropleth states={stateLayer} loadDistricts={async () => districtLayer} />);
    const delta = await drillToDistricts();
    expect(delta).toHaveAccessibleName(/activate to select/i);
    fireEvent.click(delta);
    expect(delta).toHaveAttribute("aria-pressed", "true");
  });

  it("announces the third level as the action a district offers", async () => {
    render(<IndiaChoropleth states={stateLayer} loadDistricts={async () => districtLayer} loadSubDistricts={async () => subDistrictLayer} />);
    expect(await drillToDistricts()).toHaveAccessibleName(/activate to view sub-districts/i);
  });

  it("drops the district level when the state above it changes", async () => {
    const loadDistricts = vi.fn(async (stateId: string) => (stateId === "27" ? twoDistrictLayer : districtLayer));
    const { rerender } = render(
      <IndiaChoropleth
        states={stateLayer}
        drillDownId="27"
        loadDistricts={loadDistricts}
        loadSubDistricts={async () => subDistrictLayer}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /echo, 4/i }));
    expect(await screen.findByRole("button", { name: /tehsil one, 6/i })).toBeInTheDocument();
    // "D2" means nothing inside Beta, so the level below has to be dropped rather
    // than carried across.
    rerender(
      <IndiaChoropleth
        states={stateLayer}
        drillDownId="29"
        loadDistricts={loadDistricts}
        loadSubDistricts={async () => subDistrictLayer}
      />,
    );
    expect(await screen.findByRole("button", { name: /delta, 9/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /tehsil one, 6/i })).not.toBeInTheDocument();
  });

  it("reports the deepest level to inspection and selection callbacks", async () => {
    const onInspect = vi.fn();
    const onSelectedChange = vi.fn();
    render(
      <IndiaChoropleth
        states={stateLayer}
        loadDistricts={async () => districtLayer}
        loadSubDistricts={async () => subDistrictLayer}
        onInspect={onInspect}
        onSelectedChange={onSelectedChange}
      />,
    );
    fireEvent.click(await drillToDistricts());
    const tehsil = await screen.findByRole("button", { name: /tehsil one, 6/i });
    fireEvent.focus(tehsil);
    expect(onInspect).toHaveBeenLastCalledWith(expect.objectContaining({ id: "S1" }), "subdistrict");
    fireEvent.click(tehsil);
    expect(onSelectedChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: "S1" }), "subdistrict");
  });

  it("honours an initial district drill-down given alongside an initial state", async () => {
    render(
      <IndiaChoropleth
        states={stateLayer}
        defaultDrillDownId="27"
        defaultSubDistrictDrillDownId="D1"
        loadDistricts={async () => districtLayer}
        loadSubDistricts={async () => subDistrictLayer}
      />,
    );
    expect(await screen.findByRole("button", { name: /tehsil one, 6/i })).toBeInTheDocument();
  });

  it("reports a sub-district loader failure without losing the back path", async () => {
    render(
      <IndiaChoropleth
        states={stateLayer}
        loadDistricts={async () => districtLayer}
        loadSubDistricts={async () => { throw new Error("Sub-district service unavailable"); }}
      />,
    );
    fireEvent.click(await drillToDistricts());
    expect(await screen.findByRole("alert")).toHaveTextContent("Sub-district service unavailable");
    expect(screen.getByRole("button", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All states" })).toBeInTheDocument();
  });

  it("scopes share and rank to the sub-district level it is showing", async () => {
    const { container } = render(
      <IndiaChoropleth
        states={stateLayer}
        loadDistricts={async () => districtLayer}
        loadSubDistricts={async () => subDistrictLayer}
      />,
    );
    fireEvent.click(await drillToDistricts());
    const tehsil = await screen.findByRole("button", { name: /tehsil one, 6/i });
    fireEvent.focus(tehsil);
    // 6 of (6 + 3), against the sub-districts on screen — not the districts above them.
    expect(container.querySelector(".india-choropleth__tooltip")).toHaveTextContent("66.7% of total");
    expect(container.querySelector(".india-choropleth__tooltip")).toHaveTextContent("1st of 2");
  });
});

describe("repainting values without reloading the level below", () => {
  /** The same geometry and accessors, with one state's number changed. */
  function withValues(values: Record<string, number>): MapLayer {
    return { ...stateLayer, getValue: (feature) => values[String(feature.properties?.code)] ?? null };
  }

  it("does not call loadDistricts again when only the state values change", async () => {
    const loadDistricts = vi.fn(async () => districtLayer);
    const { rerender } = render(
      <IndiaChoropleth states={withValues({ "27": 42, "29": 18 })} defaultDrillDownId="27" loadDistricts={loadDistricts} />,
    );
    expect(await screen.findByRole("button", { name: /delta, 9/i })).toBeInTheDocument();
    expect(loadDistricts).toHaveBeenCalledTimes(1);

    // A dashboard on a timer hands over a new layer for every tick. The districts
    // on screen must survive it: reloading them blanks the level mid-flight.
    rerender(<IndiaChoropleth states={withValues({ "27": 43, "29": 18 })} defaultDrillDownId="27" loadDistricts={loadDistricts} />);
    rerender(<IndiaChoropleth states={withValues({ "27": 44, "29": 19 })} defaultDrillDownId="27" loadDistricts={loadDistricts} />);
    expect(loadDistricts).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /delta, 9/i })).toBeInTheDocument();
  });

  it("does not call loadSubDistricts again when only the state values change", async () => {
    const loadSubDistricts = vi.fn(async () => subDistrictLayer);
    // Hoisted, not inline: a loader whose identity changes every render is a
    // reload trigger in its own right, which would mask what this test measures.
    const loadDistricts = async () => districtLayer;
    const { rerender } = render(
      <IndiaChoropleth
        states={withValues({ "27": 42 })}
        defaultDrillDownId="27"
        defaultSubDistrictDrillDownId="D1"
        loadDistricts={loadDistricts}
        loadSubDistricts={loadSubDistricts}
      />,
    );
    expect(await screen.findByRole("button", { name: /tehsil one, 6/i })).toBeInTheDocument();
    expect(loadSubDistricts).toHaveBeenCalledTimes(1);

    rerender(
      <IndiaChoropleth
        states={withValues({ "27": 99 })}
        defaultDrillDownId="27"
        defaultSubDistrictDrillDownId="D1"
        loadDistricts={loadDistricts}
        loadSubDistricts={loadSubDistricts}
      />,
    );
    expect(loadSubDistricts).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /tehsil one, 6/i })).toBeInTheDocument();
  });

  it("still reloads districts when the geometry itself changes", async () => {
    const loadDistricts = vi.fn(async () => districtLayer);
    const swapped: MapLayer = {
      ...stateLayer,
      geometry: { type: "FeatureCollection", features: [
        { type: "Feature", properties: { code: "27", name: "Alpha", value: 42 }, geometry: { type: "Polygon", coordinates: [[[70, 16], [71, 16], [71, 17], [70, 17], [70, 16]]] } },
      ] },
    };
    const { rerender } = render(<IndiaChoropleth states={stateLayer} defaultDrillDownId="27" loadDistricts={loadDistricts} />);
    expect(await screen.findByRole("button", { name: /delta, 9/i })).toBeInTheDocument();
    expect(loadDistricts).toHaveBeenCalledTimes(1);

    // A different boundary edition is a real change of what the regions are, so
    // the level below it must not be reused.
    rerender(<IndiaChoropleth states={swapped} defaultDrillDownId="27" loadDistricts={loadDistricts} />);
    await waitFor(() => expect(loadDistricts).toHaveBeenCalledTimes(2));
  });

  it("repaints the state values themselves when the layer changes", () => {
    const { rerender } = render(<IndiaChoropleth states={withValues({ "27": 42, "29": 18 })} />);
    expect(screen.getByRole("button", { name: /alpha, 42/i })).toBeInTheDocument();
    rerender(<IndiaChoropleth states={withValues({ "27": 7, "29": 18 })} />);
    expect(screen.getByRole("button", { name: /alpha, 7/i })).toBeInTheDocument();
  });
});
