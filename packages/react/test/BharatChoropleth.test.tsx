import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("matches values keyed by a feature id the state registry does not know", async () => {
    // A host's own geometry can use ids like these custom-* ones. They are not
    // in the registry, so before this the feature fell back to being keyed on
    // its label while the caller's values were keyed on the id — and a fully
    // populated dataset rendered as "No data" on every region.
    const customGeometry: GeometrySource = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { id: "custom-30-goa", name: "Goa" }, geometry: { type: "Polygon", coordinates: [[[72, 15], [73, 15], [73, 16], [72, 16], [72, 15]]] } },
        { type: "Feature", properties: { id: "custom-33-tamil-nadu", name: "Tamil Nadu" }, geometry: { type: "Polygon", coordinates: [[[77, 10], [78, 10], [78, 11], [77, 11], [77, 10]]] } },
      ],
    };
    render(<BharatChoropleth geometry={customGeometry} values={{ "custom-30-goa": 6, "custom-33-tamil-nadu": 18 }} />);
    await waitFor(() => expect(regionLabel(/^Goa,/)).toMatch(/6/));
    expect(regionLabel(/^Tamil Nadu,/)).toMatch(/18/);
  });

  it("still prefers an exact key over a registry match, so ids and names can mix", async () => {
    const customGeometry: GeometrySource = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { id: "custom-30-goa", name: "Goa" }, geometry: { type: "Polygon", coordinates: [[[72, 15], [73, 15], [73, 16], [72, 16], [72, 15]]] } },
      ],
    };
    // Both keys address the same region; the literal id must win.
    render(<BharatChoropleth geometry={customGeometry} values={{ "custom-30-goa": 6, Goa: 99 }} />);
    await waitFor(() => expect(regionLabel(/^Goa,/)).toMatch(/6/));
  });

  it("resolves former names through the alias table", () => {
    render(<BharatChoropleth geometry={geometry} values={{ Orissa: 8 }} />);
    expect(regionLabel(/^Odisha,/)).toMatch(/8/);
  });

  it("normalizes & to and, so 'Jammu & Kashmir' and 'jammu-and-kashmir' are one state", () => {
    render(<BharatChoropleth geometry={geometry} values={{ "jammu-and-kashmir": 2 }} />);
    expect(regionLabel(/^Jammu & Kashmir,/)).toMatch(/2/);
  });

  // Two rows for one region used to resolve to the last in silence, which is how
  // a mis-shaped query becomes a believed wrong number: a state showing one of
  // its districts' totals looks exactly like a state showing its own.
  it("says so when two rows name the same region", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rerender } = render(
      <BharatChoropleth
        geometry={geometry}
        data={[{ region: "Goa", value: 99 }, { region: "Goa", value: 6 }]}
      />
    );
    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining("appears in 2 rows")));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Goa"));
    // The last row still wins — the warning is the change, not the number.
    expect(regionLabel(/^Goa,/)).toMatch(/6/);
    // And it stays a single warning as values move around it.
    rerender(
      <BharatChoropleth
        geometry={geometry}
        data={[{ region: "Goa", value: 98 }, { region: "Goa", value: 7 }]}
      />
    );
    expect(warn.mock.calls.filter(([m]) => String(m).includes("appears in 2 rows"))).toHaveLength(1);
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

