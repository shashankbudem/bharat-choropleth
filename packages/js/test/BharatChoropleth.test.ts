import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BharatChoropleth } from "../src/BharatChoropleth";
import type { GeometrySource } from "../src/types";

const geometry: GeometrySource = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { id: "in-goa", name: "Goa" }, geometry: { type: "Polygon", coordinates: [[[72, 15], [73, 15], [73, 16], [72, 16], [72, 15]]] } },
    { type: "Feature", properties: { id: "in-tn", name: "Tamil Nadu" }, geometry: { type: "Polygon", coordinates: [[[77, 10], [78, 10], [78, 11], [77, 11], [77, 10]]] } },
    { type: "Feature", properties: { id: "in-jk", name: "Jammu & Kashmir" }, geometry: { type: "Polygon", coordinates: [[[74, 33], [75, 33], [75, 34], [74, 34], [74, 33]]] } },
  ],
};

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
  vi.restoreAllMocks();
});

function regionText(root: ParentNode, label: RegExp): string | null {
  const match = [...root.querySelectorAll('[role="button"]')].find((node) => label.test(node.getAttribute("aria-label") ?? ""));
  return match?.getAttribute("aria-label") ?? null;
}

describe("BharatChoropleth", () => {
  it("derives id/label from feature.properties by default and starts every state at null", () => {
    const map = new BharatChoropleth(container, { geometry });
    expect(map.states["Goa"]).toBeNull();
    expect(regionText(container, /^Goa,/)).toMatch(/No data/);
    map.destroy();
  });

  it("seeds initial values from the `values` option", () => {
    const map = new BharatChoropleth(container, { geometry, values: { Goa: 6 } });
    expect(map.states["Goa"]).toBe(6);
    expect(map.states["Tamil Nadu"]).toBeNull();
    map.destroy();
  });

  it("map.states['Label'] = n updates the value and re-renders, for labels with special characters too", () => {
    const map = new BharatChoropleth(container, { geometry });
    map.states["Tamil Nadu"] = 12;
    expect(regionText(container, /^Tamil Nadu,/)).toMatch(/12/);
    map.states["Jammu & Kashmir"] = 3;
    expect(map.states["Jammu & Kashmir"]).toBe(3);
    map.destroy();
  });

  it("warns but does not throw when setting an unrecognized label via .states", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const map = new BharatChoropleth(container, { geometry });
    expect(() => { map.states["Not A State"] = 1; }).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Not A State"));
    map.destroy();
  });

  it("exposes a dot-notation shortcut (slugified label) that reads/writes the same value as .states", () => {
    const map = new BharatChoropleth(container, { geometry });
    (map as unknown as Record<string, unknown>).goa = 6;
    expect(map.states["Goa"]).toBe(6);
    map.states["Goa"] = 9;
    expect((map as unknown as Record<string, unknown>).goa).toBe(9);
    map.destroy();
  });

  it("slugifies ampersands so 'Jammu & Kashmir' is reachable as jammu_and_kashmir", () => {
    const map = new BharatChoropleth(container, { geometry });
    (map as unknown as Record<string, unknown>).jammu_and_kashmir = 4;
    expect(map.states["Jammu & Kashmir"]).toBe(4);
    map.destroy();
  });

  it("warns and ignores an unknown dot-notation property instead of throwing or creating a stray field", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const map = new BharatChoropleth(container, { geometry });
    const target = map as unknown as Record<string, unknown>;
    expect(() => { target.totallyMadeUp = 1; }).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("totallyMadeUp"));
    map.destroy();
  });

  it("fontColor / borderColor set CSS custom properties on the rendered map root, not just the outer container", () => {
    const map = new BharatChoropleth(container, { geometry });
    map.fontColor = "maroon";
    map.borderColor = "#123456";
    const mapRoot = container.querySelector(".india-choropleth") as HTMLElement;
    // .india-choropleth declares these vars on itself as defaults (not `var(..., fallback)`),
    // so a value set only on an ancestor would silently be shadowed — assert on the element
    // that actually renders, not the wrapper the caller happened to pass in.
    expect(mapRoot.style.getPropertyValue("--india-map-text")).toBe("maroon");
    expect(mapRoot.style.getPropertyValue("--india-map-stroke")).toBe("#123456");
    expect(map.fontColor).toBe("maroon");
    map.destroy();
  });

  it("colorScale setter forwards to the underlying engine and updates rendered swatches", () => {
    const map = new BharatChoropleth(container, { geometry });
    map.colorScale = ["#ffffff", "#800000"];
    const swatches = [...container.querySelectorAll(".india-choropleth__swatch")].map((n) => (n as HTMLElement).style.backgroundColor);
    expect(swatches).toEqual(["rgb(255, 255, 255)", "rgb(128, 0, 0)"]);
    map.destroy();
  });

  it("setValues batches multiple updates into a single engine re-render", () => {
    const map = new BharatChoropleth(container, { geometry });
    const updateSpy = vi.spyOn(map.engine!, "update");
    map.setValues({ Goa: 1, "Tamil Nadu": 2, "Jammu & Kashmir": 3 });
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(map.states["Goa"]).toBe(1);
    expect(map.states["Tamil Nadu"]).toBe(2);
    expect(map.states["Jammu & Kashmir"]).toBe(3);
    map.destroy();
  });

  it("supports custom getId/getLabel overrides", () => {
    const customGeometry: GeometrySource = {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: { code: "GA", title: "Goa" }, geometry: geometry.type === "FeatureCollection" ? geometry.features[0]!.geometry : (geometry as never) }],
    };
    const map = new BharatChoropleth(container, {
      geometry: customGeometry,
      getId: (f) => String(f.properties?.code),
      getLabel: (f) => String(f.properties?.title),
      values: { Goa: 5 },
    });
    expect(map.states["Goa"]).toBe(5);
    map.destroy();
  });

  it("select/drillDown/getSelected/getInspected delegate to the underlying engine", () => {
    const map = new BharatChoropleth(container, { geometry });
    map.select("in-goa");
    expect(map.getSelected()?.id).toBe("in-goa");
    map.destroy();
  });

  it("exposes the underlying IndiaChoropleth engine for advanced usage", () => {
    const map = new BharatChoropleth(container, { geometry });
    expect(typeof map.engine!.update).toBe("function");
    map.destroy();
  });

  it("resolves state names loosely: display name, slug, underscores, id, separator-free and former names", () => {
    const map = new BharatChoropleth(container, { geometry });
    const target = map as unknown as Record<string, unknown>;
    target.tamil_nadu = 1;
    expect(map.states["tamil-nadu"]).toBe(1);
    expect(map.states["TAMIL NADU"]).toBe(1);
    expect(map.states["tamilnadu"]).toBe(1);
    expect(map.states["in-cs-33-tamil-nadu"]).toBe(1);
    map.destroy();
  });

  it("accepts snake_case option names, without mistaking them for state names", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const map = new BharatChoropleth(container, { geometry });
    const target = map as unknown as Record<string, unknown>;
    target.font_color = "maroon";
    target.border_color = "#123456";
    target.color_scale = ["#ffffff", "#800000"];

    const mapRoot = container.querySelector(".india-choropleth") as HTMLElement;
    expect(mapRoot.style.getPropertyValue("--india-map-text")).toBe("maroon");
    expect(mapRoot.style.getPropertyValue("--india-map-stroke")).toBe("#123456");
    expect(map.colorScale).toEqual(["#ffffff", "#800000"]);
    expect(target.font_color).toBe("maroon");
    expect(warn).not.toHaveBeenCalled();
    map.destroy();
  });

  it("exposes border and selection thickness as options and setters", () => {
    const map = new BharatChoropleth(container, { geometry, borderWidth: 1, selectionWidth: 1.5 });
    const mapRoot = container.querySelector(".india-choropleth") as HTMLElement;
    expect(mapRoot.style.getPropertyValue("--india-map-border-width")).toBe("1");
    expect(mapRoot.style.getPropertyValue("--india-map-selection-width")).toBe("1.5");

    map.selectionWidth = 4;
    expect(mapRoot.style.getPropertyValue("--india-map-selection-width")).toBe("4");
    expect(map.selectionWidth).toBe(4);

    // Unset removes the override so the stylesheet default applies again.
    map.selectionWidth = undefined;
    expect(mapRoot.style.getPropertyValue("--india-map-selection-width")).toBe("");
    map.destroy();
  });

  it("leaves the stylesheet defaults alone when no widths are given", () => {
    const map = new BharatChoropleth(container, { geometry });
    const mapRoot = container.querySelector(".india-choropleth") as HTMLElement;
    expect(mapRoot.style.getPropertyValue("--india-map-border-width")).toBe("");
    expect(mapRoot.style.getPropertyValue("--india-map-selection-width")).toBe("");
    map.destroy();
  });

  it("accepts the single-options-object call shape", () => {
    container.id = "options-object-container";
    const map = new BharatChoropleth({ container: "#options-object-container", geometry, values: { Goa: 3 } });
    expect(map.states["Goa"]).toBe(3);
    map.destroy();
  });
});

