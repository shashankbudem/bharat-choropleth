import { IndiaChoropleth, type InsightContext, type MapRegion, type TooltipContext } from "bharat-choropleth";
import { useCallback, useMemo, useState } from "react";
import { currentContextOverlay, currentStateLayer, loadCurrentDistrictLayer, loadCurrentDistrictReferenceOverlay, loadCurrentSubDistrictLayer, loadDistrictLayer, loadDistrictReferenceOverlay, sampleValue, stateLayer, type DemoMetric, type DemoYear } from "./data";
import statesTopology from "../../../data/generated/census-2011/states.topo.json";
import currentStatesTopology from "../../../data/generated/current-2019-states/states.topo.json";

type BoundaryEdition = "historical" | "current";

const formatter = new Intl.NumberFormat("en-IN");

/**
 * The three synthetic indicators, and the presentation each one needs.
 *
 * This is the part of the API a single-metric demo never shows: swapping the
 * indicator swaps the ramp, the legend's end labels and the number formatting
 * together, and `change` is signed, so it is the one that needs a divergent ramp
 * — the case the value-semantics table in docs/api-guide.md describes and
 * nothing here previously demonstrated.
 */
const METRICS: Record<DemoMetric, {
  label: string;
  blurb: string;
  legendLabels: readonly [string, string];
  colorScale: string[];
  format: (value: number) => string;
  /** Values fall either side of zero, so a share of the scope total is meaningless. */
  signed?: boolean;
}> = {
  index: {
    label: "Performance index",
    blurb: "A plain count. Sequential ramp, low to high.",
    legendLabels: ["Lower sample index", "Higher sample index"],
    colorScale: ["#d9f1ed", "#b9e3dd", "#8fd1c8", "#5bb9ae", "#2f9c90", "#147b71", "#075b55"],
    format: (value) => formatter.format(value),
  },
  coverage: {
    label: "Coverage rate",
    blurb: "A bounded percentage. Same shape, a different ramp and unit.",
    legendLabels: ["Lower coverage", "Higher coverage"],
    colorScale: ["#f3ecff", "#ddd0fb", "#c2aef4", "#a488e8", "#8563d6", "#6743b8", "#4b2c91"],
    format: (value) => `${value.toFixed(1)}%`,
  },
  change: {
    label: "Change vs. last year",
    blurb: "Signed values either side of zero, so the ramp diverges rather than climbs.",
    legendLabels: ["Decline", "Growth"],
    colorScale: ["#b2432f", "#d08b70", "#ecd0c2", "#f2f0ee", "#c9dfd6", "#79b3a1", "#2f7d63"],
    format: (value) => `${value > 0 ? "+" : ""}${value.toFixed(1)} pts`,
    signed: true,
  },
};

const LEVEL_LABELS = {
  state: "Selected state / UT",
  district: "Selected district",
  subdistrict: "Selected sub-district",
} as const;

function statusFor(value: number | null) {
  if (value === null) return "No data";
  return value === 0 ? "Zero" : "Reported";
}

function Tooltip({ label, value, rank, rankedCount, format }: TooltipContext & { format: (value: number) => string }) {
  return <><strong>{label}</strong><b>{value === null ? "No data" : format(value)}</b><small>{rank === null ? "Missing sample value" : `#${rank} of ${rankedCount} in scope`}</small></>;
}

function InsightRail({ context, metric }: { context: InsightContext | null; metric: DemoMetric }) {
  if (!context) return <aside className="insight-rail"><p className="eyebrow">Inspect a region</p><h2>Explore the map</h2><p>Hover or use Tab to see a clear text summary.</p></aside>;
  return (
    <aside className="insight-rail">
      <p className="eyebrow">{LEVEL_LABELS[context.level]}</p>
      <h2>{context.label}</h2>
      <p className="rail-value">{context.value === null ? "—" : METRICS[metric].format(context.value)}</p>
      <dl>
        {/* rank / rankedCount are computed by the renderer for every level and
            were, until now, the only part of InsightContext nothing displayed. */}
        <div><dt>Rank in scope</dt><dd>{context.rank === null ? "—" : `#${context.rank} of ${context.rankedCount}`}</dd></div>
        {METRICS[metric].signed
          ? null
          : <div><dt>Scope share</dt><dd>{context.share === null ? "—" : `${context.share.toFixed(1)}%`}</dd></div>}
        <div><dt>Data status</dt><dd>{statusFor(context.value)}</dd></div>
      </dl>
      <p className="rail-hint">{METRICS[metric].blurb} Deterministic demo data, not official statistics.</p>
    </aside>
  );
}

