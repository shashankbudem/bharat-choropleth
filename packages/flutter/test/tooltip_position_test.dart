import 'dart:ui' show Rect;

import 'package:bharat_choropleth/bharat_choropleth.dart';
import 'package:flutter_test/flutter_test.dart';

/// Mirrors `tooltip-position.test.ts` case for case, so a nudge that differs
/// between Flutter and the web shows up as a failing test rather than as a
/// tooltip that hangs off one platform's edge.
Rect rect(double left, double top, double width, double height) =>
    Rect.fromLTWH(left, top, width, height);

final bounds = rect(100, 200, 600, 400); // left 100, right 700, top 200, bottom 600
const gap = 12.0;

void main() {
  group('placeTooltip', () {
    test('leaves a tooltip that already fits exactly where it is', () {
      final placement = placeTooltip(rect(300, 300, 160, 70), bounds, gap);
      expect(placement.dx, 0);
      expect(placement.side, TooltipSide.above);
    });

    test('pushes right when the tooltip overhangs the left edge', () {
      // left 60 is 40px past the bounds' left (100), plus 4px padding.
      expect(placeTooltip(rect(60, 300, 160, 70), bounds, gap).dx, 44);
    });

    test('pulls left when the tooltip overhangs the right edge', () {
      // right 720 is 20px past the bounds' right (700), plus 4px padding.
      expect(placeTooltip(rect(560, 300, 160, 70), bounds, gap).dx, -24);
    });

    test('flips below a region near the top, instead of rendering above the map', () {
      expect(placeTooltip(rect(300, 180, 160, 70), bounds, gap).side, TooltipSide.below);
    });

    test('flips and shifts at the same time for a top corner', () {
      final placement = placeTooltip(rect(60, 180, 160, 70), bounds, gap);
      expect(placement.dx, 44);
      expect(placement.side, TooltipSide.below);
    });

    test('favours the left edge when the tooltip is wider than the bounds', () {
      // Neither edge can be satisfied; the region name leads the content, so keep
      // the left edge visible rather than centring the overflow.
      final wide = rect(50, 300, 800, 70);
      expect(wide.left + placeTooltip(wide, bounds, gap).dx, bounds.left + 4);
    });
  });
}
