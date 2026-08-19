import 'dart:ui' show Color;

import 'package:bharat_choropleth/bharat_choropleth.dart';
import 'package:flutter_test/flutter_test.dart';

const _a = Color(0xFF111111);
const _b = Color(0xFF222222);
const _c = Color(0xFF333333);

void main() {
  group('swatchIndexOf', () {
    test('puts the extremes on the end swatches', () {
      expect(swatchIndexOf(0, 0, 100, 5), 0);
      expect(swatchIndexOf(100, 0, 100, 5), 4);
    });

    test('rounds to the nearest stop, so each swatch owns half a step either side', () {
      // Five stops across 0–100 sit at 0, 25, 50, 75, 100.
      expect(swatchIndexOf(37, 0, 100, 5), 1); // nearer 25 than 50
      expect(swatchIndexOf(38, 0, 100, 5), 2);
    });

    test('has nothing to paint without a value or without a ramp', () {
      expect(swatchIndexOf(null, 0, 100, 5), isNull);
      expect(swatchIndexOf(5, 0, 100, 0), isNull);
    });

    test('collapses to the top swatch when there is no spread to map', () {
      expect(swatchIndexOf(5, 0, 100, 1), 0);
      expect(swatchIndexOf(7, 7, 7, 5), 4);
    });
  });

  group('legendBuckets', () {
    test('counts what lands in each swatch and measures the range from it', () {
      // Three stops across 0–10 sit at 0, 5, 10.
      final buckets = legendBuckets([_a, _b, _c], [0, 1, 5, 6, 9, 10, null], 0, 10);
      expect(buckets.map((bucket) => bucket.matches), [2, 2, 2]);
      expect(buckets[1].color, _b);
      expect(buckets[1].from, 5);
      expect(buckets[1].to, 6);
    });

    test('reports an empty swatch as empty rather than inventing a range', () {
      // Nothing near the middle stop: the ramp has a visible gap, and the swatch
      // has to say so instead of naming values no region has.
      final middle = legendBuckets([_a, _b, _c], [0, 1, 10], 0, 10)[1];
      expect(middle.matches, 0);
      expect(middle.from, isNull);
      expect(middle.to, isNull);
    });

    test('has no swatches without a ramp', () {
      expect(legendBuckets(const [], [1, 2], 1, 2), isEmpty);
    });
  });

  group('legendBucketLabel', () {
    String format(double value) => value.toStringAsFixed(0);

    test('says what picking the swatch will give you', () {
      expect(
        legendBucketLabel(const LegendBucket(index: 0, color: _a, from: 12, to: 18, matches: 4), format),
        'Highlight 4 regions, 12 to 18',
      );
      expect(
        legendBucketLabel(const LegendBucket(index: 0, color: _a, from: 25, to: 25, matches: 1), format),
        'Highlight 1 region, 25',
      );
    });

    test('names an empty swatch without a range', () {
      expect(
        legendBucketLabel(const LegendBucket(index: 0, color: _a, from: null, to: null, matches: 0), format),
        'No regions in this band',
      );
    });
  });

  group('ColorScale', () {
    test('paints from the same index the legend filters by', () {
      const scale = ColorScale(colors: [_a, _b, _c]);
      for (final value in [0.0, 3.0, 5.0, 7.0, 10.0]) {
        expect(scale.colorFor(value, 0, 10), scale.colors[swatchIndexOf(value, 0, 10, 3)!]);
      }
    });

    test('keeps "no data" distinct from the bottom of the ramp', () {
      const scale = ColorScale(colors: [_a, _b, _c]);
      expect(scale.colorFor(null, 0, 10), kEmptyColor);
      expect(const ColorScale(colors: []).colorFor(5, 0, 10), kEmptyColor);
    });
  });
}