describe("BharatChoropleth districtValues", () => {
  const goaDistricts: MapLayer = {
    geometry: { type: "FeatureCollection", features: [
      { type: "Feature", properties: { id: "in-cd-30-585", name: "North Goa" }, geometry: { type: "Polygon", coordinates: [[[72, 15], [72.5, 15], [72.5, 16], [72, 16], [72, 15]]] } },
      { type: "Feature", properties: { id: "in-cd-30-586", name: "South Goa" }, geometry: { type: "Polygon", coordinates: [[[72.5, 15], [73, 15], [73, 16], [72.5, 16], [72.5, 15]]] } },
    ] },
    getId: (feature) => String(feature.properties?.id),
    getLabel: (feature) => String(feature.properties?.name),
    getValue: () => null,
  };

  function drilled(props: Partial<React.ComponentProps<typeof BharatChoropleth>> = {}) {
    return render(
      <BharatChoropleth
        geometry={geometry}
        values={{ Goa: 6 }}
        loadDistricts={async () => goaDistricts}
        defaultDrillDownId="in-cs-30-goa"
        {...props}
      />,
    );
  }

  it("applies values nested under the state they belong to", async () => {
    drilled({ districtValues: { Goa: { "North Goa": 90, "South Goa": 76 } } });
    await waitFor(() => expect(regionLabel(/^North Goa,/)).toMatch(/90/));
    expect(regionLabel(/^South Goa,/)).toMatch(/76/);
  });

  it("resolves the outer key through the state registry, like values", async () => {
    // "goa" rather than "Goa" — the same spellings `values` accepts.
    drilled({ districtValues: { goa: { "north-goa": 90 } } });
    await waitFor(() => expect(regionLabel(/^North Goa,/)).toMatch(/90/));
  });

  it("matches inner keys case-insensitively, and by slug or id", async () => {
    drilled({ districtValues: { Goa: { "NORTH GOA": 90, "in-cd-30-586": 76 } } });
    await waitFor(() => expect(regionLabel(/^North Goa,/)).toMatch(/90/));
    expect(regionLabel(/^South Goa,/)).toMatch(/76/);
  });

  it("does not leak one state's district values into another state of the same name", async () => {
    // The collision the nesting exists for: a district named here under a
    // different state must not pick this value up.
    drilled({ districtValues: { Maharashtra: { "North Goa": 90 } } });
    await waitFor(() => expect(regionLabel(/^North Goa,/)).toMatch(/No data/));
  });

  it("leaves districts it does not name at whatever the layer returned", async () => {
    const layerWithValues: MapLayer = { ...goaDistricts, getValue: (feature) => (feature.properties?.id === "in-cd-30-586" ? 12 : null) };
    drilled({ loadDistricts: async () => layerWithValues, districtValues: { Goa: { "North Goa": 90 } } });
    await waitFor(() => expect(regionLabel(/^North Goa,/)).toMatch(/90/));
    expect(regionLabel(/^South Goa,/)).toMatch(/12/);
  });

  it("reads an explicit null as no data rather than falling through to the layer", async () => {
    const layerWithValues: MapLayer = { ...goaDistricts, getValue: () => 12 };
    drilled({ loadDistricts: async () => layerWithValues, districtValues: { Goa: { "North Goa": null } } });
    await waitFor(() => expect(regionLabel(/^South Goa,/)).toMatch(/12/));
    expect(regionLabel(/^North Goa,/)).toMatch(/No data/);
  });

  it("repaints when districtValues change, without refetching the districts", async () => {
    const loadDistricts = vi.fn(async () => goaDistricts);
    const { rerender } = render(
      <BharatChoropleth geometry={geometry} values={{ Goa: 6 }} loadDistricts={loadDistricts} defaultDrillDownId="in-cs-30-goa" districtValues={{ Goa: { "North Goa": 90 } }} />,
    );
    await waitFor(() => expect(regionLabel(/^North Goa,/)).toMatch(/90/));
    rerender(
      <BharatChoropleth geometry={geometry} values={{ Goa: 6 }} loadDistricts={loadDistricts} defaultDrillDownId="in-cs-30-goa" districtValues={{ Goa: { "North Goa": 55 } }} />,
    );
    await waitFor(() => expect(regionLabel(/^North Goa,/)).toMatch(/55/));
    // The districts stay on screen throughout; only their numbers change.
    expect(screen.queryByText(/Loading districts/)).toBeNull();
  });

  it("warns once for a district name that is not in the state, without crashing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    drilled({ districtValues: { Goa: { "North Goa": 90, Nowhere: 5 } } });
    await waitFor(() => expect(regionLabel(/^North Goa,/)).toMatch(/90/));
    await waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringContaining("nowhere")));
    expect(warn.mock.calls.filter(([m]) => String(m).includes("nowhere"))).toHaveLength(1);
  });

  it("does not mutate the caller's districtValues object", async () => {
    const districtValues = { Goa: { "North Goa": 90 } };
    const before = JSON.stringify(districtValues);
    drilled({ districtValues });
    await waitFor(() => expect(regionLabel(/^North Goa,/)).toMatch(/90/));
    expect(JSON.stringify(districtValues)).toBe(before);
  });
});

