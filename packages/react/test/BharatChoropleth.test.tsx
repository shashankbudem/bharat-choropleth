import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BharatChoropleth, IndiaChoropleth } from "../src";
import type { GeometrySource, MapLayer } from "../src";

/**
 * Inline geometry, so these tests never touch the network: `isInlineGeometry`
 * makes the facade render synchronously with no placeholder. Ids and labels are
 * the real ones, because the point of most of these tests is that the state
 * registry resolves a caller's spelling onto them.
 */
const geometry: GeometrySource = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: { id: "in-cs-30-goa", name: "Goa" }, geometry: { type: "Polygon", coordinates: [[[72, 15], [73, 15], [73, 16], [72, 16], [72, 15]]] } },
    { type: "Feature", properties: { id: "in-cs-33-tamil-nadu", name: "Tamil Nadu" }, geometry: { type: "Polygon", coordinates: [[[77, 10], [78, 10], [78, 11], [77, 11], [77, 10]]] } },
    { type: "Feature", properties: { id: "in-cs-01-jammu-and-kashmir", name: "Jammu & Kashmir" }, geometry: { type: "Polygon", coordinates: [[[74, 33], [75, 33], [75, 34], [74, 34], [74, 33]]] } },
    { type: "Feature", properties: { id: "in-cs-21-odisha", name: "Odisha" }, geometry: { type: "Polygon", coordinates: [[[84, 20], [85, 20], [85, 21], [84, 21], [84, 20]]] } },
  ],
};

