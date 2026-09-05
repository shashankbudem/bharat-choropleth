import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BharatChoropleth, type MapRegion } from "bharat-choropleth";
import type { Topology } from "topojson-specification";
import "bharat-choropleth/style.css";
import "./styles.css";

/** The one configuration all three demos share, so they render identically. */
interface ParityConfig {
  mapWidth: number;
  fontColor: string;
  borderColor: string;
  borderWidth: number;
  selectionWidth: number;
  legendLabels: [string, string];
  ariaLabel: string;
  colorScale: string[];
  values: Record<string, number>;
}

const DATA_BASE = "/data/generated";
const CONFIG_URL = "/examples/parity-config.json";

/**
 * A stable pseudo-random number per id, so the drill-down is a real choropleth
 * and looks the same on every load without shipping a second data file.
 * Identical to the plain-JS parity demo's `sampleValue` — that is what makes
 * the two demos' district colours match.
 */
function sampleValue(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index++) hash = (hash * 31 + id.charCodeAt(index)) % 997;
  return 1 + (hash % 40);
}

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return response.json() as Promise<T>;
}

function App() {
  const [config, setConfig] = useState<ParityConfig | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [status, setStatus] = useState("Loading…");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    loadJson<ParityConfig>(CONFIG_URL)
      .then((loadedConfig) => {
        setConfig(loadedConfig);
        setStatus("Ready — 36 states and union territories");
      })
      .catch(setError);
  }, []);

  if (error) return <p className="status">Could not load: {error.message}</p>;
  if (!config) return <p className="status">Loading…</p>;

  return (
    <>
      <header>
        <h1>
          React — <code>bharat-choropleth</code>
        </h1>
        <p>
          Every option the library exposes is switched on. Hover or tab for the tooltip, click a state to
          drill into its districts, click open sea to clear the selection — except inside an island
          group, where the water between the islands belongs to the group.
        </p>
      </header>

      {/* Fixed width so all three demos render the map at exactly the same size. */}
      <div className="map" style={{ width: config.mapWidth }}>
        <BharatChoropleth
          values={config.values}
          dataBaseUrl={DATA_BASE}
          // Shared appearance — identical in all three demos.
          colorScale={config.colorScale}
          // Colours and widths are CSS variables in the web packages, so they are
          // set on the wrapper rather than passed as props.
          // Everything else this renderer supports:
          showRegionValues
          // Keep state geometry true to scale; grow tiny drilled island parts
          // about their own centres so Lakshadweep remains visible and clickable.
          minDistrictPartExtent={14}
          showLegend
          showBreadcrumb
          legendLabels={config.legendLabels}
          ariaLabel={config.ariaLabel}
          interactive
          selectedId={selectedId}
          formatValue={(value) => new Intl.NumberFormat("en-IN").format(value)}
          loadDistricts={async (stateId) => {
            const topology = await loadJson<Topology>(
              `${DATA_BASE}/current-2019-districts/districts/${stateId}.topo.json`,
            );
            return {
              geometry: { topology, object: "districts" },
              getId: (feature) => String(feature.properties?.id),
              getLabel: (feature) => String(feature.properties?.name),
              // Districts need their own values or every one renders as "no data" —
              // a near-white fill with white borders, which is invisible on this page.
              getValue: (feature) => sampleValue(String(feature.properties?.id)),
            };
          }}
          // Same reasoning as loadDistricts above, one level down, and matching
          // what the plain-JS and Flutter demos do at this level.
          loadSubDistricts={async (districtId) => {
            const response = await fetch(`${DATA_BASE}/current-2019-subdistricts/subdistricts/${districtId}.topo.json`);
            // Three of the 788 districts genuinely have no sub-district level.
            // Null leaves them as leaves rather than opening an empty map.
            if (response.status === 404) return null;
            if (!response.ok) throw new Error(`sub-districts responded ${response.status}`);
            const topology = (await response.json()) as Topology;
            return {
              geometry: { topology, object: "subdistricts" },
              getId: (feature) => String(feature.properties?.id),
              getLabel: (feature) => String(feature.properties?.name),
              getValue: (feature) => sampleValue(String(feature.properties?.id)),
            };
          }}
          renderInsights={(context) => (
            <span>{context ? `${context.label} · ${context.value ?? "No data"}` : "Hover a region"}</span>
          )}
          onRegionClick={(region: MapRegion) => setStatus(`Clicked ${region.label}`)}
          onSelectedChange={(region) => {
            setSelectedId(region?.id ?? null);
            setStatus(region ? `Selected ${region.label}` : "Selection cleared");
          }}
          // Keyed on the id, not the region: going back reports the state you
          // came *from*, so testing the region would say "drilled into" on the
          // way out as well as on the way in.
          onDrillDownChange={(stateId, state) =>
            setStatus(stateId ? `Drilled into ${state?.label}` : "Back to all states")}
          onBackgroundClick={() => setStatus("Clicked open sea")}
        />
      </div>

      <footer className="status">{status}</footer>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
