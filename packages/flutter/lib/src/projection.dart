import 'dart:math' as math;
import 'dart:ui' show Offset, Rect, Size;

import 'topojson.dart';

/// The coordinate space regions are projected into, matching the `viewBox` the
/// JavaScript and React renderers use. Keeping the same box means a map drawn
/// here lines up with the same data drawn on the web, and the widget only has
/// to scale this box to whatever size it's given.
const Size kViewBox = Size(960, 640);
const double kViewBoxPadding = 28;

/// Web Mercator is undefined at the poles; this is the latitude where the
/// standard square projection is clipped.
const double _maxLatitude = 85.05112878;

/// A spherical Mercator projection fitted to [kViewBox].
///
/// Mirrors d3-geo's `geoMercator().fitExtent(...)`: project every point with the
/// raw transform, then pick the one scale and offset that centres the result
/// inside the box with [kViewBoxPadding] to spare.
class MercatorProjection {
  const MercatorProjection._(this._scale, this._offsetX, this._offsetY);

  final double _scale;
  final double _offsetX;
  final double _offsetY;

  /// Fit every ring of [features] inside [viewBox].
  ///
  /// Throws [ArgumentError] when there's nothing to fit — a zero-extent input
  /// would otherwise divide by zero and paint an empty widget with no clue why.
  factory MercatorProjection.fit(
    Iterable<MapFeature> features, {
    Size viewBox = kViewBox,
    double padding = kViewBoxPadding,
  }) {
    var minX = double.infinity;
    var minY = double.infinity;
    var maxX = double.negativeInfinity;
    var maxY = double.negativeInfinity;

    for (final feature in features) {
      for (final ring in feature.rings) {
        for (final point in ring) {
          final raw = _rawProject(point);
          if (raw.dx < minX) minX = raw.dx;
          if (raw.dx > maxX) maxX = raw.dx;
          if (raw.dy < minY) minY = raw.dy;
          if (raw.dy > maxY) maxY = raw.dy;
        }
      }
    }

    if (minX > maxX || minY > maxY) {
      throw ArgumentError('MercatorProjection.fit: no geometry to fit.');
    }

    final spanX = maxX - minX;
    final spanY = maxY - minY;
    final availableX = viewBox.width - padding * 2;
    final availableY = viewBox.height - padding * 2;
    // A single-point or single-line input has zero span on an axis; fall back to
    // the other axis rather than producing an infinite scale.
    final scaleX = spanX > 0 ? availableX / spanX : double.infinity;
    final scaleY = spanY > 0 ? availableY / spanY : double.infinity;
    final scale =
        math.min(scaleX, scaleY).isFinite ? math.min(scaleX, scaleY) : 1.0;

    // Centre whatever is left over after fitting the longer axis.
    final offsetX = (viewBox.width - scale * spanX) / 2 - minX * scale;
    // Latitude grows north but screen y grows down, so this axis is flipped:
    // the *maximum* projected y maps to the top edge.
    final offsetY = (viewBox.height - scale * spanY) / 2 + maxY * scale;

    return MercatorProjection._(scale, offsetX, offsetY);
  }

  /// Project a lon/lat point (degrees) into view-box coordinates.
  Offset project(Offset lngLat) {
    final raw = _rawProject(lngLat);
    return Offset(raw.dx * _scale + _offsetX, _offsetY - raw.dy * _scale);
  }

  static Offset _rawProject(Offset lngLat) {
    final lambda = lngLat.dx * math.pi / 180;
    final phi = lngLat.dy.clamp(-_maxLatitude, _maxLatitude) * math.pi / 180;
    return Offset(lambda, math.log(math.tan(math.pi / 4 + phi / 2)));
  }
}

