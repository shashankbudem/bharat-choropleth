import 'package:bharat_choropleth/bharat_choropleth.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ColorScale', () {
    const scale = ColorScale();

    test('maps the range ends onto the ends of the ramp', () {
      expect(scale.colorFor(0, 0, 100), kDefaultColorScale.first);
      expect(scale.colorFor(100, 0, 100), kDefaultColorScale.last);
    });

    test('maps the middle of the range to the middle of the ramp', () {
      expect(scale.colorFor(50, 0, 100), kDefaultColorScale[kDefaultColorScale.length ~/ 2]);
    });

    test('gives no-data its own colour, never the bottom of the ramp', () {
      expect(scale.colorFor(null, 0, 100), kEmptyColor);
      expect(scale.colorFor(null, 0, 100), isNot(kDefaultColorScale.first));
    });

    test('uses the top colour when every region shares one value', () {
      // min == max would otherwise divide by zero.
      expect(scale.colorFor(5, 5, 5), kDefaultColorScale.last);
    });

    test('keeps out-of-range values inside the ramp', () {
      expect(scale.colorFor(-10, 0, 100), kDefaultColorScale.first);
      expect(scale.colorFor(999, 0, 100), kDefaultColorScale.last);
    });

    test('handles negative ranges, which are still a valid metric', () {
      expect(scale.colorFor(-10, -10, 10), kDefaultColorScale.first);
      expect(scale.colorFor(10, -10, 10), kDefaultColorScale.last);
    });

    test('falls back to the empty colour when given no ramp', () {
      const bare = ColorScale(colors: []);
      expect(bare.colorFor(5, 0, 10), kEmptyColor);
    });
  });
}
