import { BharatChoropleth, type InsightContext, type MapLayer, type MapRegion } from "bharat-choropleth";
import { useCallback, useEffect, useMemo, useState } from "react";
import dataset from "../../data/india-observatory.json";

type Indicator = (typeof dataset)["indicators"][number];
type Edition = "historical" | "current";

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
        <div><dt>Boundaries</dt><dd>{dataset.editions[indicator.edition as Edition].label}</dd></div>
        <div><dt>Join</dt><dd>{source.joinRule}</dd></div>
        {"formula" in source ? <div><dt>Formula</dt><dd><code>{source.formula}</code></dd></div> : null}
        <div><dt>Source file</dt><dd><code className="sha">{source.sha256}</code></dd></div>
      </dl>
      {"caveat" in source ? <p className="caveat">{source.caveat}</p> : null}
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
  const edition = indicator.edition as Edition;

  const [geometry, setGeometry] = useState<Record<string, unknown> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drillDownId, setDrillDownId] = useState<string | null>(null);
  const [insight, setInsight] = useState<InsightContext | null>(null);

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
  const districtValues = "district" in indicator.values ? indicator.values.district : undefined;

  // Memoized on the indicator, not rebuilt per render: an unstable loader would
  // refetch the district topology on every keystroke elsewhere on the page.
  const loadDistricts = useCallback(
    async (stateId: string): Promise<MapLayer> => {
      const response = await fetch(`${EDITION_PATHS[edition].districts}/${stateId}.topo.json`);
      if (!response.ok) throw new Error(`No district geometry for ${stateId}`);
      const topology = await response.json();
      return {
        geometry: { topology, object: "districts" },
        getId: (feature) => String(feature.properties?.id),
        getLabel: (feature) => String(feature.properties?.name),
        getValue: (feature) => districtValues?.[String(feature.properties?.id)] ?? null,
      };
    },
    [districtValues, edition],
  );

  const board = useMemo(() => ranked(indicator), [indicator]);
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
        <article><span>Reporting</span><strong>{reported} / {total}</strong><small>states &amp; UTs with a value</small></article>
        <article><span>{indicator.lowerIsBetter ? "Lowest" : "Highest"}</span><strong>{best ? names.get(best.id) ?? best.id : "—"}</strong><small>{best ? format(indicator, best.value) : ""}</small></article>
        <article><span>Median</span><strong>{format(indicator, median)}</strong><small>across reporting regions</small></article>
        <article><span>Boundaries</span><strong>{dataset.editions[edition].label.replace(" boundaries", "")}</strong><small>{indicator.source.vintage} data · {hasDistricts ? "state and district" : "state level only"}</small></article>
      </section>

      <main>
        <section className="map-panel">
          <div className="panel-head">
            <div>
              <h2>{indicator.label}</h2>
              <p>{indicator.description}</p>
            </div>
            <span className="hint">{hasDistricts ? "Click a state to drill in" : "State level only"} · click a legend swatch to filter</span>
          </div>

          {geometry ? (
            <BharatChoropleth
              key={edition}
              geometry={{ topology: geometry as never, object: EDITION_PATHS[edition].object }}
              values={indicator.values.state}
              colorScale={indicator.lowerIsBetter ? RAMP_INVERSE : RAMP}
              legendLabels={indicator.lowerIsBetter ? ["Better", "Worse"] : ["Lower", "Higher"]}
              formatValue={(value) => `${value.toFixed(indicator.decimals)}${indicator.unit}`}
              districts={hasDistricts}
              loadDistricts={hasDistricts ? loadDistricts : undefined}
              drillDownId={drillDownId}
              onDrillDownChange={setDrillDownId}
              selectedId={selectedId}
              onSelectedChange={(region) => setSelectedId(region?.id ?? null)}
              onInsight={setInsight}
              showRegionValues={false}
              ariaLabel={`${indicator.label} by state and union territory`}
            />
          ) : (
            <p className="loading">Loading {dataset.editions[edition].label.toLowerCase()}…</p>
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