describe("BharatChoropleth with fetched geometry", () => {
  // The script-tag path: boundary data is downloaded, so everything the caller
  // writes on the line after `new` happens before there is anything to render.
  function stubFetch(payload: unknown = geometry) {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    } as Response);
  }

  it("fetches the default state bundle when no geometry is given", async () => {
    const fetchSpy = stubFetch();
    const map = new BharatChoropleth(container);
    await map.ready;
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining("current-2019-states/states.topo.json"), expect.anything());
    expect(container.querySelector(".india-choropleth")).not.toBeNull();
    map.destroy();
  });

  it("applies values written synchronously after construction, once the data arrives", async () => {
    stubFetch();
    const map = new BharatChoropleth(container);
    const target = map as unknown as Record<string, unknown>;
    target.goa = 6;
    target.tamil_nadu = 7;
    map.states["Jammu & Kashmir"] = 2;

    expect(container.querySelector(".india-choropleth")).toBeNull(); // nothing rendered yet
    await map.ready;

    expect(regionText(container, /^Goa,/)).toMatch(/6/);
    expect(regionText(container, /^Tamil Nadu,/)).toMatch(/7/);
    expect(map.states["Goa"]).toBe(6);
    expect(map.states["Jammu & Kashmir"]).toBe(2);
    map.destroy();
  });

  it("applies fontColor/borderColor/colorScale written before the data arrives", async () => {
    stubFetch();
    const map = new BharatChoropleth(container);
    map.fontColor = "maroon";
    map.borderColor = "#123456";
    map.colorScale = ["#ffffff", "#800000"];
    await map.ready;

    // The CSS vars have to land on `.india-choropleth`, which does not exist until
    // the data arrives — a pre-load write that only hit the container would no-op.
    const mapRoot = container.querySelector(".india-choropleth") as HTMLElement;
    expect(mapRoot.style.getPropertyValue("--india-map-text")).toBe("maroon");
    expect(mapRoot.style.getPropertyValue("--india-map-stroke")).toBe("#123456");
    const swatches = [...container.querySelectorAll(".india-choropleth__swatch")].map((n) => (n as HTMLElement).style.backgroundColor);
    expect(swatches).toEqual(["rgb(255, 255, 255)", "rgb(128, 0, 0)"]);
    map.destroy();
  });

  it("does not warn about known state names written before the data arrives", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubFetch();
    const map = new BharatChoropleth(container);
    (map as unknown as Record<string, unknown>).goa = 6;
    await map.ready;
    expect(warn).not.toHaveBeenCalled();
    map.destroy();
  });

  it("defers the unknown-name warning until the real label set is known", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    stubFetch();
    const map = new BharatChoropleth(container);
    (map as unknown as Record<string, unknown>).notAState = 1;
    expect(warn).not.toHaveBeenCalled(); // can't know yet — guessing here would cry wolf on every load
    await map.ready;
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("notAState"));
    map.destroy();
  });

  it("unpacks a raw TopoJSON topology without being told the object name", async () => {
    stubFetch({
      type: "Topology",
      objects: { states: { type: "GeometryCollection", geometries: [{ type: "Polygon", properties: { id: "in-cs-30-goa", name: "Goa" }, arcs: [[0]] }] } },
      arcs: [[[0, 0], [9999, 0], [0, 9999], [-9999, 0], [0, -9999]]],
      transform: { scale: [0.0001, 0.0001], translate: [72, 15] },
    });
    const map = new BharatChoropleth(container, { values: { Goa: 4 } });
    await map.ready;
    expect(regionText(container, /^Goa,/)).toMatch(/4/);
    map.destroy();
  });

  it("shows the error in the container and rejects `ready` when the fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 404, json: async () => ({}) } as Response);
    const onError = vi.fn();
    const map = new BharatChoropleth(container, { onError });
    await expect(map.ready).rejects.toThrow(/404/);
    expect(container.querySelector(".bharat-choropleth__status--error")?.textContent).toMatch(/404/);
    expect(onError).toHaveBeenCalled();
    map.destroy();
  });

  it("does not raise an unhandled rejection when a caller never touches `ready`", async () => {
    const unhandled = vi.fn();
    const proc = (globalThis as unknown as { process: { on: (e: string, h: () => void) => void; off: (e: string, h: () => void) => void } }).process;
    proc.on("unhandledRejection", unhandled);
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false, status: 404, json: async () => ({}) } as Response);

    // The documented usage — no await, no .catch(). A load failure must surface in
    // the container only, not as an unhandled rejection in the host page.
    const map = new BharatChoropleth(container, { onError: () => {} });
    await new Promise((resolve) => setTimeout(resolve, 10));

    proc.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(container.querySelector(".bharat-choropleth__status--error")).not.toBeNull();
    map.destroy();
  });

  it("calls onReady with the map once it has rendered", async () => {
    stubFetch();
    const onReady = vi.fn();
    const map = new BharatChoropleth(container, { onReady });
    await map.ready;
    expect(onReady).toHaveBeenCalledWith(map);
    map.destroy();
  });

  it("destroy() before the data arrives cancels the load and renders nothing", async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = () => resolve({ ok: true, status: 200, json: async () => geometry } as Response);
      }) as Promise<Response>,
    );
    const map = new BharatChoropleth(container);
    map.destroy();
    resolveFetch(null);
    await map.ready;
    expect(container.querySelector(".india-choropleth")).toBeNull();
    expect(container.querySelector(".bharat-choropleth__status")).toBeNull();
  });
});
