import 'package:flutter/widgets.dart';

import 'topojson.dart';

/// The painted map surface, apart from the breadcrumb and legend around it.
/// Taps are in this box's coordinates, so a test or a host measuring the map
/// needs this rather than the widget's own, which includes the chrome.
const Key kChoroplethSurfaceKey = ValueKey('bharat_choropleth.surface');

/// Which layer the map is showing. Values, colour bands and the legend's own
/// filter are all derived per level, because a district's number only means
/// anything against the other districts in its state.
enum ChoroplethLevel { state, district }

/// A set of regions and the values for them — what a drill-down loader returns.
///
/// Values are keyed by region id *or* display name, the same way the widget's
/// own [IndiaChoropleth.values] are, so a loader can hand back whichever its
/// data already has.
class ChoroplethLayer {
  const ChoroplethLayer({required this.features, this.values = const {}});

  final List<MapFeature> features;
  final Map<String, double?> values;
}

/// Non-statistical context drawn beneath the data and never coloured by it —
/// the claimed-boundary outline, for instance. It takes part in the projection
/// fit so it registers against the map, but it is in no colour band, carries no
/// value, and never responds to a tap.
class ReferenceOverlay {
  const ReferenceOverlay({required this.features, this.descriptions = const {}});

  final List<MapFeature> features;

  /// Extra context per feature id, read out after the label by a screen reader.
  final Map<String, String> descriptions;
}

/// How the reference overlay is filled. Hatching reads as "not data"; a solid
/// fill suits a host that draws its own key.
enum ReferenceOverlayFill { hatch, solid }

/// What the tooltip and the host-owned insight panel are told about a region.
///
/// Share and rank are computed against the regions currently on screen, so they
/// answer "of what is drawn" rather than "of some hidden total".
class ChoroplethInsight {
  const ChoroplethInsight({
    required this.region,
    required this.level,
    required this.total,
    required this.share,
    required this.rank,
    required this.rankedCount,
    required this.selected,
  });

  final ChoroplethRegion region;
  final ChoroplethLevel level;

  /// Sum of every value on screen, treating "no data" as zero.
  final double total;

  /// This region's percentage of [total], or null when it has no value or the
  /// total is zero — a share of nothing is not zero percent, it is undefined.
  final double? share;

  /// 1-based, best first. Ties take the better rank ("2nd of 36" twice, then
  /// 4th), which is what a reader expects from a leaderboard and avoids an
  /// arbitrary tiebreak. Null when the region has no value.
  final int? rank;

  /// How many regions were ranked — those with a value, not every region drawn.
  final int rankedCount;

  /// Whether this is the selected region rather than merely the inspected one.
  final bool selected;
}

/// A region as it is drawn: identity, value, and its projected outline.
class ChoroplethRegion {
  const ChoroplethRegion({
    required this.id,
    required this.label,
    required this.value,
    required this.path,
    required this.hitPath,
    required this.bounds,
    required this.labelPoint,
    required this.largestRingExtent,
    required this.partBounds,
    required this.feature,
  });

  final String id;
  final String label;
  final double? value;

  /// Outline in view-box coordinates, filled even-odd so holes and islands work.
  final Path path;

  /// Hull covering a scattered region's parts and the space between them, so a
  /// tap on the water inside Lakshadweep reaches Lakshadweep. Never painted, and
  /// tested only after every real outline has missed. Null for regions that are
  /// one part or big enough to aim at directly.
  final Path? hitPath;
  final Rect bounds;

  /// Where a value label sits — the largest ring's centroid, not the bounds centre.
  final Offset labelPoint;

  /// Longest side of the largest ring's bounding box, in view-box units. Small
  /// island groups like Lakshadweep spread over a wide area while every island in
  /// them is a fraction of a pixel — the extent catches that, the bounds do not.
  final double largestRingExtent;

  /// Bounding box of each separate part. Puducherry is two enclaves on opposite
  /// sides of a neighbour: one box around the whole region would cover the land
  /// between them, so proximity is measured against the parts, not the union.
  final List<Rect> partBounds;

  final MapFeature feature;
}

/// A reference-overlay feature as it is drawn.
class ChoroplethReferenceRegion {
  const ChoroplethReferenceRegion({
    required this.id,
    required this.label,
    required this.description,
    required this.path,
  });

  final String id;
  final String label;
  final String description;
  final Path path;
}
