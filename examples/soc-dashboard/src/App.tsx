import { BharatChoropleth, type GeometrySource } from "bharat-choropleth";
import { Fragment, useEffect, useMemo, useState } from "react";
import statesTopoUrl from "../../../data/generated/current-2019-states/states.topo.json?url";
import { colorOf, FEEDS, type Feed, format, formatBreak, RAMP, rollUp, seed, tick, trend, type Values } from "./feeds";

/**
 * One fetch for the whole board. Every tile is handed this same promise, so the
 * 36-feature state layer crosses the network once instead of nine times.
 */
const GEOMETRY: Promise<GeometrySource> = fetch(statesTopoUrl)
  .then((response) => response.json())
  .then((topology) => ({ topology, object: "states" }) as GeometrySource);

const CLOCK = new Intl.DateTimeFormat("en-IN", { hour12: false, timeStyle: "medium", timeZone: "Asia/Kolkata" });

const ARROW = { up: "▲", down: "▼", flat: "■" } as const;

/**
 * A tick's worth of the feed. The direction arrow is computed *in* the tick and
 * kept alongside the values, not derived during render from a ref — a render is
 * not always a tick (StrictMode runs two, React may run more), and comparing a
 * roll-up against itself always reads flat.
 */
interface Frame {
  values: Values;
  national: number;
  direction: "up" | "down" | "flat";
}

function firstFrame(feed: Feed): Frame {
  const values = seed(feed);
  return { values, national: rollUp(feed, values), direction: "flat" };
}

function Tile({ feed }: { feed: Feed }) {
  const [frame, setFrame] = useState<Frame>(() => firstFrame(feed));

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((current) => {
        const values = tick(feed, current.values);
        const national = rollUp(feed, values);
        return { values, national, direction: trend(feed, national, current.national) };
      });
    }, feed.interval);
    return () => clearInterval(timer);
  }, [feed]);

  const { values, national, direction } = frame;

  // `values` changes every tick, so only the parts that don't are worth memoizing.
  const formatValue = useMemo(() => (value: number) => format(feed, value), [feed]);
  // A feed with thresholds gets a function scale, so its fill is decided by the
  // reading alone rather than by where it sits among the other 35 states right
  // now. Everything else hands the renderer the ramp and lets it scale to spread.
  const colorScale = useMemo(
    () => (feed.breaks ? (value: number | null) => colorOf(feed, value) : RAMP),
    [feed],
  );

  return (
    <section className="tile">
      <header className="tile__head">
        <div>
          <h2 className="tile__title">{feed.title}</h2>
          <p className="tile__caption">
            {feed.caption}
            {feed.breaks && <b className="tile__badge">fixed bands</b>}
          </p>
        </div>
        <div className={`tile__reading tile__reading--${direction}`}>
          <span className="tile__number">{format(feed, national)}</span>
          <span className="tile__unit">
            {feed.unit} <span className="tile__arrow">{ARROW[direction]}</span>
          </span>
        </div>
      </header>

      <BharatChoropleth
        values={values}
        geometry={GEOMETRY}
        colorScale={colorScale}
        formatValue={formatValue}
        showLegend={false}
        showBreadcrumb={false}
        ariaLabel={`${feed.title} by state and union territory`}
        className="tile__map"
        renderTooltip={({ label, value }) => (
          <>
            <strong>{label}</strong>
            <b>
              {value === null ? "no signal" : format(feed, value)} {feed.unit}
            </b>
          </>
        )}
      />

      {/* A fixed-band tile prints its thresholds between the swatches — the same
          green means the same reading every refresh, so the legend can say what it
          is. A relative one can only honestly say "lower" and "higher". */}
      <footer className="tile__foot">
        {!feed.breaks && <span>{feed.legendLabels[0]}</span>}
        <span className="tile__scale">
          {RAMP.map((color, index) => (
            <Fragment key={color}>
              <i style={{ background: color }} />
              {feed.breaks && index < feed.breaks.length && <b>{formatBreak(feed.breaks[index] as number)}</b>}
            </Fragment>
          ))}
        </span>
        {!feed.breaks && <span>{feed.legendLabels[1]}</span>}
        <em className="tile__rate">{feed.interval}ms</em>
      </footer>
    </section>
  );
}

export default function App() {
  const [now, setNow] = useState(() => CLOCK.format(new Date()));
  useEffect(() => {
    const timer = setInterval(() => setNow(CLOCK.format(new Date())), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="board">
      <header className="board__head">
        <h1>
          <span className="board__glyph">▚</span> BHARAT SOC / NOC GRID
        </h1>
        <p className="board__sub">
          national infrastructure telemetry · 36 states &amp; UTs · <b>SIMULATED FEED</b>
        </p>
        <p className="board__clock">
          {now} IST <span className="board__pulse" aria-hidden="true" /> LIVE
        </p>
      </header>

      <main className="grid">
        {FEEDS.map((feed) => (
          <Tile key={feed.id} feed={feed} />
        ))}
      </main>

      <footer className="board__foot">
        Values are synthetic and generated in the browser. Boundaries derived from
        datta07/INDIAN-SHAPEFILES (MIT), rendered with bharat-choropleth.
      </footer>
    </div>
  );
}
