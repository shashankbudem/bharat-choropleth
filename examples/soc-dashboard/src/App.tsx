import { BharatChoropleth, type GeometrySource } from "bharat-choropleth";
import { useEffect, useMemo, useState } from "react";
import statesTopoUrl from "../../../data/generated/current-2019-states/states.topo.json?url";
import { FEEDS, type Feed, format, RAMPS, rollUp, seed, tick, trend, type Values } from "./feeds";

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
  const ramp = RAMPS[feed.ramp];

  return (
    <section className="tile">
      <header className="tile__head">
        <div>
          <h2 className="tile__title">{feed.title}</h2>
          <p className="tile__caption">{feed.caption}</p>
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
        colorScale={ramp}
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

      <footer className="tile__foot">
        <span>{feed.legendLabels[0]}</span>
        {/* Five swatches, not a gradient: the renderer buckets values into exactly
            these five fills, and a smooth bar would promise a continuum it doesn't paint. */}
        <span className="tile__ramp" aria-hidden="true">
          {ramp.map((color) => (
            <i key={color} style={{ background: color }} />
          ))}
        </span>
        <span>{feed.legendLabels[1]}</span>
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