/** The rendered region's accessible name, which carries its label and formatted value. */
function regionLabel(name: RegExp): string {
  const match = screen.getAllByRole("button").find((node) => name.test(node.getAttribute("aria-label") ?? ""));
  if (!match) throw new Error(`no region matching ${name}`);
  return match.getAttribute("aria-label") ?? "";
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BharatChoropleth", () => {
  it("renders values keyed by display name", () => {
    render(<BharatChoropleth geometry={geometry} values={{ Goa: 6, "Tamil Nadu": 18 }} />);
    expect(regionLabel(/^Goa,/)).toMatch(/6/);
    expect(regionLabel(/^Tamil Nadu,/)).toMatch(/18/);
  });

  it("treats an omitted state as no data, the same as an explicit null", () => {
    render(<BharatChoropleth geometry={geometry} values={{ Goa: 6, "Tamil Nadu": null }} />);
    expect(regionLabel(/^Tamil Nadu,/)).toMatch(/No data/);
    expect(regionLabel(/^Jammu & Kashmir,/)).toMatch(/No data/);
  });

  it("keeps zero as a value rather than folding it into no data", () => {
    render(<BharatChoropleth geometry={geometry} values={{ Goa: 0, "Tamil Nadu": 18 }} />);
    expect(regionLabel(/^Goa,/)).not.toMatch(/No data/);
    expect(regionLabel(/^Goa,/)).toMatch(/0/);
  });

  it("resolves case-insensitively, and through slugs, ids and separator-free spellings", () => {
    render(
      <BharatChoropleth
        geometry={geometry}
        values={{ GOA: 6, tamilnadu: 18, "in-cs-01-jammu-and-kashmir": 2, odisha: 8 }}
      />,
    );
    expect(regionLabel(/^Goa,/)).toMatch(/6/);
    expect(regionLabel(/^Tamil Nadu,/)).toMatch(/18/);
    expect(regionLabel(/^Jammu & Kashmir,/)).toMatch(/2/);
    expect(regionLabel(/^Odisha,/)).toMatch(/8/);
  });

  it("resolves former names through the alias table", () => {
    render(<BharatChoropleth geometry={geometry} values={{ Orissa: 8 }} />);
    expect(regionLabel(/^Odisha,/)).toMatch(/8/);
  });

  it("normalizes & to and, so 'Jammu & Kashmir' and 'jammu-and-kashmir' are one state", () => {
    render(<BharatChoropleth geometry={geometry} values={{ "jammu-and-kashmir": 2 }} />);
    expect(regionLabel(/^Jammu & Kashmir,/)).toMatch(/2/);
  });

  it("ignores an unrecognized name with a single warning quoting what the caller typed, without crashing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let rerender: (ui: React.ReactElement) => void = () => {};
    expect(() => {
      ({ rerender } = render(<BharatChoropleth geometry={geometry} values={{ Goa: 6, Xanadu: 99 }} />));
    }).not.toThrow();
    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining("Xanadu")));
    // Still once after the values change around it — a warning per render would
    // flood the console for anything driven by a slider or a poll.
    rerender(<BharatChoropleth geometry={geometry} values={{ Goa: 7, Xanadu: 99 }} />);
    rerender(<BharatChoropleth geometry={geometry} values={{ Goa: 8, Xanadu: 12 }} />);
    expect(warn.mock.calls.filter(([message]) => String(message).includes("Xanadu"))).toHaveLength(1);
    // The recognized state still renders.
    expect(regionLabel(/^Goa,/)).toMatch(/8/);
  });

  it("does not warn for an unrecognized name carrying no value", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<BharatChoropleth geometry={geometry} values={{ Xanadu: null }} />);
    await waitFor(() => expect(screen.getAllByRole("button").length).toBeGreaterThan(0));
    expect(warn).not.toHaveBeenCalled();
  });

  it("repaints when the values prop changes", () => {
    const { rerender } = render(<BharatChoropleth geometry={geometry} values={{ Goa: 6 }} />);
    expect(regionLabel(/^Goa,/)).toMatch(/6/);
    rerender(<BharatChoropleth geometry={geometry} values={{ Goa: 41 }} />);
    expect(regionLabel(/^Goa,/)).toMatch(/41/);
  });

  it("drops a state's value when it leaves the values prop", () => {
    const { rerender } = render(<BharatChoropleth geometry={geometry} values={{ Goa: 6, "Tamil Nadu": 18 }} />);
    expect(regionLabel(/^Goa,/)).toMatch(/6/);
    rerender(<BharatChoropleth geometry={geometry} values={{ "Tamil Nadu": 18 }} />);
    expect(regionLabel(/^Goa,/)).toMatch(/No data/);
  });

  it("does not mutate the caller's values object", () => {
    const values = { Goa: 6, Orissa: 8 };
    const before = JSON.stringify(values);
    const { rerender } = render(<BharatChoropleth geometry={geometry} values={values} />);
    rerender(<BharatChoropleth geometry={geometry} values={values} />);
    expect(JSON.stringify(values)).toBe(before);
    expect(Object.keys(values)).toEqual(["Goa", "Orissa"]);
  });

  it("reads a data array through regionKey / valueKey", () => {
    render(
      <BharatChoropleth
        geometry={geometry}
        data={[{ state: "Tamil Nadu", score: 18 }, { state: "Orissa", score: 8 }]}
        regionKey="state"
        valueKey="score"
      />,
    );
    expect(regionLabel(/^Tamil Nadu,/)).toMatch(/18/);
    expect(regionLabel(/^Odisha,/)).toMatch(/8/);
  });

  it("defaults data keys to region / value", () => {
    render(<BharatChoropleth geometry={geometry} data={[{ region: "Goa", value: 6 }]} />);
    expect(regionLabel(/^Goa,/)).toMatch(/6/);
  });

  it("reads a non-finite data value as no data rather than passing NaN to the color scale", () => {
    render(<BharatChoropleth geometry={geometry} data={[{ region: "Goa", value: Number.NaN }, { region: "Odisha", value: 8 }]} />);
    expect(regionLabel(/^Goa,/)).toMatch(/No data/);
  });

  it("lets values win when both values and data are given, without merging them", () => {
    render(
      <BharatChoropleth
        geometry={geometry}
        values={{ Goa: 6 }}
        data={[{ region: "Goa", value: 99 }, { region: "Odisha", value: 8 }]}
      />,
    );
    expect(regionLabel(/^Goa,/)).toMatch(/6/);
    expect(regionLabel(/^Odisha,/)).toMatch(/No data/);
  });

  it("passes IndiaChoropleth props straight through", () => {
    render(
      <BharatChoropleth
        geometry={geometry}
        values={{ Goa: 6 }}
        ariaLabel="Custom map label"
        showLegend={false}
        formatValue={(value) => `${value} pts`}
      />,
    );
    expect(screen.getByLabelText("Custom map label")).toBeTruthy();
    expect(regionLabel(/^Goa,/)).toMatch(/6 pts/);
  });

  it("keeps the advanced escape hatches: a custom getId / getLabel over custom geometry", () => {
    const custom: GeometrySource = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { code: "AA", title: "Alphaland" }, geometry: { type: "Polygon", coordinates: [[[72, 15], [73, 15], [73, 16], [72, 16], [72, 15]]] } },
        { type: "Feature", properties: { code: "BB", title: "Betaland" }, geometry: { type: "Polygon", coordinates: [[[77, 10], [78, 10], [78, 11], [77, 11], [77, 10]]] } },
      ],
    };
    render(
      <BharatChoropleth
        geometry={custom}
        getId={(feature) => String(feature.properties?.code)}
        getLabel={(feature) => String(feature.properties?.title)}
        values={{ Alphaland: 3, betaland: 9 }}
      />,
    );
    expect(regionLabel(/^Alphaland,/)).toMatch(/3/);
    // Names outside the state registry still match case-insensitively.
    expect(regionLabel(/^Betaland,/)).toMatch(/9/);
  });

  it("leaves drill-down off for caller-supplied geometry, and takes an explicit loadDistricts", async () => {
    const districtLayer: MapLayer = {
      geometry: {
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: { id: "in-cd-30-585", name: "North Goa" }, geometry: { type: "Polygon", coordinates: [[[72, 15], [72.5, 15], [72.5, 16], [72, 16], [72, 15]]] } },
        ],
      },
      getId: (feature) => String(feature.properties?.id),
      getLabel: (feature) => String(feature.properties?.name),
      getValue: () => 42,
    };
    const loadDistricts = vi.fn(async () => districtLayer);
    render(
      <BharatChoropleth
        geometry={geometry}
        values={{ Goa: 6 }}
        loadDistricts={loadDistricts}
        defaultDrillDownId="in-cs-30-goa"
      />,
    );
    await waitFor(() => expect(regionLabel(/^North Goa,/)).toMatch(/42/));
    expect(loadDistricts).toHaveBeenCalledWith("in-cs-30-goa", expect.objectContaining({ id: "in-cs-30-goa" }));
  });

  it("does not refetch district geometry when only the values change", async () => {
    const topology = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { id: "in-cd-30-585", name: "North Goa" }, geometry: { type: "Polygon", coordinates: [[[72, 15], [72.5, 15], [72.5, 16], [72, 16], [72, 15]]] } },
      ],
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(topology), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <BharatChoropleth geometry={geometry} districts values={{ Goa: 6 }} defaultDrillDownId="in-cs-30-goa" />,
    );
    await waitFor(() => expect(regionLabel(/^North Goa,/)).toBeTruthy());
    const afterFirstDrill = fetchMock.mock.calls.length;
    expect(afterFirstDrill).toBe(1);

    rerender(<BharatChoropleth geometry={geometry} districts values={{ Goa: 41 }} defaultDrillDownId="in-cs-30-goa" />);
    await waitFor(() => expect(regionLabel(/^North Goa,/)).toBeTruthy());
    expect(fetchMock.mock.calls).toHaveLength(afterFirstDrill);
    vi.unstubAllGlobals();
  });

  it("warns once under StrictMode, whose effects run twice on mount", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <StrictMode>
        <BharatChoropleth geometry={geometry} values={{ Goa: 6, Xanadu: 99 }} />
      </StrictMode>,
    );
    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining("Xanadu")));
    expect(warn.mock.calls.filter(([message]) => String(message).includes("Xanadu"))).toHaveLength(1);
  });

  it("fetches nothing when the caller supplies geometry", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<BharatChoropleth geometry={geometry} values={{ Goa: 6 }} />);
    await waitFor(() => expect(regionLabel(/^Goa,/)).toMatch(/6/));
    // Own geometry means district files are not known to sit beside it, so the
    // facade must neither fetch the state bundle nor wire a default drill-down.
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("does drill down by default when the bundled data source is in use", async () => {
    const districtTopology = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { id: "in-cd-30-585", name: "North Goa" }, geometry: { type: "Polygon", coordinates: [[[72, 15], [72.5, 15], [72.5, 16], [72, 16], [72, 15]]] } },
      ],
    };
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("/districts/")
        ? new Response(JSON.stringify(districtTopology), { status: 200 })
        : new Response(JSON.stringify(geometry), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<BharatChoropleth values={{ Goa: 6 }} defaultDrillDownId="in-cs-30-goa" />);
    await waitFor(() => expect(regionLabel(/^North Goa,/)).toBeTruthy());
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("current-2019-states"))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/districts/in-cs-30-goa"))).toBe(true);
    vi.unstubAllGlobals();
  });

  it("shows a status placeholder while boundary data is loading, then the map", async () => {
    let release: (value: GeometrySource) => void = () => {};
    const pending = new Promise<GeometrySource>((resolve) => {
      release = resolve;
    });
    render(<BharatChoropleth geometry={pending} values={{ Goa: 6 }} />);
    expect(screen.getByRole("status").textContent).toMatch(/Loading/);
    release(geometry);
    await waitFor(() => expect(regionLabel(/^Goa,/)).toMatch(/6/));
  });

  it("renders the failure in place of the map and calls onError instead of logging", async () => {
    const onError = vi.fn();
    const error = new Error("boundary data unavailable");
    render(<BharatChoropleth geometry={Promise.reject(error)} values={{ Goa: 6 }} onError={onError} />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("boundary data unavailable"));
    expect(onError).toHaveBeenCalledWith(error);
  });

  it("logs a load failure when no onError is given", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<BharatChoropleth geometry={Promise.reject(new Error("nope"))} values={{ Goa: 6 }} />);
    await waitFor(() => expect(logged).toHaveBeenCalled());
  });
});