/// Where a region's value label should sit.
///
/// Uses the area-weighted centroid of the region's largest ring, so a value
/// lands on the mainland rather than being pulled out to sea by distant islands
/// — a plain bounding-box centre puts Andaman & Nicobar's label in the water.
/// Falls back to the bounds centre for degenerate geometry.
Offset labelPointFor(List<List<Offset>> rings, Rect bounds) {
  List<Offset>? largest;
  var largestArea = 0.0;

  for (final ring in rings) {
    if (ring.length < 3) continue;
    final area = _signedArea(ring).abs();
    if (area > largestArea) {
      largestArea = area;
      largest = ring;
    }
  }

  if (largest == null || largestArea == 0) return bounds.center;

  final signed = _signedArea(largest);
  var cx = 0.0;
  var cy = 0.0;
  for (var i = 0; i < largest.length; i++) {
    final a = largest[i];
    final b = largest[(i + 1) % largest.length];
    final cross = a.dx * b.dy - b.dx * a.dy;
    cx += (a.dx + b.dx) * cross;
    cy += (a.dy + b.dy) * cross;
  }
  final centroid = Offset(cx / (6 * signed), cy / (6 * signed));
  return centroid.dx.isFinite && centroid.dy.isFinite
      ? centroid
      : bounds.center;
}

double _signedArea(List<Offset> ring) {
  var total = 0.0;
  for (var i = 0; i < ring.length; i++) {
    final a = ring[i];
    final b = ring[(i + 1) % ring.length];
    total += a.dx * b.dy - b.dx * a.dy;
  }
  return total / 2;
}

/// How the fixed view box is mapped onto whatever size the widget is given —
/// scaled to fit, preserving aspect ratio and centred, the same as SVG's
/// `preserveAspectRatio="xMidYMid meet"`.
///
/// Kept as a value so painting and hit testing use one definition: a tap is
/// turned back into view-box coordinates with [toViewBox], the exact inverse of
/// what the painter applied.
class ViewBoxFit {
  const ViewBoxFit(this.scale, this.dx, this.dy);

  factory ViewBoxFit.of(Size size, {Size viewBox = kViewBox}) {
    final scale =
        math.min(size.width / viewBox.width, size.height / viewBox.height);
    return ViewBoxFit(
      scale,
      (size.width - viewBox.width * scale) / 2,
      (size.height - viewBox.height * scale) / 2,
    );
  }

  final double scale;
  final double dx;
  final double dy;

  Offset toViewBox(Offset local) =>
      Offset((local.dx - dx) / scale, (local.dy - dy) / scale);

  Rect get destination =>
      Rect.fromLTWH(dx, dy, kViewBox.width * scale, kViewBox.height * scale);
}

/// Longest side of the largest ring's bounding box, in whatever units the rings
/// are in. Used to spot regions whose geometry is correct but too small to see:
/// an island group's overall bounds can be large while every island in it is a
/// fraction of a pixel.
double largestRingExtentOf(List<List<Offset>> rings) {
  var largest = 0.0;
  for (final ring in rings) {
    if (ring.isEmpty) continue;
    var minX = double.infinity;
    var minY = double.infinity;
    var maxX = double.negativeInfinity;
    var maxY = double.negativeInfinity;
    for (final point in ring) {
      if (point.dx < minX) minX = point.dx;
      if (point.dx > maxX) maxX = point.dx;
      if (point.dy < minY) minY = point.dy;
      if (point.dy > maxY) maxY = point.dy;
    }
    final extent = math.max(maxX - minX, maxY - minY);
    if (extent > largest) largest = extent;
  }
  return largest;
}

/// Bounding box of a single ring.
Rect boundsOfRing(List<Offset> ring) {
  if (ring.isEmpty) return Rect.zero;
  var minX = double.infinity;
  var minY = double.infinity;
  var maxX = double.negativeInfinity;
  var maxY = double.negativeInfinity;
  for (final point in ring) {
    if (point.dx < minX) minX = point.dx;
    if (point.dx > maxX) maxX = point.dx;
    if (point.dy < minY) minY = point.dy;
    if (point.dy > maxY) maxY = point.dy;
  }
  return Rect.fromLTRB(minX, minY, maxX, maxY);
}

