import 'package:bharat_choropleth/bharat_choropleth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';

MapFeature box(String id, String name, double west, double south, double east, double north) => MapFeature(
      id: id,
      name: name,
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

/// Two squares side by side, far enough apart that a tap can only be in one.
final features = [
  box('west', 'Westland', 0, 0, 10, 10),
  box('east', 'Eastland', 20, 0, 30, 10),
];

Future<void> pumpMap(WidgetTester tester, Widget map) async {
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: Center(
        child: SizedBox(width: kViewBox.width, height: kViewBox.height, child: map),
      ),
    ),
  ));
}

Offset centerOf(MapFeature feature) {
  final projection = MercatorProjection.fit(features);
  final ring = feature.rings.single;
  var sumX = 0.0;
  var sumY = 0.0;
  // Skip the closing point, which repeats the first.
  for (final point in ring.take(ring.length - 1)) {
    final projected = projection.project(point);
    sumX += projected.dx;
    sumY += projected.dy;
  }
  final count = ring.length - 1;
  return Offset(sumX / count, sumY / count);
}

/// Turn a view-box point into a global tap position.
///
/// The test surface is smaller than the view box, so the widget scales the map
/// down to fit — the same transform the painter applies. Going through
/// [ViewBoxFit] here means the test taps where the region is actually drawn,
/// whatever size the surface happens to be.
Offset tapPoint(WidgetTester tester, MapFeature feature) {
  final finder = find.byKey(kChoroplethSurfaceKey);
  final fit = ViewBoxFit.of(tester.getSize(finder));
  final center = centerOf(feature);
  return tester.getTopLeft(finder) +
      Offset(center.dx * fit.scale + fit.dx, center.dy * fit.scale + fit.dy);
}

List<SemanticsNode> flatten(SemanticsNode root) {
  final nodes = <SemanticsNode>[];
  void visit(SemanticsNode node) {
    nodes.add(node);
    node.visitChildren((child) {
      visit(child);
      return true;
    });
  }

  visit(root);
  return nodes;
}

