/**
 * Edge handling for the centroid-anchored tooltip.
 *
 * The tooltip is anchored to the region's centroid rather than the cursor on
 * purpose: hover and keyboard focus run through the same inspect path, and a
 * focused region has no cursor position to follow. That anchor still has to be
 * nudged so the box never leaves the map — a state at the top of the map (Jammu
 * & Kashmir on a narrow screen) would otherwise render *above* the map, over
 * whatever the host page put there.
 *
 * Kept as a pure function of two rects so both the DOM renderer and the React
 * component can share the same math.
 */

export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export interface TooltipPlacement {
  /** Horizontal correction in px, applied on top of the centering translate. */
  dx: number;
  /** Which side of the centroid the tooltip sits on. */
  side: "above" | "below";
}

/**
 * @param tooltip  The tooltip's rect as currently laid out (centered above the centroid).
 * @param bounds   The area the tooltip must stay inside — the map canvas.
 * @param gap      Space between the centroid and the tooltip edge, in px.
 * @param padding  Minimum breathing room between the tooltip and the bounds edge, in px.
 */
export function placeTooltip(tooltip: Rect, bounds: Rect, gap: number, padding = 4): TooltipPlacement {
  let dx = 0;
  // A tooltip wider than the space available can't satisfy both edges; favor the
  // left one so the region name (which leads the content) stays readable.
  if (tooltip.right > bounds.right - padding) dx = bounds.right - padding - tooltip.right;
  if (tooltip.left + dx < bounds.left + padding) dx = bounds.left + padding - tooltip.left;

  // Flip below only when there genuinely isn't room above. The flipped position
  // is `gap` below the centroid, which is `height + 2 * gap` further down.
  const side: TooltipPlacement["side"] = tooltip.top < bounds.top + padding ? "below" : "above";

  return { dx, side };
}