/// Regions kept at their true size even when they are small enough to qualify
/// for exaggeration.
///
/// Exaggeration assumes a region has room to grow into. Puducherry does not: it
/// is four coastal enclaves *inside* Tamil Nadu, so growing them to the
/// visibility threshold pushes each one several units into the state around it,
/// and the map ends up showing a Puducherry that is the wrong shape in the wrong
/// place. Lakshadweep's islands grow into open sea, where nothing is displaced,
/// which is the case the feature was built for.
///
/// Matched on the id containing the name because host data brings its own id
/// scheme; the bundled layer uses `in-cs-34-puducherry`. A district id inside the
/// UT matches too, which is a no-op: drilled into, its districts fill the map and
/// are far past the threshold that would have grown them.
const _trueGeometryRegions = ['puducherry'];

bool keepsTrueGeometry(String id) {
  final normalized = id.toLowerCase();
  return _trueGeometryRegions.any(normalized.contains);
}

/// Convex hull of a set of points, as one closed ring (Andrew's monotone chain).
/// Returns the input when there is nothing to wrap — fewer than three distinct
/// points, or all of them collinear.
List<Offset> convexHull(List<Offset> points) {
  final sorted = [
    ...points
  ]..sort((a, b) => a.dx != b.dx ? a.dx.compareTo(b.dx) : a.dy.compareTo(b.dy));
  final unique = <Offset>[];
  for (final point in sorted) {
    if (unique.isEmpty || unique.last != point) unique.add(point);
  }
  if (unique.length < 3) return unique;

  double turn(Offset o, Offset a, Offset b) =>
      (a.dx - o.dx) * (b.dy - o.dy) - (a.dy - o.dy) * (b.dx - o.dx);
  List<Offset> half(List<Offset> ordered) {
    final chain = <Offset>[];
    for (final point in ordered) {
      while (chain.length >= 2 &&
          turn(chain[chain.length - 2], chain.last, point) <= 0) {
        chain.removeLast();
      }
      chain.add(point);
    }
    return chain;
  }

  final lower = half(unique);
  final upper = half(unique.reversed.toList(growable: false));
  // Each chain repeats the other's first point, so drop both endpoints once.
  final hull = [
    ...lower.take(lower.length - 1),
    ...upper.take(upper.length - 1)
  ];
  return hull.length >= 3 ? hull : unique;
}

/// One continuous hit area for a region scattered across separate parts: the
/// convex hull of everything it is drawn as.
///
/// Lakshadweep is twenty specks in open sea. Even exaggerated they are a poor
/// tap target, and the water they enclose is how the group reads on the map, so
/// treating that water as part of the region is what a reader expects. The hull
/// is safe to be generous with only because every renderer tests it *after*
/// every real outline has missed, so it can never take a tap from a neighbour it
/// happens to span.
///
/// Null when the region needs no help: a single part, or already big enough to
/// aim at directly ([maxExtent], the same "too small to use" threshold the tap
/// buffer and value labels work from).
List<Offset>? scatteredHitArea(List<List<Offset>> rings, double maxExtent) {
  if (rings.length < 2 || maxExtent <= 0) return null;
  final extent = largestRingExtentOf(rings);
  if (extent <= 0 || extent >= maxExtent) return null;
  final hull = convexHull([for (final ring in rings) ...ring]);
  return hull.length >= 3 ? hull : null;
}

/// Grow a feature whose whole geometry is too small to see, about each part's
/// own centre.
///
/// Two guards make this safe, and both were learned the hard way:
///
/// 1. It applies only when the feature's *largest* part is under [minExtent] —
///    that is, the whole region is tiny. West Bengal is a large state whose
///    Sundarbans delta is fourteen small islets; enlarging those individually
///    blew them up into an overlapping mess across the river mouth.
/// 2. Once a feature qualifies, each part grows about its own centre until it is
///    visible. This preserves every part's location and aspect ratio instead of
///    turning a dispersed archipelago into one large, misplaced blob. The cap
///    keeps the tiniest specks from reading as real landmass.
///
/// Growth is capped by [maxScale] so a speck never reads as a real landmass.
List<List<Offset>> enlargeSmallParts(
  List<List<Offset>> rings,
  double minExtent, {
  double maxScale = 8,
}) {
  if (minExtent <= 0) return rings;
  // Only a feature that is small *as a whole* qualifies.
  final largest = largestRingExtentOf(rings);
  if (largest <= 0 || largest >= minExtent) return rings;

  return rings.map((ring) {
    final bounds = boundsOfRing(ring);
    final extent = math.max(bounds.width, bounds.height);
    final scale = extent <= 0 ? 1.0 : math.min(minExtent / extent, maxScale);
    final centre = bounds.center;
    return ring
        .map((point) => Offset(
              centre.dx + (point.dx - centre.dx) * scale,
              centre.dy + (point.dy - centre.dy) * scale,
            ))
        .toList(growable: false);
  }).toList(growable: false);
}

