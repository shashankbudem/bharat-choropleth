import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { IndiaChoropleth } from "../src";
import type { MapLayer } from "../src";
import { asFeatureCollection } from "../src/geometry";

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
    render(<IndiaChoropleth states={stateLayer} onInspect={onInspect} onSelectedChange={onSelectedChange} />);
    const alpha = screen.getByRole("button", { name: /alpha, 42/i });
    fireEvent.focus(alpha);
    expect(onInspect).toHaveBeenLastCalledWith(expect.objectContaining({ id: "27" }), "state");
    expect(screen.getByRole("status")).toHaveTextContent("Alpha");
    fireEvent.keyDown(alpha, { key: "Enter" });
    expect(onSelectedChange).toHaveBeenCalledWith(expect.objectContaining({ id: "27" }), "state");
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
    expect(screen.getByRole("status")).toHaveTextContent("Alpha");
    fireEvent.keyDown(alpha, { key: "Escape" });
    expect(container.querySelector(".india-choropleth__tooltip")).not.toBeInTheDocument();
    fireEvent.click(alpha);
    expect(await screen.findByText("No district data is available for this state.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All states" })).toBeInTheDocument();
    expect(container.querySelector(".india-choropleth__tooltip")).not.toBeInTheDocument();
  });

  it("keeps zero, negative, and missing values distinct", () => {
    render(<IndiaChoropleth states={valueEdgeLayer} />);
    expect(screen.getByRole("button", { name: /zero, 0/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /negative, -5/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /missing, no data/i })).toBeInTheDocument();
    fireEvent.focus(screen.getByRole("button", { name: /zero, 0/i }));
    expect(screen.getByRole("status")).toHaveTextContent("0");
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
    const { rerender } = render(<IndiaChoropleth states={stateLayer} drillDownId="27" loadDistricts={loadDistricts} />);
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
});