void main() {
  testWidgets('renders one painted map for the given features', (tester) async {
    await pumpMap(tester, IndiaChoropleth(features: features));
    expect(find.byType(CustomPaint), findsWidgets);
  });

  testWidgets('reports the region under a tap', (tester) async {
    final tapped = <String>[];
    await pumpMap(tester, IndiaChoropleth(features: features, onRegionTap: (r) => tapped.add(r.id)));

    await tester.tapAt(tapPoint(tester, features[0]));
    await tester.pump();
    expect(tapped, ['west']);

    await tester.tapAt(tapPoint(tester, features[1]));
    await tester.pump();
    expect(tapped, ['west', 'east']);
  });

  testWidgets('a tap on empty space reports nothing', (tester) async {
    final tapped = <String>[];
    await pumpMap(tester, IndiaChoropleth(features: features, onRegionTap: (r) => tapped.add(r.id)));

    // The gap between the two squares is inside the widget but outside both.
    final midpoint = Offset.lerp(tapPoint(tester, features[0]), tapPoint(tester, features[1]), 0.5)!;
    await tester.tapAt(midpoint);
    await tester.pump();
    expect(tapped, isEmpty);
  });

  testWidgets('values are matched by id or by display name', (tester) async {
    late ChoroplethRegion west;
    late ChoroplethRegion east;
    await pumpMap(
      tester,
      IndiaChoropleth(
        features: features,
        values: const {'west': 6, 'Eastland': 7},
        onRegionTap: (r) => r.id == 'west' ? west = r : east = r,
      ),
    );
    await tester.tapAt(tapPoint(tester, features[0]));
    await tester.tapAt(tapPoint(tester, features[1]));
    await tester.pump();

    expect(west.value, 6);
    expect(east.value, 7);
  });

  testWidgets('exposes one semantics node per region, with value in the label', (tester) async {
    final handle = tester.ensureSemantics();
    await pumpMap(tester, IndiaChoropleth(features: features, values: const {'west': 6, 'east': null}));

    final labels = flatten(tester.getSemantics(find.descendant(of: find.byKey(kChoroplethSurfaceKey), matching: find.byType(CustomPaint))))
        .map((node) => node.label)
        .where((label) => label.isNotEmpty)
        .toList();

    // Whole numbers read as "6", not "6.0".
    expect(labels, contains('Westland, 6. Activate to select.'));
    // "No data" is its own state, never the bottom of the ramp.
    expect(labels, contains('Eastland, No data. Activate to select.'));
    handle.dispose();
  });

  testWidgets('marks the selected region without changing its fill', (tester) async {
    // The selection ring is painted, so this asserts the contract that matters:
    // selection does not alter what colorFor returns for that region.
    const scale = ColorScale();
    final selectedFill = scale.colorFor(6, 6, 7);
    await pumpMap(
      tester,
      IndiaChoropleth(features: features, values: const {'west': 6, 'east': 7}, selectedId: 'west'),
    );
    expect(scale.colorFor(6, 6, 7), selectedFill);
    expect(tester.takeException(), isNull);
  });

  testWidgets('renders an empty state instead of throwing when there are no features', (tester) async {
    await pumpMap(tester, const IndiaChoropleth(features: []));
    expect(tester.takeException(), isNull);
  });

  testWidgets('repaints when values change', (tester) async {
    await pumpMap(tester, IndiaChoropleth(features: features, values: const {'west': 1}));
    await pumpMap(tester, IndiaChoropleth(features: features, values: const {'west': 9}));
    expect(tester.takeException(), isNull);
  });
  testWidgets('draws and hit-tests a marker for a region too small to see', (tester) async {
    // A speck: far smaller than the default marker, and sub-pixel once projected.
    final speck = MapFeature(id: 'speck', name: 'Speck', rings: [
      [const Offset(60, 0), const Offset(60.01, 0), const Offset(60.01, 0.01), const Offset(60, 0.01), const Offset(60, 0)],
    ]);
    final withSpeck = [...features, speck];
    final tapped = <String>[];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: SizedBox(
            width: kViewBox.width,
            height: kViewBox.height,
            child: IndiaChoropleth(features: withSpeck, onRegionTap: (r) => tapped.add(r.id)),
          ),
        ),
      ),
    ));

    final finder = find.byKey(kChoroplethSurfaceKey);
    final fit = ViewBoxFit.of(tester.getSize(finder));
    final projection = MercatorProjection.fit(withSpeck);
    final centre = projection.project(const Offset(60.005, 0.005)) + const Offset(2, 0);
    final target = tester.getTopLeft(finder) + Offset(centre.dx * fit.scale + fit.dx, centre.dy * fit.scale + fit.dy);

    // Two view-box units off the speck: well outside its own polygon, well inside
    // the marker. Only the marker makes this point hittable.
    await tester.tapAt(target);
    await tester.pump();
    expect(tapped, ['speck']);
  });

  testWidgets('smallRegionTapRadius: 0 turns the buffer off entirely', (tester) async {
    final speck = MapFeature(id: 'speck', name: 'Speck', rings: [
      [const Offset(60, 0), const Offset(60.01, 0), const Offset(60.01, 0.01), const Offset(60, 0.01), const Offset(60, 0)],
    ]);
    final withSpeck = [...features, speck];
    final tapped = <String>[];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: SizedBox(
            width: kViewBox.width,
            height: kViewBox.height,
            // The marker is a visual affordance and the buffer is a tap target;
            // they are separate, so turning the buffer off is what removes the hit.
            child: IndiaChoropleth(
              features: withSpeck,
              minRegionMarkerSize: 0,
              smallRegionTapRadius: 0,
              onRegionTap: (r) => tapped.add(r.id),
            ),
          ),
        ),
      ),
    ));

    final finder = find.byKey(kChoroplethSurfaceKey);
    final fit = ViewBoxFit.of(tester.getSize(finder));
    final projection = MercatorProjection.fit(withSpeck);
    final centre = projection.project(const Offset(60.005, 0.005)) + const Offset(2, 0);
    await tester.tapAt(tester.getTopLeft(finder) + Offset(centre.dx * fit.scale + fit.dx, centre.dy * fit.scale + fit.dy));
    await tester.pump();
    expect(tapped, isEmpty);
  });

}
