import { BharatChoropleth, type InsightContext, type MapLayer, type MapRegion } from "bharat-choropleth";
import { useCallback, useEffect, useMemo, useState } from "react";
import raw from "../../data/india-observatory.json";

type Edition = "historical" | "current";

type LiveSpec = {
  provider: string;
  endpoint: string;
  variable: string;
  centroids: string;
  colorScale: string[];
  legendLabels: [string, string];
};

type Indicator = {
  key: string;
  label: string;
  short: string;
  unit: string;
  description: string;
  edition: Edition;
  levels: string[];
  decimals: number;
  lowerIsBetter?: boolean;
  live?: LiveSpec;
  source: {
    publisher: string; title: string; vintage: string; url: string; joinRule: string;
    formula?: string; sha256?: string; licence?: string; caveat?: string;
  };
  values: { state: Record<string, number | null>; district?: Record<string, number | null> };
};

/**
 * The JSON import carries exact literal types — every id becomes its own key —
 * which no dynamic lookup can index. Declaring the shape once is clearer than
 * casting at each use.
 */
const dataset = raw as unknown as {
  editions: Record<Edition, { label: string }>;
  indicators: Indicator[];
};

const DATA_BASE = "/data/generated";
const EDITION_PATHS: Record<Edition, { states: string; districts: string; object: string }> = {
  historical: {
    states: `${DATA_BASE}/census-2011/states.topo.json`,
    districts: `${DATA_BASE}/census-2011/districts`,
    object: "states",
  },
  current: {
    states: `${DATA_BASE}/current-2019-states/states.topo.json`,
    districts: `${DATA_BASE}/current-2019-districts/districts`,
    object: "states",
  },
};

type Centroids = { counts: Record<string, number>; centroids: Record<string, Record<string, [number, number]>> };

/**
 * Current readings for a set of region ids, in one request.
 *
 * Open-Meteo takes comma-separated coordinates and answers in the same order, so
 * a whole level is one call: 36 states, at most 75 districts in a state, at most
 * 38 sub-districts in a district.
 */
