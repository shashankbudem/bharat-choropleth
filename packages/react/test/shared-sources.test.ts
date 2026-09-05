import { describe, expect, it } from "vitest";
import reactDataSource from "../src/data-source.ts?raw";
import reactGeometry from "../src/geometry.ts?raw";
import reactLegend from "../src/legend.ts?raw";
import reactSmallRegions from "../src/small-regions.ts?raw";
import reactStates from "../src/states.ts?raw";
import reactStyle from "../src/style.css?raw";
import reactTooltipPosition from "../src/tooltip-position.ts?raw";
import jsDataSource from "../../js/src/data-source.ts?raw";
import jsGeometry from "../../js/src/geometry.ts?raw";
import jsLegend from "../../js/src/legend.ts?raw";
import jsSmallRegions from "../../js/src/small-regions.ts?raw";
import jsStates from "../../js/src/states.ts?raw";
import jsStyle from "../../js/src/style.css?raw";
import jsTooltipPosition from "../../js/src/tooltip-position.ts?raw";

/**
 * Modules this package keeps as verbatim copies of the framework-free package's.
 *
 * The two packages are published independently and neither depends on the other,
 * so the repo shares this logic by copying the file rather than by extracting a
 * third package — which would put a workspace dependency into the published
 * graph of both. `vitest.config.ts` states the intent ("copied verbatim from the
 * DOM package so the two cannot drift"); nothing enforced it until this test.
 *
 * State identity matters most. If `states.ts` drifts, `values={{ Orissa: 8 }}`
 * resolves in one package and not the other — a behaviour difference no type or
 * unit test in either package would catch on its own.
 *
 * Read as text rather than from disk so the check needs no `@types/node` in a
 * package that deliberately carries no Node types.
 */
const COPIED: readonly (readonly [file: string, react: string, js: string])[] = [
  ["states.ts", reactStates, jsStates],
  ["data-source.ts", reactDataSource, jsDataSource],
  ["geometry.ts", reactGeometry, jsGeometry],
  ["legend.ts", reactLegend, jsLegend],
  ["small-regions.ts", reactSmallRegions, jsSmallRegions],
  ["tooltip-position.ts", reactTooltipPosition, jsTooltipPosition],
  ["style.css", reactStyle, jsStyle],
];

describe("modules copied from bharat-choropleth-js", () => {
  it.each(COPIED)("%s is byte-identical to the framework-free package's copy", (_file, react, js) => {
    expect(react).toBe(js);
  });
});
