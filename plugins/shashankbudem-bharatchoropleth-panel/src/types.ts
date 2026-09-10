import { PaletteName } from './palettes';

/** Panel options. Field names are strings so they survive a query change. */
export interface BharatOptions {
  /** Frame field holding the state/UT name, id or slug. Empty = first string field. */
  regionField: string;
  /**
   * Optional field holding a district name. Rows that have one become district
   * values nested under their state; rows that leave it empty are the state's
   * own value. Without it the map is state-level only, and drilling in shows
   * districts with no data.
   */
  districtField: string;
  /**
   * Optional field holding a sub-district (tehsil / taluk / mandal) name. Rows
   * carrying one become sub-district values under their district.
   */
  subDistrictField: string;
  /** Frame field holding the number. Empty = first numeric field. */
  valueField: string;
  showLegend: boolean;
  showValues: boolean;
  /** Click a state to load its districts, and a district its sub-districts. */
  drillDown: boolean;
  /**
   * Dashboard variable to write the activated region into, without the `var-`
   * prefix. Empty disables it. This is what makes the map a control rather than
   * a picture: every other panel bound to the same variable follows the click.
   */
  drillDownVariable: string;
  /** Which sequential ramp paints the regions. */
  palette: PaletteName;
  /**
   * How a value becomes a colour.
   *
   * `relative` spreads the ramp across the min and max currently on screen, so a
   * shade means "where this sits among the regions in view" and re-scales on
   * every drill and every time range. `thresholds` pins each band to a number you
   * choose, so a shade means the same thing on every refresh and at every level —
   * which is what you want if these maps get compared over time.
   */
  scaleMode: 'relative' | 'thresholds';
  /** Ascending band edges for `thresholds` mode, comma separated. Used at state level. */
  thresholds: string;
  /**
   * Band edges for the district level. Empty falls back to the state edges.
   *
   * The levels sit on different scales — state totals run to the hundreds while a
   * single state's districts run to the tens — so one set of edges tuned for
   * states paints every district in the lowest band and the map goes flat.
   */
  districtThresholds: string;
  /** Band edges for the sub-district level. Empty falls back to the district edges. */
  subDistrictThresholds: string;
  /** Region border colour. A Grafana colour name or a hex value. */
  borderColor: string;
  /**
   * Colour for map text: the value labels and the tooltip body. Defaults to the
   * named Grafana colour `text`, which resolves per theme — near-white on dark,
   * near-black on light — so a dashboard stays readable in either. A fixed hex
   * overrides it, at the cost of being wrong in one of the two themes.
   */
  labelColor: string;
  /** Border width in screen pixels. Non-scaling, so it holds as the panel resizes. */
  borderWidth: number;
  /**
   * Size of the on-map value labels, in pixels, at every level.
   *
   * The package drops district and sub-district labels to 9px against 11px at
   * state level, on the reasoning that deeper levels pack in more regions. One
   * size applied everywhere reads more consistently; raise it if the labels are
   * hard to read, lower it if a dense district map starts colliding.
   */
  labelSize: number;
  /**
   * Renames for districts and sub-districts whose name in the data differs from
   * the boundary bundle's, one `from = to` per line.
   *
   * Only these levels need it: state names already resolve through the package's
   * registry. Nothing is matched by similarity, so a rename has to be stated.
   */
  aliases: string;
  /** Where the boundary bundles are fetched from. Point at a self-host for air-gapped Grafana. */
  dataBaseUrl: string;
}
