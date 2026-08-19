import 'dart:ui' show Rect;

/// Edge handling for the label-point-anchored tooltip.
///
/// The tooltip is anchored to the region's own label point rather than the
/// pointer on purpose: hover and tap run through the same inspect path, and a
/// region selected by tap on a touch screen has no cursor to follow. That anchor
/// still has to be nudged so the box never leaves the map — a state at the top
/// (Jammu & Kashmir on a narrow screen) would otherwise render above the map,
/// over whatever the host put there.
///
/// Kept as a pure function of two rects, mirroring `tooltip-position.ts` in the
/// JavaScript and React packages so all three nudge identically.

/// Which side of the anchor the tooltip sits on.
enum TooltipSide { above, below }

class TooltipPlacement {
  const TooltipPlacement(this.dx, this.side);

  /// Horizontal correction in logical pixels, on top of the centring translate.
  final double dx;
  final TooltipSide side;
}

/// [tooltip] is the box as currently laid out (centred above the anchor),
/// [bounds] the area it must stay inside — the map canvas — [gap] the space
/// between anchor and tooltip edge, and [padding] the breathing room kept
/// between the tooltip and the edge of [bounds].
TooltipPlacement placeTooltip(Rect tooltip, Rect bounds, double gap, {double padding = 4}) {
  var dx = 0.0;
  // A tooltip wider than the space available cannot satisfy both edges; favour
  // the left one so the region name, which leads the content, stays readable.
  if (tooltip.right > bounds.right - padding) dx = bounds.right - padding - tooltip.right;
  if (tooltip.left + dx < bounds.left + padding) dx = bounds.left + padding - tooltip.left;

  // Flip below only when there genuinely is not room above.
  final side = tooltip.top < bounds.top + padding ? TooltipSide.below : TooltipSide.above;

  return TooltipPlacement(dx, side);
}
