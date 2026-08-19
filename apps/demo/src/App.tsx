import { IndiaChoropleth, type InsightContext, type MapRegion, type TooltipContext } from "bharat-choropleth";
import { useCallback, useMemo, useState } from "react";
import { currentContextOverlay, currentStateLayer, loadCurrentDistrictLayer, loadCurrentDistrictReferenceOverlay, loadDistrictLayer, loadDistrictReferenceOverlay, sampleValue, stateLayer, type DemoYear } from "./data";
import statesTopology from "../../../data/generated/census-2011/states.topo.json";
import currentStatesTopology from "../../../data/generated/current-2019-states/states.topo.json";

type BoundaryEdition = "historical" | "current";

const formatter = new Intl.NumberFormat("en-IN");

function statusFor(value: number | null) {
  if (value === null) return "No data";
  return value === 0 ? "Zero" : "Reported";
}

function Tooltip({ label, value, share }: TooltipContext) {
  return <><strong>{label}</strong><b>{value === null ? "No data" : formatter.format(value)}</b><small>{share === null ? "Missing sample value" : `${share.toFixed(1)}% of current scope`}</small></>;
}

function InsightRail({ context }: { context: InsightContext | null }) {
  if (!context) return <aside className="insight-rail"><p className="eyebrow">Inspect a region</p><h2>Explore the map</h2><p>Hover or use Tab to see a clear text summary.</p></aside>;
  return (
    <aside className="insight-rail">
      <p className="eyebrow">{context.level === "state" ? "Selected state / UT" : "Selected district"}</p>
      <h2>{context.label}</h2>
      <p className="rail-value">{context.value === null ? "—" : formatter.format(context.value)}</p>
      <dl>
        <div><dt>Scope share</dt><dd>{context.share === null ? "—" : `${context.share.toFixed(1)}%`}</dd></div>
        <div><dt>Data status</dt><dd>{statusFor(context.value)}</dd></div>
      </dl>
      <p className="rail-hint">Sample performance index. Values are deterministic demo data, not official statistics.</p>
    </aside>
  );
}

export default function App() {
  const [year, setYear] = useState<DemoYear>(2026);
  const [edition, setEdition] = useState<BoundaryEdition>("historical");
  const [drillDownId, setDrillDownId] = useState<string | null>(null);
  const [insight, setInsight] = useState<InsightContext | null>(null);
  const layer = useMemo(() => edition === "current" ? currentStateLayer(year) : stateLayer(year), [edition, year]);
  const referenceOverlay = useMemo(() => edition === "historical" ? currentContextOverlay() : undefined, [edition]);
  const loadDistricts = useCallback((id: string, state: MapRegion) => loadDistrictLayer(id, state, year), [year]);
  const loadCurrentDistricts = useCallback((id: string, state: MapRegion) => loadCurrentDistrictLayer(id, state, year), [year]);
  const loadDistrictContext = useCallback((id: string) => loadDistrictReferenceOverlay(id), []);
  const loadCurrentDistrictContext = useCallback((id: string) => loadCurrentDistrictReferenceOverlay(id), []);
  const total = useMemo(() => {
    if (drillDownId) return null;
    return edition === "current" ? currentStatesTotal(year) : statesTotal(year);
  }, [drillDownId, edition, year]);
  const scopeLabel = drillDownId ? "District performance" : "State-level performance";

  const changeEdition = (next: BoundaryEdition) => {
    setEdition(next);
    setDrillDownId(null);
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
          <label className="year-control"><span>Reporting year</span><select value={year} onChange={(event) => setYear(Number(event.target.value) as DemoYear)}><option value={2024}>2024</option><option value={2025}>2025</option><option value={2026}>2026</option></select></label>
        </div>
      </header>
      <main id="map">
        <section className="intro"><div><h1>Regional performance</h1><p>Explore totals across regions, then select one to see its districts.</p></div><div className="total-block"><span>{drillDownId ? "Selected state / UT" : "Sample Census-coverage aggregate"}</span><strong>{drillDownId ? "District view" : formatter.format(total ?? 0)}</strong></div></section>
        <div className="dashboard-grid">
          <section className="map-workspace" aria-labelledby="map-title"><div className="map-toolbar"><h2 id="map-title">{drillDownId ? "District performance" : "All states"}</h2><span className="helper">Tab · Enter/Space · Esc</span></div>
            <IndiaChoropleth
              key={edition}
              states={layer}
              referenceOverlay={referenceOverlay}
              defaultSelectedId={edition === "current" ? "in-cs-27-maharashtra" : "in-hs-27-maharashtra"}
              drillDownId={drillDownId}
              onDrillDownChange={(next) => { setDrillDownId(next); setInsight(null); }}
              onInsight={setInsight}
              loadDistricts={edition === "historical" ? loadDistricts : loadCurrentDistricts}
              loadDistrictReferenceOverlay={edition === "historical" ? loadDistrictContext : loadCurrentDistrictContext}
              referenceOverlayFill="solid"
              showRegionValues
              colorScale={["#d9f1ed", "#b9e3dd", "#8fd1c8", "#5bb9ae", "#2f9c90", "#147b71", "#075b55"]}
              formatValue={formatter.format}
              renderTooltip={(context) => <Tooltip {...context} />}
              legendLabels={["Lower sample index", "Higher sample index"]}
              ariaLabel={scopeLabel}
            />
          </section>
          <InsightRail context={insight} />
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