/// Island groups redrawn larger than life on the national map.
///
/// At national scale both groups all but vanish: Andaman & Nicobar's islands
/// are a few units wide, and Lakshadweep's are specks. This project is about
/// getting numbers across, so a region you cannot see is worse than one drawn
/// larger or out of place. Each group is first magnified as one, about its own
/// centre, like a lens held over it: every island keeps its outline, its place
/// in the group and the water around it.
///
/// - Andaman & Nicobar has open sea all round, and the lens alone is enough.
/// - Lakshadweep's islands are tiny beside the 250 km they spread over, so a
///   lens alone only spreads a few specks further apart. The group is magnified
///   2x and moved 30 units west into the open Arabian Sea, and then each island
///   grows about its own centre, keeping its shape, until it can be seen.
///   Measured on the national map, that keeps it more than 20 units clear of
///   Kerala; the same growth in place would reach the coast.
///
/// Matched on id or label, since host data brings its own ids. Callers apply it
/// to the national layer only: drilled in, a UT fills the map, and its
/// districts' labels ("South Andaman") would match. Mirrors `small-regions.ts`.
const _islandGroups = <({String name, double magnify, double partExtent, Offset shift})>[
  (name: 'andaman', magnify: 1.8, partExtent: 0, shift: Offset.zero),
  (name: 'lakshadweep', magnify: 2, partExtent: 10, shift: Offset(-30, 0)),
];

/// An island group's rings redrawn to be seen, or null for any other region.
///
/// Magnification stops short of [smallExtent], the "too small to use" threshold,
/// because staying under it is what keeps the hit area over the sea, the tap
/// buffer and the value label placed beside the region. The result is pulled
/// back inside [bounds] if it grew past an edge.
List<List<Offset>>? placeIslandGroup(
  String id,
  String label,
  List<List<Offset>> rings,
  double smallExtent,
  Rect bounds,
) {
  final names = '$id $label'.toLowerCase();
  final group = _islandGroups.where((group) => names.contains(group.name)).firstOrNull;
  if (group == null || rings.isEmpty) return null;
  final largest = largestRingExtentOf(rings);
  final factor = largest > 0 ? math.max(1.0, math.min(group.magnify, smallExtent * 0.95 / largest)) : 1.0;
  final centre = boundsOfRing([for (final ring in rings) ...ring]).center;
  final magnified = [
    for (final ring in rings) [for (final point in ring) centre + (point - centre) * factor + group.shift],
  ];
  // enlargeSmallParts leaves the rings alone when partExtent is 0.
  return _keepInside(enlargeSmallParts(magnified, group.partExtent), bounds);
}

/// Move a set of rings, unchanged, so their bounds sit inside [bounds].
List<List<Offset>> _keepInside(List<List<Offset>> rings, Rect bounds) {
  final box = boundsOfRing([for (final ring in rings) ...ring]);
  final dx = box.left < bounds.left
      ? bounds.left - box.left
      : box.right > bounds.right
          ? bounds.right - box.right
          : 0.0;
  final dy = box.top < bounds.top
      ? bounds.top - box.top
      : box.bottom > bounds.bottom
          ? bounds.bottom - box.bottom
          : 0.0;
  if (dx == 0 && dy == 0) return rings;
  final shift = Offset(dx, dy);
  return [
    for (final ring in rings) [for (final point in ring) point + shift],
  ];
}