describe("IndiaChoropleth is unchanged by the facade", () => {
  const layer: MapLayer = {
    geometry: {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { code: "big", name: "Bigland", value: 10 }, geometry: { type: "Polygon", coordinates: [[[72, 18], [72, 19], [73, 19], [73, 18], [72, 18]]] } },
        { type: "Feature", properties: { code: "small", name: "Smallland", value: 4 }, geometry: { type: "Polygon", coordinates: [[[74, 18], [74, 19], [75, 19], [75, 18], [74, 18]]] } },
      ],
    },
    getId: (feature) => String(feature.properties?.code),
    getLabel: (feature) => String(feature.properties?.name),
    getValue: (feature) => feature.properties?.value as number | null,
  };

  it("still renders a hand-built MapLayer with no registry involvement", () => {
    render(<IndiaChoropleth states={layer} />);
    expect(regionLabel(/^Bigland,/)).toMatch(/10/);
    expect(regionLabel(/^Smallland,/)).toMatch(/4/);
  });

  it("does not resolve names through the state registry, so labels stay exactly as given", () => {
    // "Orissa" is an alias the facade would fold into Odisha; the core renderer
    // must keep taking labels literally.
    const aliasLayer: MapLayer = {
      ...layer,
      geometry: {
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: { code: "x", name: "Orissa", value: 3 }, geometry: { type: "Polygon", coordinates: [[[84, 20], [85, 20], [85, 21], [84, 21], [84, 20]]] } },
        ],
      },
    };
    render(<IndiaChoropleth states={aliasLayer} />);
    expect(regionLabel(/^Orissa,/)).toMatch(/3/);
  });
});
