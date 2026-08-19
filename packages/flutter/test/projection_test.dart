import 'dart:ui' show Offset, Rect, Size;

import 'package:bharat_choropleth/bharat_choropleth.dart';
import 'package:flutter_test/flutter_test.dart';

MapFeature box(
        String id, double west, double south, double east, double north) =>
    MapFeature(
      id: id,
      name: id,
      rings: [
        [
          Offset(west, south),
          Offset(east, south),
          Offset(east, north),
          Offset(west, north),
          Offset(west, south),
        ],
      ],
    );

Iterable<Offset> projectAll(
    MercatorProjection projection, List<MapFeature> features) sync* {
  for (final feature in features) {
    for (final ring in feature.rings) {
      for (final point in ring) {
        yield projection.project(point);
      }
    }
  }
}

void main() {
  group('MercatorProjection.fit', () {
    test('keeps every projected point inside the view box, padding included',
        () {
      final features = [box('a', 68, 8, 97, 37)]; // roughly India's extent
      final projection = MercatorProjection.fit(features);

      for (final point in projectAll(projection, features)) {
        expect(point.dx, greaterThanOrEqualTo(kViewBoxPadding - 0.001));
        expect(point.dx,
            lessThanOrEqualTo(kViewBox.width - kViewBoxPadding + 0.001));
        expect(point.dy, greaterThanOrEqualTo(kViewBoxPadding - 0.001));
        expect(point.dy,
            lessThanOrEqualTo(kViewBox.height - kViewBoxPadding + 0.001));
      }
    });

    test('flips latitude: further north is further up the screen', () {
      final features = [box('a', 0, 0, 10, 10)];
      final projection = MercatorProjection.fit(features);
      final south = projection.project(const Offset(5, 0));
      final north = projection.project(const Offset(5, 10));
      expect(north.dy, lessThan(south.dy));
    });

    test('centres the fitted geometry on the axis it does not fill', () {
      // A tall, narrow box fills the height, so the leftover width splits evenly.
      final features = [box('a', 0, 0, 1, 20)];
      final projection = MercatorProjection.fit(features);
      final points = projectAll(projection, features).toList();
      final minX = points.map((p) => p.dx).reduce((a, b) => a < b ? a : b);
      final maxX = points.map((p) => p.dx).reduce((a, b) => a > b ? a : b);
      expect(minX, closeTo(kViewBox.width - maxX, 0.001));
    });

    test('preserves aspect ratio — one scale for both axes', () {
      final features = [box('a', 0, 0, 10, 10)];
      final projection = MercatorProjection.fit(features);
      final a = projection.project(const Offset(0, 0));
      final b = projection.project(const Offset(10, 0));
      final c = projection.project(const Offset(0, 10));
      // 10° of longitude and 10° of latitude at the equator are near-equal in
      // Mercator, so the projected spans should be too. A per-axis stretch would
      // make these diverge sharply.
      expect((b.dx - a.dx) / (a.dy - c.dy), closeTo(1, 0.02));
    });

    test('clamps latitude at the Mercator limit instead of returning infinity',
        () {
      final features = [box('a', 0, -89, 10, 89)];
      final projection = MercatorProjection.fit(features);
      for (final point in projectAll(projection, features)) {
        expect(point.dx.isFinite, isTrue);
        expect(point.dy.isFinite, isTrue);
      }
    });

    test('throws on empty geometry rather than painting a blank map', () {
      expect(() => MercatorProjection.fit(const []), throwsArgumentError);
      expect(
        () => MercatorProjection.fit(
            [const MapFeature(id: 'a', name: 'a', rings: [])]),
        throwsArgumentError,
      );
    });
  });

  group('ViewBoxFit', () {
    test('scales to fit and centres, like preserveAspectRatio="xMidYMid meet"',
        () {
      // Twice as wide as the view box needs: height is the limit, width centres.
      final fit = ViewBoxFit.of(const Size(1920, 640));
      expect(fit.scale, closeTo(1, 0.0001));
      expect(fit.dx, closeTo(480, 0.0001));
      expect(fit.dy, closeTo(0, 0.0001));
    });

    test('toViewBox is the exact inverse of what the painter applies', () {
      final fit = ViewBoxFit.of(const Size(480, 320));
      const viewBoxPoint = Offset(300, 200);
      final local = Offset(viewBoxPoint.dx * fit.scale + fit.dx,
          viewBoxPoint.dy * fit.scale + fit.dy);
      final round = fit.toViewBox(local);
      expect(round.dx, closeTo(viewBoxPoint.dx, 0.0001));
      expect(round.dy, closeTo(viewBoxPoint.dy, 0.0001));
    });
  });
  group('enlargeSmallParts', () {
    List<Offset> square(double x, double y, double size) => [
          Offset(x, y),
          Offset(x + size, y),
          Offset(x + size, y + size),
          Offset(x, y + size),
          Offset(x, y),
        ];

    test('gives every part of a wholly small feature a visible minimum extent',
        () {
      final rings = enlargeSmallParts([square(0, 0, 4), square(50, 0, 1)], 8);
      final big = boundsOfRing(rings[0]).width;
      final small = boundsOfRing(rings[1]).width;
      expect(big, closeTo(8, 0.0001));
      expect(small, closeTo(8, 0.0001));
    });

    test('grows a part that is too small, about its own centre', () {
      final ring = enlargeSmallParts([square(10, 10, 2)], 8).single;
      final bounds = boundsOfRing(ring);
      expect(bounds.width, closeTo(8, 0.0001));
      expect(bounds.height, closeTo(8, 0.0001));
      // Centred where it was, so the island stays in the right place.
      expect(bounds.center.dx, closeTo(11, 0.0001));
      expect(bounds.center.dy, closeTo(11, 0.0001));
    });

    test('leaves parts that are already big enough untouched', () {
      final original = square(0, 0, 50);
      expect(enlargeSmallParts([original], 8).single, original);
    });

    test('is a no-op when disabled', () {
      final original = square(0, 0, 1);
      expect(enlargeSmallParts([original], 0).single, original);
    });

    test('caps growth, so a speck never reads as a real landmass', () {
      final ring = enlargeSmallParts([square(0, 0, 1)], 800).single;
      expect(boundsOfRing(ring).width, closeTo(8, 0.0001));
    });

    test('leaves a big region' 's small parts alone', () {
      // West Bengal: a large mainland plus fourteen delta islets. Enlarging those
      // islets individually blew them into an overlapping mess across the river
      // mouth, so a feature is either small as a whole or it is left untouched.
      final mainland = square(0, 0, 100);
      final islet = square(200, 0, 1);
      final rings = enlargeSmallParts([mainland, islet], 14);
      expect(rings[0], mainland);
      expect(rings[1], islet);
    });

    test('keeps each part' 's shape, scaling both axes by the same factor', () {
      final sliver = [
        const Offset(0, 0),
        const Offset(4, 0),
        const Offset(4, 1),
        const Offset(0, 1),
        const Offset(0, 0),
      ];
      final bounds = boundsOfRing(enlargeSmallParts([sliver], 8).single);
      expect(
          bounds.width / bounds.height, closeTo(4, 0.0001)); // aspect preserved
      expect(bounds.width, closeTo(8, 0.0001));
    });

    test('scales each part independently, keeping them apart', () {
      final rings = enlargeSmallParts([square(0, 0, 1), square(100, 0, 1)], 6);
      expect(boundsOfRing(rings[0]).center.dx, closeTo(.5, 0.0001));
      expect(boundsOfRing(rings[1]).center.dx, closeTo(100.5, 0.0001));
    });
  });

  group('keepsTrueGeometry', () {
    test('holds back Puducherry, whose enclaves have no room to grow into', () {
      expect(keepsTrueGeometry('in-cs-34-puducherry'), isTrue);
    });

    test('lets Lakshadweep grow, because its islands grow into open sea', () {
      expect(keepsTrueGeometry('in-cs-31-lakshadweep'), isFalse);
      expect(keepsTrueGeometry('in-cs-30-goa'), isFalse);
    });

    test('matches host ids in whatever case and scheme they arrive in', () {
      expect(keepsTrueGeometry('Puducherry'), isTrue);
      expect(keepsTrueGeometry('34-PUDUCHERRY'), isTrue);
    });
  });

  group('scatteredHitArea', () {
    List<Offset> square(double x, double y, double size) => [
          Offset(x, y),
          Offset(x + size, y),
          Offset(x + size, y + size),
          Offset(x, y + size),
          Offset(x, y),
        ];

    test('wraps scattered points, dropping the ones inside', () {
      final hull = convexHull([
        const Offset(0, 0),
        const Offset(10, 0),
        const Offset(10, 10),
        const Offset(0, 10),
        const Offset(5, 5),
        const Offset(3, 7),
      ]);
      expect(hull, hasLength(4));
      expect(boundsOfRing(hull), const Rect.fromLTRB(0, 0, 10, 10));
    });

    test('spans the water an island group encloses', () {
      // Lakshadweep in miniature: specks spread across a tall box.
      final hull = scatteredHitArea(
          [square(0, 0, 1), square(8, 20, 1), square(2, 40, 1)], 22)!;
      expect(boundsOfRing(hull), const Rect.fromLTRB(0, 0, 9, 41));
    });

    test('leaves a single-part region alone — its own outline is the target',
        () {
      expect(scatteredHitArea([square(0, 0, 4)], 22), isNull);
    });

    test('leaves a region that is already easy to aim at', () {
      expect(
          scatteredHitArea([square(0, 0, 30), square(0, 60, 30)], 22), isNull);
    });
  });
}
