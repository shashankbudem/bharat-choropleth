import 'dart:ui' show Color;

import 'package:flutter/foundation.dart' show listEquals;

import 'legend.dart';

/// The default low-to-high ramp, identical to the one the web renderers ship so
/// the same data looks the same on both.
const List<Color> kDefaultColorScale = <Color>[
  Color(0xFFD9F1ED),
  Color(0xFFB9E3DD),
  Color(0xFF8FD1C8),
  Color(0xFF5BB9AE),
  Color(0xFF2F9C90),
  Color(0xFF147B71),
  Color(0xFF075B55),
];

/// Fill used for regions with no value. "No data" is a distinct state from a
/// low value, and must never be shown as the bottom of the ramp.
const Color kEmptyColor = Color(0xFFE7EDF0);

/// Maps a value onto an ordered colour ramp.
class ColorScale {
  const ColorScale({this.colors = kDefaultColorScale, this.empty = kEmptyColor});

  final List<Color> colors;
  final Color empty;

  /// Pick the colour for [value] given the range currently on screen.
  ///
  /// A null [value] is "no data" and gets [empty]. When every region shares one
  /// value (`min == max`) the ramp has no meaningful spread, so the top colour
  /// stands in rather than dividing by zero.
  /// The index comes from [swatchIndexOf], which the legend filters by as well:
  /// "highlight the regions painted in this colour" has to be true by
  /// construction, not by two formulas that happen to agree until one is tweaked.
  Color colorFor(double? value, double min, double max) {
    final index = swatchIndexOf(value, min, max, colors.length);
    return index == null ? empty : colors[index];
  }

  /// Compared by its colours, not by identity.
  ///
  /// A host that writes `ColorScale(colors: theme.ramp)` inside its own `build`
  /// hands over a new instance on every frame. Identity comparison would read
  /// that as "the ramp changed" and re-fit the projection and rebuild a `Path`
  /// per region — every pointer move, across all 788 districts.
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ColorScale && listEquals(other.colors, colors) && other.empty == empty;

  @override
  int get hashCode => Object.hash(Object.hashAll(colors), empty);
}
