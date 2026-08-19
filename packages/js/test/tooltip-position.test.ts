import { describe, expect, it } from "vitest";
import { placeTooltip, type Rect } from "../src/tooltip-position";

function rect(left: number, top: number, width: number, height: number): Rect {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

const BOUNDS = rect(100, 200, 600, 400); // left 100, right 700, top 200, bottom 600
const GAP = 12;

describe("placeTooltip", () => {
  it("leaves a tooltip that already fits exactly where it is", () => {
    expect(placeTooltip(rect(300, 300, 160, 70), BOUNDS, GAP)).toEqual({ dx: 0, side: "above" });
  });

  it("pushes right when the tooltip overhangs the left edge", () => {
    // left 60 is 40px past the bounds' left (100), plus 4px padding.
    expect(placeTooltip(rect(60, 300, 160, 70), BOUNDS, GAP)).toEqual({ dx: 44, side: "above" });
  });

  it("pulls left when the tooltip overhangs the right edge", () => {
    // right 720 is 20px past the bounds' right (700), plus 4px padding.
    expect(placeTooltip(rect(560, 300, 160, 70), BOUNDS, GAP)).toEqual({ dx: -24, side: "above" });
  });

  it("flips below a region near the top, instead of rendering above the map", () => {
    // This is the Jammu & Kashmir case at 375px wide: the box lands above the map.
    expect(placeTooltip(rect(300, 180, 160, 70), BOUNDS, GAP).side).toBe("below");
  });

  it("flips and shifts at the same time for a top corner", () => {
    expect(placeTooltip(rect(60, 180, 160, 70), BOUNDS, GAP)).toEqual({ dx: 44, side: "below" });
  });

  it("favors the left edge when the tooltip is wider than the bounds", () => {
    // Neither edge can be satisfied; the region name leads the content, so keep
    // the left edge visible rather than centering the overflow.
    const wide = rect(50, 300, 800, 70);
    const { dx } = placeTooltip(wide, BOUNDS, GAP);
    expect(wide.left + dx).toBe(BOUNDS.left + 4);
  });
});