async function readTemperatures(
  live: Pick<LiveSpec, "endpoint" | "variable">,
  points: Record<string, [number, number]>,
  ids: string[],
): Promise<{ values: Record<string, number | null>; observedAt: string | null }> {
  const known = ids.filter((id) => points[id]);
  if (known.length === 0) return { values: {}, observedAt: null };
  const url =
    `${live.endpoint}?latitude=${known.map((id) => points[id]![0]).join(",")}` +
    `&longitude=${known.map((id) => points[id]![1]).join(",")}&current=${live.variable}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`The weather API responded ${response.status}`);
  const payload = await response.json();
  // One coordinate comes back as an object, several as an array.
  const entries = Array.isArray(payload) ? payload : [payload];
  const values: Record<string, number | null> = {};
  let observedAt: string | null = null;
  known.forEach((id, index) => {
    const current = entries[index]?.current;
    const reading = current?.[live.variable];
    values[id] = typeof reading === "number" ? reading : null;
    if (current?.time) observedAt = current.time;
  });
  return { values, observedAt };
}

/** Sequential for a plain rate; the "lower is better" indicators get a reversed ramp. */
const RAMP = ["#e6f2f0", "#c2e2dc", "#95cec4", "#63b5a8", "#3a988b", "#1e786d", "#0b5750"];
const RAMP_INVERSE = ["#0b5750", "#1e786d", "#3a988b", "#63b5a8", "#95cec4", "#c2e2dc", "#e6f2f0"];

function format(indicator: Indicator, value: number | null) {
  if (value === null) return "No data";
  return `${value.toFixed(indicator.decimals)}${indicator.unit}`;
}

/** Ranked best-to-worst, honouring whether low or high is the good end. */
function ranked(indicator: Indicator) {
  const rows = Object.entries(indicator.values.state)
    .filter((entry): entry is [string, number] => entry[1] !== null)
    .map(([id, value]) => ({ id, value }));
  const better = "lowerIsBetter" in indicator && indicator.lowerIsBetter;
  return rows.sort((a, b) => (better ? a.value - b.value : b.value - a.value));
}

function Sources({ indicator }: { indicator: Indicator }) {
  const source = indicator.source;
  return (
    <details className="provenance">
      <summary>Where this number comes from</summary>
      <dl>
        <div><dt>Publisher</dt><dd>{source.publisher}</dd></div>
        <div><dt>Release</dt><dd>{source.title}</dd></div>
        <div><dt>Vintage</dt><dd>{source.vintage}</dd></div>
        <div><dt>Boundaries</dt><dd>{dataset.editions[indicator.edition].label}</dd></div>
        <div><dt>Join</dt><dd>{source.joinRule}</dd></div>
        {source.formula ? <div><dt>Formula</dt><dd><code>{source.formula}</code></dd></div> : null}
        {source.sha256 ? <div><dt>Source file</dt><dd><code className="sha">{source.sha256}</code></dd></div> : null}
        {source.licence ? <div><dt>Licence</dt><dd>{source.licence}</dd></div> : null}
      </dl>
      {source.caveat ? <p className="caveat">{source.caveat}</p> : null}
      <a href={source.url} rel="noreferrer noopener" target="_blank">Open the source release</a>
    </details>
  );
}

export default function App() {
  const [indicatorKey, setIndicatorKey] = useState(dataset.indicators[0]!.key);
  const indicator = useMemo(
    () => dataset.indicators.find((entry) => entry.key === indicatorKey)!,
    [indicatorKey],
  );
  const edition = indicator.edition;

  const [geometry, setGeometry] = useState<Record<string, unknown> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drillDownId, setDrillDownId] = useState<string | null>(null);
  const [insight, setInsight] = useState<InsightContext | null>(null);
  const [showValues, setShowValues] = useState(true);
  const [centroids, setCentroids] = useState<Centroids | null>(null);
  const [liveValues, setLiveValues] = useState<Record<string, number | null>>({});
  const [observedAt, setObservedAt] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const live = indicator.live ?? null;

  // The sampling points are the same file for every level, so it is fetched once.
  useEffect(() => {
    let cancelled = false;
    fetch("/data/region-centroids.json")
      .then((response) => response.json())
      .then((loaded: Centroids) => { if (!cancelled) setCentroids(loaded); })
      .catch(() => { if (!cancelled) setCentroids(null); });
    return () => { cancelled = true; };
  }, []);

  // Readings for the state level, refreshed whenever the live indicator is shown.
  useEffect(() => {
    if (!live || !centroids) return;
    let cancelled = false;
    setLiveValues({});
    setLiveError(null);
    readTemperatures(live, centroids.centroids.states ?? {}, Object.keys(centroids.centroids.states ?? {}))
      .then((result) => {
        if (cancelled) return;
        setLiveValues(result.values);
        setObservedAt(result.observedAt);
      })
      .catch((error: Error) => { if (!cancelled) setLiveError(error.message); });
    return () => { cancelled = true; };
  }, [centroids, live]);

  // The edition changes with the indicator, because the two are not
  // interchangeable: a 2011 statistic belongs on 2011 units.
  useEffect(() => {
    let cancelled = false;
    setGeometry(null);
    setDrillDownId(null);
    setSelectedId(null);
    fetch(EDITION_PATHS[edition].states)
      .then((response) => response.json())
      .then((topology) => { if (!cancelled) setGeometry(topology); })
      .catch(() => { if (!cancelled) setGeometry(null); });
    return () => { cancelled = true; };
  }, [edition]);

  const hasDistricts = indicator.levels.includes("district");
  const hasSubDistricts = indicator.levels.includes("subdistrict");
  const districtValues = "district" in indicator.values ? indicator.values.district : undefined;

  /** Geometry for one level, plus a live reading for every region in it. */
  const liveLayer = useCallback(
    async (url: string, object: string, level: string): Promise<MapLayer> => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`No geometry at ${url}`);
      const topology = await response.json();
      const geometries = topology.objects[object].geometries as { properties: { id: string } }[];
      const { values, observedAt: at } = await readTemperatures(
        live!,
        centroids?.centroids[level] ?? {},
        geometries.map((geometry) => geometry.properties.id),
      );
      if (at) setObservedAt(at);
      return {
        geometry: { topology, object },
        getId: (feature) => String(feature.properties?.id),
        getLabel: (feature) => String(feature.properties?.name),
        getValue: (feature) => values[String(feature.properties?.id)] ?? null,
      };
    },
    [centroids, live],
  );

  // Memoized on the indicator, not rebuilt per render: an unstable loader would
  // refetch the district topology on every keystroke elsewhere on the page.
  const loadDistricts = useCallback(
    async (stateId: string): Promise<MapLayer> => {
      const url = `${EDITION_PATHS[edition].districts}/${stateId}.topo.json`;
      if (live) return liveLayer(url, "districts", "districts");
      const response = await fetch(url);
      if (!response.ok) throw new Error(`No district geometry for ${stateId}`);
      const topology = await response.json();
      return {
        geometry: { topology, object: "districts" },
        getId: (feature) => String(feature.properties?.id),
        getLabel: (feature) => String(feature.properties?.name),
        getValue: (feature) => districtValues?.[String(feature.properties?.id)] ?? null,
      };
    },
    [districtValues, edition, live, liveLayer],
  );

  const loadSubDistricts = useCallback(
    async (districtId: string): Promise<MapLayer | null> => {
      const url = `${DATA_BASE}/current-2019-subdistricts/subdistricts/${districtId}.topo.json`;
      // Three of the 788 districts have no sub-district level at all; null
      // leaves them as leaves rather than opening an empty view.
      const probe = await fetch(url, { method: "HEAD" });
      if (probe.status === 404) return null;
      return liveLayer(url, "subdistricts", "subdistricts");
    },
    [liveLayer],
  );

  const stateValues = live ? liveValues : indicator.values.state;
  const board = useMemo(
    () => live
      ? Object.entries(liveValues)
          .filter((entry): entry is [string, number] => entry[1] !== null)
          .map(([id, value]) => ({ id, value }))
          .sort((a, b) => b.value - a.value)
      : ranked(indicator),
    [indicator, live, liveValues],
  );
  const reported = board.length;
  const total = Object.keys(indicator.values.state).length;
  const best = board[0];
  const worst = board[board.length - 1];
  const median = board.length ? board[Math.floor(board.length / 2)]!.value : null;
  const names = useMemo(() => {
    const source = geometry?.objects as { states?: { geometries: { properties: { id: string; name: string } }[] } } | undefined;
    return new Map((source?.states?.geometries ?? []).map((g) => [g.properties.id, g.properties.name]));
  }, [geometry]);

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="mark">IN</span>
          <div>
            <h1>India Development Observatory</h1>
            <p>Official statistics on this repository&rsquo;s own boundary bundles · <code>bharat-choropleth</code> for React</p>
          </div>
        </div>
        <nav className="ecosystems">
          <a href="/">All examples</a>
          <a href="/js/">Plain JS</a>
          <a href="/flutter/">Flutter</a>
        </nav>
      </header>

      <div className="indicators" role="tablist" aria-label="Indicator">
        {dataset.indicators.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={entry.key === indicatorKey}
            className={entry.key === indicatorKey ? "is-active" : undefined}
            onClick={() => setIndicatorKey(entry.key)}
          >
            {entry.short}
          </button>
        ))}
      </div>

      <section className="kpis" aria-label="Summary">
        <article><span>Reporting</span><strong>{board.length} / {total}</strong><small>states &amp; UTs with a value</small></article>
        <article><span>{indicator.lowerIsBetter ? "Lowest" : "Highest"}</span><strong>{best ? names.get(best.id) ?? best.id : "—"}</strong><small>{best ? format(indicator, best.value) : ""}</small></article>
        <article><span>Median</span><strong>{format(indicator, median)}</strong><small>across reporting regions</small></article>
        <article><span>Boundaries</span><strong>{dataset.editions[edition].label.replace(" boundaries", "")}</strong><small>{live && observedAt ? `read ${observedAt.replace("T", " ")} UTC` : `${indicator.source.vintage} data`} · {hasSubDistricts ? "to sub-district" : hasDistricts ? "state and district" : "state level only"}</small></article>
      </section>

      <main>
        <section className="map-panel">
          <div className="panel-head">
            <div>
              <h2>{indicator.label}</h2>
              <p>{indicator.description}</p>
            </div>
            <div className="panel-actions">
              <label className="toggle">
                <input type="checkbox" checked={showValues} onChange={(event) => setShowValues(event.target.checked)} />
                <span>Values on map</span>
              </label>
              <span className="hint">
                {hasSubDistricts
                  ? "Click a state, then a district, to sample the level below"
                  : hasDistricts
                    ? "Click a state to drill into its districts"
                    : "State level only"}
                {" · click a legend swatch to filter"}
              </span>
            </div>
          </div>

          {geometry && !(live && Object.keys(liveValues).length === 0) ? (
            <BharatChoropleth
              key={edition}
              geometry={{ topology: geometry as never, object: EDITION_PATHS[edition].object }}
              values={stateValues}
              colorScale={live ? live.colorScale : indicator.lowerIsBetter ? RAMP_INVERSE : RAMP}
              legendLabels={live ? live.legendLabels : indicator.lowerIsBetter ? ["Better", "Worse"] : ["Lower", "Higher"]}
              formatValue={(value) => `${value.toFixed(indicator.decimals)}${indicator.unit}`}
              districts={hasDistricts}
              loadDistricts={hasDistricts ? loadDistricts : undefined}
              loadSubDistricts={hasSubDistricts ? loadSubDistricts : undefined}
              drillDownId={drillDownId}
              onDrillDownChange={setDrillDownId}
              selectedId={selectedId}
              onSelectedChange={(region) => setSelectedId(region?.id ?? null)}
              onInsight={setInsight}
              showRegionValues={showValues}
              ariaLabel={`${indicator.label} by state and union territory`}
            />
          ) : (
            <p className="loading">
              {liveError
                ? `Could not read live data: ${liveError}`
                : live
                  ? "Reading the current temperature at every state…"
                  : `Loading ${dataset.editions[edition].label.toLowerCase()}…`}
            </p>
          )}
          <Sources indicator={indicator} />
        </section>

        <aside className="rail">
          <h2>Regional detail</h2>
          {insight ? (
            <>
              <p className="rail-label">{insight.label}</p>
              <p className="rail-value">{format(indicator, insight.value)}</p>
              <dl>
                <div><dt>Rank in view</dt><dd>{insight.rank === null ? "—" : `#${insight.rank} of ${insight.rankedCount}`}</dd></div>
                <div><dt>Level</dt><dd>{insight.level}</dd></div>
              </dl>
            </>
          ) : (
            <p className="rail-empty">Hover, or Tab to a region, for its value and rank.</p>
          )}

          <h3>{indicator.lowerIsBetter ? "Best performing" : "Highest"} states</h3>
          <ol className="board">
            {board.slice(0, 10).map((row, index) => (
              <li key={row.id}>
                <button
                  type="button"
                  className={row.id === selectedId ? "is-selected" : undefined}
                  onClick={() => setSelectedId(row.id)}
                >
                  <span className="place">{index + 1}</span>
                  <span className="who">{names.get(row.id) ?? row.id}</span>
                  <span className="bar" style={{ inlineSize: `${Math.max(4, (row.value / (board[0]?.value || 1)) * 100)}%` }} />
                  <span className="num">{format(indicator, row.value)}</span>
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </main>

      <footer>
        <p>
          Every figure is a published official statistic joined to boundary data in this repository. Regions a source does
          not cover are shown as <em>No data</em> and are never estimated. Boundary provenance and licences:{" "}
          <a href="https://github.com/shashankbudem/bharat-choropleth/blob/main/data/ATTRIBUTION.md">data/ATTRIBUTION.md</a>.
        </p>
      </footer>
    </div>
  );
}

export type { MapRegion };
