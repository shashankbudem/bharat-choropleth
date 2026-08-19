import 'dart:ui' show Offset;

/// Thrown when a payload isn't TopoJSON this decoder can read.
class TopoJsonException implements Exception {
  TopoJsonException(this.message);
  final String message;
  @override
  String toString() => 'TopoJsonException: $message';
}

/// One map region's geometry and identity, decoded from TopoJSON.
///
/// [rings] holds every closed ring the feature is made of — outer rings *and*
/// holes, and every part of a multi-part feature, flattened into one list.
/// That's deliberate: the renderer fills with [PathFillType.evenOdd], so holes
/// (an enclave inside a state) and islands (Andaman & Nicobar) both come out
/// right without the caller tracking which ring is which.
class MapFeature {
  const MapFeature({
    required this.id,
    required this.name,
    required this.rings,
    this.properties = const {},
  });

  /// Stable identifier — LGD-derived (`in-cs-30-goa`) in the bundled data.
  final String id;

  /// Display name (`Goa`).
  final String name;

  /// Every ring, in lon/lat degrees. `Offset.dx` is longitude, `dy` is latitude.
  final List<List<Offset>> rings;

  final Map<String, Object?> properties;

  @override
  String toString() => 'MapFeature($id, $name, ${rings.length} rings)';
}

/// Decode a TopoJSON topology into features.
///
/// [objectName] picks which named object to unpack (`states`, `districts`).
/// When omitted the first object is used, which is what the prepared bundles in
/// this repository have.
///
/// Only Polygon and MultiPolygon geometries are read; anything else is skipped,
/// since a choropleth has nothing to fill for points and lines.
List<MapFeature> decodeTopoJson(
  Map<String, Object?> topology, {
  String? objectName,
  String Function(Map<String, Object?> properties)? getId,
  String Function(Map<String, Object?> properties)? getName,
}) {
  final objects = topology['objects'];
  if (objects is! Map<String, Object?> || objects.isEmpty) {
    throw TopoJsonException('topology has no "objects" — is this TopoJSON?');
  }

  final key = objectName ?? objects.keys.first;
  final object = objects[key];
  if (object == null) {
    throw TopoJsonException('no object named "$key" (have: ${objects.keys.join(", ")})');
  }
  if (object is! Map<String, Object?>) {
    throw TopoJsonException('object "$key" is not a TopoJSON geometry object');
  }

  final arcs = _decodeArcs(topology);

  final geometries = object['type'] == 'GeometryCollection'
      ? (object['geometries'] as List? ?? const [])
      : [object];

  final features = <MapFeature>[];
  for (final geometry in geometries) {
    if (geometry is! Map<String, Object?>) continue;
    // Null means "not an area geometry" and is skipped. An *empty* ring list is
    // different: it's an area feature the source has no parts for (Lakshadweep
    // in the bundled current-2019 states). Those are kept, so ids, labels and
    // values still line up with the same data rendered on the web — the region
    // simply draws nothing.
    final rings = _ringsOf(geometry, arcs);
    if (rings == null) continue;

    final properties = (geometry['properties'] as Map?)?.cast<String, Object?>() ?? const <String, Object?>{};
    final id = getId?.call(properties) ??
        (properties['id'] ?? geometry['id'] ?? properties['name'] ?? '').toString();
    final name = getName?.call(properties) ?? (properties['name'] ?? id).toString();

    features.add(MapFeature(id: id, name: name, rings: rings, properties: properties));
  }
  return features;
}

/// Arc positions are delta-encoded when the topology is quantized: each point is
/// stored as an offset from the previous one, and a shared transform maps the
/// running total back into lon/lat. Un-quantized topologies carry absolute
/// coordinates and no transform.
List<List<Offset>> _decodeArcs(Map<String, Object?> topology) {
  final rawArcs = topology['arcs'];
  if (rawArcs is! List) throw TopoJsonException('topology has no "arcs"');

  final transform = topology['transform'];
  List<double>? scale;
  List<double>? translate;
  if (transform is Map) {
    scale = _pair(transform['scale'], 'transform.scale');
    translate = _pair(transform['translate'], 'transform.translate');
  }

  return rawArcs.map<List<Offset>>((arc) {
    if (arc is! List) throw TopoJsonException('an arc is not a list of positions');
    var x = 0.0;
    var y = 0.0;
    final points = <Offset>[];
    for (final position in arc) {
      if (position is! List || position.length < 2) {
        throw TopoJsonException('an arc position is not a [x, y] pair');
      }
      final px = (position[0] as num).toDouble();
      final py = (position[1] as num).toDouble();
      if (scale != null && translate != null) {
        x += px;
        y += py;
        points.add(Offset(x * scale[0] + translate[0], y * scale[1] + translate[1]));
      } else {
        points.add(Offset(px, py));
      }
    }
    return points;
  }).toList(growable: false);
}

List<double> _pair(Object? value, String label) {
  if (value is! List || value.length < 2) {
    throw TopoJsonException('$label must be a two-number list');
  }
  return [(value[0] as num).toDouble(), (value[1] as num).toDouble()];
}

/// Returns null for geometry a choropleth cannot fill (points, lines), and a
/// possibly-empty ring list for Polygon/MultiPolygon.
List<List<Offset>>? _ringsOf(Map<String, Object?> geometry, List<List<Offset>> arcs) {
  final type = geometry['type'];
  if (type != 'Polygon' && type != 'MultiPolygon') return null;

  final arcIndices = geometry['arcs'];
  if (arcIndices is! List) return const [];

  if (type == 'Polygon') {
    // arcs: [ring, ...] where ring is [arcIndex, ...]
    return arcIndices.map((ring) => _stitch(ring as List, arcs)).toList();
  }
  // arcs: [polygon, ...] where polygon is [ring, ...]
  return [
    for (final polygon in arcIndices)
      for (final ring in polygon as List) _stitch(ring as List, arcs),
  ];
}

/// Join a ring's arcs end to end. A negative index means "this arc, reversed" —
/// `~index` is the arc it refers to, matching the TopoJSON spec. Consecutive
/// arcs share their touching endpoint, so every arc after the first drops its
/// leading point to avoid duplicating it.
List<Offset> _stitch(List<Object?> arcIndices, List<List<Offset>> arcs) {
  final ring = <Offset>[];
  for (final raw in arcIndices) {
    final index = (raw as num).toInt();
    final reversed = index < 0;
    final arcIndex = reversed ? ~index : index;
    if (arcIndex < 0 || arcIndex >= arcs.length) {
      throw TopoJsonException('arc index $index is out of range');
    }
    final arc = arcs[arcIndex];
    final points = reversed ? arc.reversed : arc;
    ring.addAll(ring.isEmpty ? points : points.skip(1));
  }
  return ring;
}
