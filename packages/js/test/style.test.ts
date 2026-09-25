import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../src/style.css"), "utf8");
const rule = (selector: string) => {
  const match = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`no rule for ${selector}`);
  return match[1]!;
};

describe("island coastline styling", () => {
  // Hosts theme the border through --india-map-stroke (the zero-config
  // borderColor, the Grafana panel's border option). An island colour of its
  // own would leave the islands outlined in something the host never chose.
  it("keeps the configured border colour, changing only the width", () => {
    const island = rule(".india-choropleth__region--island");
    expect(island).not.toMatch(/(^|[;\s])stroke\s*:/);
    expect(island).toMatch(/stroke-width\s*:/);
  });

  it("is never thicker than the configured border", () => {
    expect(rule(".india-choropleth__region--island")).toMatch(
      /stroke-width\s*:\s*min\(\s*var\(--india-map-border-width\)\s*,\s*var\(--india-map-island-border-width\)\s*\)/,
    );
  });

  // Lakshadweep's enlarged islands are strips a unit or two wide. A border
  // centred on the edge, even a thin white one, ate most of that and left the
  // group a few specks. Drawn under the fill it only adds outward.
  it("draws the border under the fill, so it never covers a thin island", () => {
    expect(rule(".india-choropleth__region--island")).toMatch(/paint-order\s*:\s*stroke/);
  });
});
