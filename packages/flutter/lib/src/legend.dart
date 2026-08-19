import 'dart:ui' show Color;

/// The legend, as a filter.
///
/// Every value on the map is painted from one of the ramp's colours. That makes
/// the legend a ready-made set of value bands, and picking a band is the
/// question a reader of a choropleth actually has: *which regions are the dark
/// ones?* These helpers answer it — which swatch a value belongs to, what each
/// swatch stands for, and how many regions land there.
///
/// [swatchIndexOf] is the single definition of that mapping: [ColorScale] picks
/// a region's fill with it too, so "highlight the regions painted in this
/// colour" is true by construction rather than by two formulas agreeing.
///
/// Mirrors `legend.ts` in the JavaScript and React packages, function for
/// function, so the same data filters the same way on all three.

/// One swatch: the colour, and what the map actually has in it.
class LegendBucket {
  const LegendBucket({
    required this.index,
    required this.color,
    required this.from,
    required this.to,
    required this.matches,
  });

  final int index;
  final Color color;

  /// Lowest and highest value that lands here, or null when nothing does.
  ///
  /// The band the ramp *nominally* covers is a half-step either side of the
  /// swatch's own stop, which lands on numbers like "24.333 to 31" that appear
  /// nowhere in the data. What a reader wants to know is what picking this
  /// swatch will give them, so the range is measured from the regions in it.
  final double? from;
  final double? to;

  /// How many regions land here. Zero means the swatch would filter to nothing.
  final int matches;
}

/// Which swatch a value is painted from, or null when there is nothing to paint
/// — no value, or no ramp to paint it with.
///
/// A ramp of one colour, or data with no spread at all, collapses to the top
/// swatch: there is a single band and every value is in it.
int? swatchIndexOf(double? value, double min, double max, int count) {
  if (value == null || count <= 0) return null;
  if (count == 1 || max == min) return count - 1;
  final index = ((value - min) / (max - min) * (count - 1)).round();
  return index.clamp(0, count - 1);
}

/// The ramp described swatch by swatch.
List<LegendBucket> legendBuckets(
  List<Color> colors,
  Iterable<double?> values,
  double min,
  double max,
) {
  final count = colors.length;
  return [
    for (var index = 0; index < count; index++)
      () {
        final members = [
          for (final value in values)
            if (swatchIndexOf(value, min, max, count) == index) value!,
        ];
        return LegendBucket(
          index: index,
          color: colors[index],
          from: members.isEmpty ? null : members.reduce((a, b) => a < b ? a : b),
          to: members.isEmpty ? null : members.reduce((a, b) => a > b ? a : b),
          matches: members.length,
        );
      }(),
  ];
}

/// What a swatch does, in words — the accessible name for its control, since the
/// colour itself carries the meaning and a screen reader cannot see it.
String legendBucketLabel(LegendBucket bucket, String Function(double value) formatValue) {
  final from = bucket.from;
  final to = bucket.to;
  if (bucket.matches == 0 || from == null || to == null) return 'No regions in this band';
  final range = from == to ? formatValue(from) : '${formatValue(from)} to ${formatValue(to)}';
  return 'Highlight ${bucket.matches} ${bucket.matches == 1 ? "region" : "regions"}, $range';
}
