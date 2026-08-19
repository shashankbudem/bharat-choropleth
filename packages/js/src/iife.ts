/**
 * Entry point for the `<script src="...">` build only.
 *
 * Two things happen here that deliberately do *not* happen on the ESM path:
 *
 * 1. The stylesheet is injected into `<head>` on load, so a plain HTML page needs
 *    a single script tag and nothing else. Bundler consumers keep importing
 *    `bharat-choropleth-js/style.css` themselves, which is what lets their
 *    build pipeline hash, extract and cache it.
 * 2. `BharatChoropleth` is assigned to `window` as the class itself. tsup's
 *    `globalName` would expose the module *namespace* — i.e.
 *    `new IndiaChoropleth.BharatChoropleth(...)` — so the assignment is done by
 *    hand to keep the promised `new BharatChoropleth(...)` call shape.
 */
import styles from "./style.css";
import { BharatChoropleth } from "./BharatChoropleth";
import { IndiaChoropleth } from "./IndiaChoropleth";
import { STATES, resolveState } from "./states";
import { ATTRIBUTION, DEFAULT_DATA_BASE_URL } from "./data-source";

const STYLE_ID = "bharat-choropleth-styles";

function injectStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return; // idempotent: two script tags must not double-inject
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = styles;
  document.head.appendChild(style);
}

injectStyles();

const globalScope = globalThis as Record<string, unknown>;

// The two constructors get plain global names, matching the documented call
// shape. Everything else hangs off the namespace object so the global surface
// stays to three names.
globalScope.BharatChoropleth = BharatChoropleth;
globalScope.IndiaChoropleth = IndiaChoropleth;
globalScope.BharatChoroplethLib = {
  BharatChoropleth,
  IndiaChoropleth,
  STATES,
  resolveState,
  ATTRIBUTION,
  DEFAULT_DATA_BASE_URL,
  injectStyles,
};