/**
 * Boundaries served by URL, the way the default data source asks for them. The
 * mock rejects once its signal is aborted, as a real fetch does — a mock that
 * ignored the signal would pass against code that aborts every request.
 */
function serveBundles(bundles: { states: unknown; districts?: Record<string, unknown>; subDistricts?: Record<string, unknown> }) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.signal?.aborted) throw Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
    const [, level, id] = /\/(districts|subdistricts)\/([^/]+)\.topo\.json$/.exec(url) ?? [];
    const body = level === "districts" ? bundles.districts?.[id!] : level === "subdistricts" ? bundles.subDistricts?.[id!] : bundles.states;
    return body === undefined ? new Response("", { status: 404 }) : new Response(JSON.stringify(body), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const box = (west: number, south: number) => ({
  type: "Polygon" as const,
  coordinates: [[[west, south], [west + 0.1, south], [west + 0.1, south + 0.1], [west, south + 0.1], [west, south]]],
});
const collection = (...features: [id: string, name: string, west: number][]) => ({
  type: "FeatureCollection",
  features: features.map(([id, name, west]) => ({ type: "Feature", properties: { id, name }, geometry: box(west, 28) })),
});

describe("BharatChoropleth values below the state level", () => {
  const states = collection(
    ["in-cs-07-delhi", "Delhi", 77],
    ["in-cs-34-puducherry", "Puducherry", 79],
    ["in-cs-31-lakshadweep", "Lakshadweep", 72],
  );
  const bundles = {
    states,
    districts: {
      "in-cs-07-delhi": collection(["in-cd-07-1", "New Delhi", 77], ["in-cd-07-2", "North Delhi", 77.2]),
      "in-cs-34-puducherry": collection(["in-cd-34-1", "Puducherry", 79], ["in-cd-34-2", "Karaikal", 79.2]),
      "in-cs-31-lakshadweep": collection(["in-cd-31-1", "Lakshadweep", 72]),
    },
    subDistricts: {
      "in-cd-07-1": collection(["s3", "Chanakyapuri", 77], ["s4", "New Delhi", 77.2]),
      "in-cd-07-2": collection(["s1", "Model Town", 77], ["s2", "North Delhi", 77.2]),
    },
  };

  afterEach(() => vi.unstubAllGlobals());

  it("does not paint a state's value onto a sub-district that shares an alias of its name", async () => {
    serveBundles(bundles);
    render(<BharatChoropleth values={{ Delhi: 5 }} defaultDrillDownId="in-cs-07-delhi" defaultSubDistrictDrillDownId="in-cd-07-1" />);
    await waitFor(() => expect(regionLabel(/^Chanakyapuri,/)).toMatch(/No data/));
    expect(regionLabel(/^New Delhi,/)).toMatch(/No data/);
  });

  it("does not paint a state's value onto a district that shares an alias of its name", async () => {
    serveBundles(bundles);
    render(<BharatChoropleth values={{ Delhi: 5 }} defaultDrillDownId="in-cs-07-delhi" />);
    await waitFor(() => expect(regionLabel(/^New Delhi,/)).toMatch(/No data/));
    expect(regionLabel(/^North Delhi,/)).toMatch(/No data/);
  });

  it("does not paint a state's value onto a district with exactly the state's name", async () => {
    serveBundles(bundles);
    render(<BharatChoropleth values={{ Puducherry: 7 }} defaultDrillDownId="in-cs-34-puducherry" />);
    await waitFor(() => expect(regionLabel(/^Karaikal,/)).toMatch(/No data/));
    expect(regionLabel(/^Puducherry,/)).toMatch(/No data/);
  });

  it("still gives the sole district of a single-district state its state's value", async () => {
    serveBundles(bundles);
    render(<BharatChoropleth values={{ Lakshadweep: 43 }} defaultDrillDownId="in-cs-31-lakshadweep" />);
    await waitFor(() => expect(regionLabel(/^Lakshadweep,/)).toMatch(/43/));
  });

  it("does not paint a district's value onto a sub-district of the same name", async () => {
    serveBundles(bundles);
    render(
      <BharatChoropleth
        values={{ Delhi: 5 }}
        districtValues={{ Delhi: { "North Delhi": 9 } }}
        defaultDrillDownId="in-cs-07-delhi"
        defaultSubDistrictDrillDownId="in-cd-07-2"
      />,
    );
    await waitFor(() => expect(regionLabel(/^Model Town,/)).toMatch(/No data/));
    expect(regionLabel(/^North Delhi,/)).toMatch(/No data/);
  });
});

describe("BharatChoropleth under StrictMode", () => {
  const bundles = {
    states: collection(["in-cs-30-goa", "Goa", 73]),
    districts: { "in-cs-30-goa": collection(["in-cd-30-585", "North Goa", 73]) },
  };

  afterEach(() => vi.unstubAllGlobals());

  // StrictMode unmounts and remounts once on mount. The drill-down fetches share
  // one AbortController that the unmount aborts, so every later fetch failed.
  it("drills down on a click", async () => {
    serveBundles(bundles);
    render(<StrictMode><BharatChoropleth values={{ Goa: 1 }} /></StrictMode>);
    await waitFor(() => expect(regionLabel(/^Goa,/)).toMatch(/1/));
    fireEvent.click(screen.getAllByRole("button").find((node) => /^Goa,/.test(node.getAttribute("aria-label") ?? ""))!);
    await waitFor(() => expect(regionLabel(/^North Goa,/)).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("drills down from a default drill-down id", async () => {
    serveBundles(bundles);
    render(<StrictMode><BharatChoropleth values={{ Goa: 1 }} defaultDrillDownId="in-cs-30-goa" /></StrictMode>);
    await waitFor(() => expect(regionLabel(/^North Goa,/)).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("BharatChoropleth when dataBaseUrl changes", () => {
  afterEach(() => vi.unstubAllGlobals());

  // The drill-down cache was keyed by region id alone, so pointing the map at
  // another copy of the data kept serving boundaries from the first one.
  it("fetches districts and sub-districts from the new base URL", async () => {
    const fetchMock = serveBundles({
      states: collection(["in-cs-30-goa", "Goa", 73]),
      districts: { "in-cs-30-goa": collection(["in-cd-30-585", "North Goa", 73]) },
      subDistricts: { "in-cd-30-585": collection(["s1", "Bardez", 73]) },
    });
    const props = { values: { Goa: 1 }, defaultDrillDownId: "in-cs-30-goa", defaultSubDistrictDrillDownId: "in-cd-30-585" };
    const { rerender } = render(<BharatChoropleth {...props} dataBaseUrl="https://first.example/maps" />);
    await waitFor(() => expect(regionLabel(/^Bardez,/)).toBeTruthy());

    rerender(<BharatChoropleth {...props} dataBaseUrl="https://second.example/maps" />);
    const fetched = () => fetchMock.mock.calls.map(([url]) => String(url));
    await waitFor(() => expect(fetched()).toContain("https://second.example/maps/current-2019-districts/districts/in-cs-30-goa.topo.json"));
    await waitFor(() => expect(fetched()).toContain("https://second.example/maps/current-2019-subdistricts/subdistricts/in-cd-30-585.topo.json"));
  });
});
