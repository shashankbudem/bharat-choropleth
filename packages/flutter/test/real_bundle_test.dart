import 'dart:convert';
import 'dart:io';

import 'package:bharat_choropleth/bharat_choropleth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';

/// Decoding hand-written fixtures proves the algorithm; decoding the real
/// prepared bundle proves it against the data people will actually pass in —
/// quantized, 36 features, multi-part island territories and all.
File get statesFile => File('../../data/generated/current-2019-states/states.topo.json');
File get goaDistrictsFile =>
    File('../../data/generated/current-2019-districts/districts/in-cs-30-goa.topo.json');

Map<String, Object?> readTopology(File file) =>
    jsonDecode(file.readAsStringSync()) as Map<String, Object?>;

void main() {
  group('the prepared current-2019 state bundle', () {
    late List<MapFeature> features;

    setUpAll(() {
      features = decodeTopoJson(readTopology(statesFile), objectName: 'states');
    });

    test('decodes all 36 states and union territories', () {
      expect(features, hasLength(36));
    });

    test('carries the LGD-derived ids and display names the web packages use', () {
      final byId = {for (final f in features) f.id: f};
      expect(byId['in-cs-30-goa']?.name, 'Goa');
      expect(byId['in-cs-27-maharashtra']?.name, 'Maharashtra');
      // The ampersand name that trips up naive slugging on the web side.
      expect(byId['in-cs-01-jammu-and-kashmir']?.name, 'Jammu & Kashmir');
    });

    test('gives every feature closed rings — no region renders as nothing', () {
      // Lakshadweep used to be 'arcs: []' here: simplification collapsed all 35 of
      // its islands and the UT shipped with no geometry at all. The data prep now
      // falls back rather than erasing a feature, and validate-current-states.mjs
      // fails the build if one ever does again.
      expect(features.where((f) => f.rings.isEmpty), isEmpty);

      for (final feature in features) {
        for (final ring in feature.rings) {
          expect(ring.length, greaterThanOrEqualTo(3), reason: '${feature.id} has a degenerate ring');
        }
      }
    });

    test('decodes island territories as multiple rings', () {
      final islands = features.firstWhere((f) => f.id == 'in-cs-35-andaman-and-nicobar');
      expect(islands.rings.length, greaterThan(1));
    });

    test('produces coordinates inside India\'s real lon/lat extent', () {
      // A delta-decoding or transform bug would throw these far off the map.
      for (final feature in features) {
        for (final ring in feature.rings) {
          for (final point in ring) {
            expect(point.dx, inInclusiveRange(67, 98), reason: '${feature.id} longitude out of range');
            expect(point.dy, inInclusiveRange(6, 38), reason: '${feature.id} latitude out of range');
          }
        }
      }
    });

    test('projects entirely inside the view box', () {
      final projection = MercatorProjection.fit(features);
      for (final feature in features) {
        for (final ring in feature.rings) {
          for (final point in ring) {
            final projected = projection.project(point);
            expect(projected.dx, inInclusiveRange(kViewBoxPadding - 1, kViewBox.width - kViewBoxPadding + 1));
            expect(projected.dy, inInclusiveRange(kViewBoxPadding - 1, kViewBox.height - kViewBoxPadding + 1));
          }
        }
      }
    });

    test('places Kashmir north of Kanyakumari and Gujarat west of Assam', () {
      // Cheap orientation check: a flipped axis would sail past every bounds
      // assertion above while drawing the country upside down.
      final projection = MercatorProjection.fit(features);
      double centroidY(String id) {
        final rings = features.firstWhere((f) => f.id == id).rings;
        final points = rings.expand((r) => r).map(projection.project);
        return points.map((p) => p.dy).reduce((a, b) => a + b) / points.length;
      }

      double centroidX(String id) {
        final rings = features.firstWhere((f) => f.id == id).rings;
        final points = rings.expand((r) => r).map(projection.project);
        return points.map((p) => p.dx).reduce((a, b) => a + b) / points.length;
      }

      expect(centroidY('in-cs-01-jammu-and-kashmir'), lessThan(centroidY('in-cs-32-kerala')));
      expect(centroidX('in-cs-24-gujarat'), lessThan(centroidX('in-cs-18-assam')));
    });

    testWidgets('renders and exposes one semantics node per state', (tester) async {
      final handle = tester.ensureSemantics();
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: IndiaChoropleth(
            features: features,
            values: const {'in-cs-30-goa': 6, 'Gujarat': 7, 'in-cs-27-maharashtra': 41},
            selectedId: 'in-cs-27-maharashtra',
          ),
        ),
      ));

      expect(tester.takeException(), isNull);

      final labels = <String>[];
      void visit(SemanticsNode node) {
        if (node.label.isNotEmpty) labels.add(node.label);
        node.visitChildren((child) {
          visit(child);
          return true;
        });
      }

      visit(tester.getSemantics(find.descendant(of: find.byKey(kChoroplethSurfaceKey), matching: find.byType(CustomPaint))));
      expect(labels, contains('Goa, 6. Activate to select.'));
      expect(labels, contains('Gujarat, 7. Activate to select.')); // matched by display name
      expect(labels, contains('Maharashtra, 41. Activate to select.'));
      // 36 states, 3 of them with values.
      expect(labels.where((l) => l.contains(', No data.')), hasLength(33));
      expect(labels, contains('Lakshadweep, No data. Activate to select.'));
      handle.dispose();
    });

    testWidgets('taps in the sea near Goa, Lakshadweep and Andaman & Nicobar select them', (tester) async {
      // These three are the hard ones to hit: Goa is a few view-box units wide,
      // the other two are island groups whose parts are a fraction of a pixel.
      final tapped = <String>[];
      await tester.binding.setSurfaceSize(kViewBox);
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: IndiaChoropleth(features: features, onRegionTap: (r) => tapped.add(r.id)),
        ),
      ));

      final finder = find.byKey(kChoroplethSurfaceKey);
      final fit = ViewBoxFit.of(tester.getSize(finder));
      final origin = tester.getTopLeft(finder);
      final projection = MercatorProjection.fit(features);

      Future<void> tapNear(String id, Offset nudge) async {
        // Probe beside the region's *largest part*, not the middle of its overall
        // bounds: Andaman & Nicobar is a north-south chain, and the centre of the
        // box that contains it is open sea far from any island.
        final region = features.firstWhere((f) => f.id == id);
        final parts = region.rings.map((ring) => ring.map(projection.project).toList()).toList()
          ..sort((a, b) => boundsOfRing(b).longestSide.compareTo(boundsOfRing(a).longestSide));
        final part = boundsOfRing(parts.first);
        final edge = Offset(nudge.dx < 0 ? part.left : part.right, part.center.dy);
        final target = edge + nudge;
        await tester.tapAt(origin + Offset(target.dx * fit.scale + fit.dx, target.dy * fit.scale + fit.dy));
        await tester.pump();
      }

      // Goa: 8 units into the Arabian Sea, west of its coastline.
      await tapNear('in-cs-30-goa', const Offset(-8, 0));
      // Lakshadweep and Andaman & Nicobar: just outside their island groups.
      await tapNear('in-cs-31-lakshadweep', const Offset(-8, 0));
      await tapNear('in-cs-35-andaman-and-nicobar', const Offset(8, 0));
      // Puducherry: east into the Bay of Bengal, off its coastal enclave.
      await tapNear('in-cs-34-puducherry', const Offset(8, 0));

      expect(tapped, [
        'in-cs-30-goa',
        'in-cs-31-lakshadweep',
        'in-cs-35-andaman-and-nicobar',
        'in-cs-34-puducherry',
      ]);
    });

    testWidgets('a tap on the water inside Lakshadweep selects Lakshadweep', (tester) async {
      // The islands are specks in open sea. What the group reads as on the map is
      // the whole area its outer islands enclose, so a tap well inside that — far
      // past the tap buffer around any single island — has to land on the UT.
      final tapped = <String>[];
      var background = 0;
      await tester.binding.setSurfaceSize(kViewBox);
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: IndiaChoropleth(
            features: features,
            onRegionTap: (r) => tapped.add(r.id),
            onBackgroundTap: () => background++,
          ),
        ),
      ));

      final finder = find.byKey(kChoroplethSurfaceKey);
      final fit = ViewBoxFit.of(tester.getSize(finder));
      final origin = tester.getTopLeft(finder);
      final projection = MercatorProjection.fit(features);
      final laksh = features.firstWhere((f) => f.id == 'in-cs-31-lakshadweep');
      final rings = [for (final ring in laksh.rings) ring.map(projection.project).toList()];
      final parts = rings.map(boundsOfRing).toList();
      final hull = scatteredHitArea(rings, 22)!;
      final hullPath = Path()..moveTo(hull.first.dx, hull.first.dy);
      for (final point in hull.skip(1)) {
        hullPath.lineTo(point.dx, point.dy);
      }
      hullPath.close();
      final box = boundsOfRing(hull);

      // Deepest water inside the hull: the point furthest from every island.
      Offset? deepest;
      var furthest = 0.0;
      for (var x = box.left; x <= box.right; x += 0.5) {
        for (var y = box.top; y <= box.bottom; y += 0.5) {
          final candidate = Offset(x, y);
          if (!hullPath.contains(candidate)) continue;
          var nearest = double.infinity;
          for (final part in parts) {
            final dx = (part.left - x).clamp(0.0, double.infinity) + (x - part.right).clamp(0.0, double.infinity);
            final dy = (part.top - y).clamp(0.0, double.infinity) + (y - part.bottom).clamp(0.0, double.infinity);
            final d = Offset(dx, dy).distance;
            if (d < nearest) nearest = d;
          }
          if (nearest > furthest) {
            furthest = nearest;
            deepest = candidate;
          }
        }
      }
      // Past the 14-unit buffer, so only the hull can account for the hit.
      expect(furthest, greaterThan(14), reason: 'expected water inside Lakshadweep beyond the tap buffer');

      await tester.tapAt(origin + Offset(deepest!.dx * fit.scale + fit.dx, deepest.dy * fit.scale + fit.dy));
      await tester.pump();
      expect(tapped, ['in-cs-31-lakshadweep']);
      expect(background, 0);
    });

    testWidgets('keeps Puducherry true to size while Lakshadweep is exaggerated', (tester) async {
      // Puducherry is enclaves inside Tamil Nadu: grown to the visibility
      // threshold they land several units inside the state around them.
      final projection = MercatorProjection.fit(features);
      Offset largestPartCentre(String id) {
        final region = features.firstWhere((f) => f.id == id);
        final parts = [for (final ring in region.rings) boundsOfRing(ring.map(projection.project).toList())]
          ..sort((a, b) => b.longestSide.compareTo(a.longestSide));
        return parts.first.center;
      }

      Future<Map<String, Rect>> boundsAt(double minPartExtent) async {
        final found = <String, Rect>{};
        await tester.binding.setSurfaceSize(kViewBox);
        await tester.pumpWidget(MaterialApp(
          home: Scaffold(
            body: IndiaChoropleth(
              features: features,
              minPartExtent: minPartExtent,
              onRegionTap: (r) => found[r.id] = r.bounds,
            ),
          ),
        ));
        final finder = find.byKey(kChoroplethSurfaceKey);
        final fit = ViewBoxFit.of(tester.getSize(finder));
        final origin = tester.getTopLeft(finder);
        for (final id in ['in-cs-34-puducherry', 'in-cs-31-lakshadweep']) {
          final centre = largestPartCentre(id);
          await tester.tapAt(origin + Offset(centre.dx * fit.scale + fit.dx, centre.dy * fit.scale + fit.dy));
          await tester.pump();
        }
        return found;
      }

      addTearDown(() => tester.binding.setSurfaceSize(null));
      final trueSize = await boundsAt(0);
      final exaggerated = await boundsAt(14);

      expect(exaggerated['in-cs-34-puducherry']!.width,
          closeTo(trueSize['in-cs-34-puducherry']!.width, 0.0001));
      expect(exaggerated['in-cs-31-lakshadweep']!.width,
          greaterThan(trueSize['in-cs-31-lakshadweep']!.width));
    });

    testWidgets('the buffer never takes a tap that landed on a neighbour', (tester) async {
      final tapped = <String>[];
      await tester.binding.setSurfaceSize(kViewBox);
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: IndiaChoropleth(features: features, onRegionTap: (r) => tapped.add(r.id)),
        ),
      ));

      // Karnataka wraps Goa on its landward side. A tap there must stay Karnataka,
      // which is why the buffer only runs after every polygon has missed.
      final finder = find.byKey(kChoroplethSurfaceKey);
      final fit = ViewBoxFit.of(tester.getSize(finder));
      final projection = MercatorProjection.fit(features);
      final karnataka = features.firstWhere((f) => f.id == 'in-cs-29-karnataka');
      final goa = features.firstWhere((f) => f.id == 'in-cs-30-goa');
      final goaPoints = goa.rings.expand((r) => r).map(projection.project);
      final goaY = goaPoints.map((p) => p.dy).reduce((a, b) => a + b) / goaPoints.length;
      final goaRight = goaPoints.map((p) => p.dx).reduce((a, b) => a > b ? a : b);

      // Walk east from Goa's inland edge until inside Karnataka.
      final path = Path()..fillType = PathFillType.evenOdd;
      for (final ring in karnataka.rings) {
        final projected = ring.map(projection.project).toList();
        path.moveTo(projected.first.dx, projected.first.dy);
        for (final p in projected.skip(1)) {
          path.lineTo(p.dx, p.dy);
        }
        path.close();
      }
      Offset? inland;
      for (var dx = 2.0; dx < 60; dx += 1) {
        final candidate = Offset(goaRight + dx, goaY);
        if (path.contains(candidate)) {
          inland = candidate;
          break;
        }
      }
      expect(inland, isNotNull, reason: 'expected to find a point inside Karnataka east of Goa');

      await tester.tapAt(tester.getTopLeft(finder) +
          Offset(inland!.dx * fit.scale + fit.dx, inland.dy * fit.scale + fit.dy));
      await tester.pump();
      expect(tapped, ['in-cs-29-karnataka']);
    });

    testWidgets('a tap far from every region is reported as a background tap', (tester) async {
      final tapped = <String>[];
      var background = 0;
      await tester.binding.setSurfaceSize(kViewBox);
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: IndiaChoropleth(
            features: features,
            onRegionTap: (r) => tapped.add(r.id),
            onBackgroundTap: () => background++,
          ),
        ),
      ));

      // The top-left corner of the view box is empty ocean well away from land.
      final finder = find.byKey(kChoroplethSurfaceKey);
      final fit = ViewBoxFit.of(tester.getSize(finder));
      await tester.tapAt(tester.getTopLeft(finder) + Offset(4 * fit.scale + fit.dx, 4 * fit.scale + fit.dy));
      await tester.pump();

      expect(background, 1);
      expect(tapped, isEmpty);
    });
  });

  group('the prepared district bundle', () {
    test('decodes a state\'s districts from its own file', () {
      final districts = decodeTopoJson(readTopology(goaDistrictsFile), objectName: 'districts');
      expect(districts, hasLength(2));
      expect(districts.map((d) => d.name), containsAll(['North Goa', 'South Goa']));
    });
  });
}