export default function App() {
  const [year, setYear] = useState<DemoYear>(2026);
  const [edition, setEdition] = useState<BoundaryEdition>("historical");
  const [drillDownId, setDrillDownId] = useState<string | null>(null);
  const [subDistrictDrillDownId, setSubDistrictDrillDownId] = useState<string | null>(null);
  const [insight, setInsight] = useState<InsightContext | null>(null);
  const [metric, setMetric] = useState<DemoMetric>("index");
  const active = METRICS[metric];
  const layer = useMemo(
    () => edition === "current" ? currentStateLayer(year, metric) : stateLayer(year, metric),
    [edition, metric, year],
  );
  const referenceOverlay = useMemo(() => edition === "historical" ? currentContextOverlay() : undefined, [edition]);
  const loadDistricts = useCallback((id: string, state: MapRegion) => loadDistrictLayer(id, state, year, metric), [metric, year]);
  const loadCurrentDistricts = useCallback((id: string, state: MapRegion) => loadCurrentDistrictLayer(id, state, year, metric), [metric, year]);
  const loadDistrictContext = useCallback((id: string) => loadDistrictReferenceOverlay(id), []);
  const loadCurrentDistrictContext = useCallback((id: string) => loadCurrentDistrictReferenceOverlay(id), []);
  // The third level exists only for the current edition: the historical Census-2011
  // bundle has no sub-district layer, so its districts stay leaves.
  const loadCurrentSubDistricts = useCallback(
    (id: string, district: MapRegion, stateId: string) => loadCurrentSubDistrictLayer(id, district, stateId, year, metric),
    [metric, year],
  );
  const total = useMemo(() => {
    if (drillDownId) return null;
    return edition === "current" ? currentStatesTotal(year) : statesTotal(year);
  }, [drillDownId, edition, year]);
  const scopeLabel = subDistrictDrillDownId ? "Sub-district performance" : drillDownId ? "District performance" : "State-level performance";

  const changeEdition = (next: BoundaryEdition) => {
    setEdition(next);
    setDrillDownId(null);
    setSubDistrictDrillDownId(null);
    setInsight(null);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="#map">Bharat Choropleth</a>
        <div className="header-controls">
          <label className="edition-control">
            <span>Boundary edition</span>
            <select value={edition} onChange={(event) => changeEdition(event.target.value as BoundaryEdition)}>
              <option value="historical">Historical (Census 2011)</option>
              <option value="current">Current (2019 boundaries)</option>
            </select>
          </label>
          <label className="metric-control">
            <span>Indicator</span>
            <select value={metric} onChange={(event) => { setMetric(event.target.value as DemoMetric); setInsight(null); }}>
              {(Object.keys(METRICS) as DemoMetric[]).map((key) => <option key={key} value={key}>{METRICS[key].label}</option>)}
            </select>
          </label>
          <label className="year-control"><span>Reporting year</span><select value={year} onChange={(event) => setYear(Number(event.target.value) as DemoYear)}><option value={2024}>2024</option><option value={2025}>2025</option><option value={2026}>2026</option></select></label>
        </div>
      </header>
      <main id="map">
        <section className="intro"><div><h1>Regional performance</h1><p>Explore totals across regions, then select one to see its districts — and, on the current edition, a district to see its sub-districts.</p></div><div className="total-block"><span>{drillDownId ? "Selected state / UT" : metric === "index" ? "Sample Census-coverage aggregate" : METRICS[metric].label}</span><strong>{subDistrictDrillDownId ? "Sub-district view" : drillDownId ? "District view" : metric === "index" ? formatter.format(total ?? 0) : "Per-region only"}</strong></div></section>
        <div className="dashboard-grid">
          <section className="map-workspace" aria-labelledby="map-title"><div className="map-toolbar"><h2 id="map-title">{scopeLabel === "State-level performance" ? "All states" : scopeLabel}</h2><span className="helper">Tab · Enter/Space · Esc</span></div>
            <IndiaChoropleth
              key={edition}
              states={layer}
              referenceOverlay={referenceOverlay}
              defaultSelectedId={edition === "current" ? "in-cs-27-maharashtra" : "in-hs-27-maharashtra"}
              drillDownId={drillDownId}
              onDrillDownChange={(next) => { setDrillDownId(next); setInsight(null); }}
              subDistrictDrillDownId={subDistrictDrillDownId}
              onSubDistrictDrillDownChange={(next) => { setSubDistrictDrillDownId(next); setInsight(null); }}
              onInsight={setInsight}
              loadDistricts={edition === "historical" ? loadDistricts : loadCurrentDistricts}
              loadSubDistricts={edition === "current" ? loadCurrentSubDistricts : undefined}
              loadDistrictReferenceOverlay={edition === "historical" ? loadDistrictContext : loadCurrentDistrictContext}
              referenceOverlayFill="solid"
              showRegionValues
              colorScale={active.colorScale}
              formatValue={active.format}
              renderTooltip={(context) => <Tooltip {...context} format={active.format} />}
              legendLabels={active.legendLabels}
              ariaLabel={scopeLabel}
            />
          </section>
          <InsightRail context={insight} metric={metric} />
        </div>
      </main>
      <footer>Sample values only; totals cover bundled demo geometry, not every national reference area. Hatched areas are non-statistical and have no metric or district coverage. Historical Census-2011 districts: <a href="https://github.com/datameet/maps">DataMeet India community</a> (<a href="https://github.com/datameet/maps/blob/b3fbbde595310b397a55d718e0958ce249a4fa1f/Districts/README.md">CC BY 2.5 India</a>). Reference context overlay: DataMeet current-state geometry (<a href="https://github.com/datameet/maps">CC BY 4.0</a>), cross-checked against the <a href="https://surveyofindia.gov.in/pages/political-map-of-india">Survey of India political-map depiction</a>; it is not Survey of India geometry. Current (2019) boundary edition, states and districts: <a href="https://github.com/datta07/INDIAN-SHAPEFILES">datta07/INDIAN-SHAPEFILES</a> (MIT). <a href="https://github.com/datameet/maps">Use your own geometry</a>.</footer>
    </div>
  );
}

function statesTotal(year: DemoYear) {
  // This repeats only the value definition—not geometry parsing—so the dashboard chrome remains independent of the renderer.
  const states = statesTopology.objects.states.geometries;
  return states.reduce((sum, feature) => sum + (feature.properties.id === "in-hs-31-lakshadweep" ? 0 : sampleValue(feature.properties.id, year)), 0);
}

function currentStatesTotal(year: DemoYear) {
  const states = currentStatesTopology.objects.states.geometries;
  return states.reduce((sum, feature) => sum + sampleValue(feature.properties.id, year), 0);
}
