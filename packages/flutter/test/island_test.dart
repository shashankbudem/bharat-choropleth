import 'dart:ui' as ui;

import 'package:bharat_choropleth/bharat_choropleth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

// A mainland and a chain of thin islands off its coast, like the Bay of Bengal.
MapFeature islands(String id, String name) => MapFeature(id: id, name: name, rings: const [
      [Offset(92.5, 13), Offset(92.6, 13), Offset(92.6, 13.6), Offset(92.5, 13.6), Offset(92.5, 13)],
      [Offset(92.6, 12.2), Offset(92.7, 12.2), Offset(92.7, 12.7), Offset(92.6, 12.7), Offset(92.6, 12.2)],
      [Offset(93.8, 7), Offset(93.9, 7), Offset(93.9, 7.2), Offset(93.8, 7.2), Offset(93.8, 7)],
    ]);
const mainland = MapFeature(id: 'main', name: 'Mainland', rings: [
  [Offset(72, 8), Offset(90, 8), Offset(90, 30), Offset(72, 30), Offset(72, 8)],
]);

Future<List<ChoroplethRegion>> regionsOf(WidgetTester tester, IndiaChoropleth map) async {
  await tester.pumpWidget(MaterialApp(home: Scaffold(body: SizedBox(width: 960, height: 640, child: map))));
  await tester.pumpAndSettle();
  final paint = tester.widget<CustomPaint>(
    find.descendant(of: find.byKey(kChoroplethSurfaceKey), matching: find.byType(CustomPaint)).first,
  );
  return ((paint.painter! as dynamic).regions as List).cast<ChoroplethRegion>();
}

ChoroplethRegion named(List<ChoroplethRegion> regions, String name) => regions.firstWhere((region) => region.label == name);

void main() {
  testWidgets('draws Andaman & Nicobar larger, with the island coastline, on the national map', (tester) async {
    final plain = named(await regionsOf(tester, IndiaChoropleth(features: [mainland, islands('isl', 'Islands')])), 'Islands');
    final regions = await regionsOf(
      tester,
      IndiaChoropleth(features: [mainland, islands('in-cs-35-andaman-and-nicobar', 'Andaman & Nicobar')]),
    );
    final group = named(regions, 'Andaman & Nicobar');
    expect(group.island, isTrue);
    expect(group.bounds.height, greaterThan(plain.bounds.height));
    expect(named(regions, 'Mainland').island, isFalse);
  });

  testWidgets('leaves the districts of a drilled-in island UT at their true size', (tester) async {
    final plain = named(await regionsOf(tester, IndiaChoropleth(features: [islands('d', 'Plain')])), 'Plain');
    final regions = await regionsOf(
      tester,
      IndiaChoropleth(
        features: [mainland, islands('in-cs-35-andaman-and-nicobar', 'Andaman & Nicobar')],
        drillDownId: 'in-cs-35-andaman-and-nicobar',
        loadDistricts: (stateId, state) async => ChoroplethLayer(features: [islands('in-cd-35-603', 'South Andaman')]),
      ),
    );
    final drilled = named(regions, 'South Andaman');
    expect(drilled.island, isFalse);
    expect(drilled.bounds.height, closeTo(plain.bounds.height, 1e-6));
  });

  // Hosts theme the border (the Grafana panel's border option, for one). An
  // island colour of its own would outline the islands in something the host
  // never chose, so the coastline is the configured border, only thinner.
  testWidgets('outlines island groups in the configured border colour', (tester) async {
    const red = Color(0xFFFF0000);
    const surfaceKey = ValueKey('surface');
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        backgroundColor: const Color(0xFFFFFFFF),
        body: RepaintBoundary(
          key: surfaceKey,
          child: SizedBox(
            width: 960,
            height: 640,
            child: IndiaChoropleth(
              features: [mainland, islands('in-cs-35-andaman-and-nicobar', 'Andaman & Nicobar')],
              borderColor: red,
              showLegend: false,
            ),
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    final paint = tester.widget<CustomPaint>(
      find.descendant(of: find.byKey(kChoroplethSurfaceKey), matching: find.byType(CustomPaint)).first,
    );
    final group = named(((paint.painter! as dynamic).regions as List).cast<ChoroplethRegion>(), 'Andaman & Nicobar');

    final boundary = tester.renderObject<RenderRepaintBoundary>(find.byKey(surfaceKey));
    final image = (await tester.runAsync(boundary.toImage))!;
    final bytes = (await tester.runAsync(() => image.toByteData(format: ui.ImageByteFormat.rawRgba)))!.buffer.asUint8List();
    final surface = find.byKey(kChoroplethSurfaceKey);
    final fit = ViewBoxFit.of(tester.getSize(surface));
    final origin = tester.getTopLeft(surface) - tester.getTopLeft(find.byKey(surfaceKey));
    final area = group.bounds.inflate(2);

    // Count strongly red pixels inside the island group's own bounds, well
    // away from the mainland's border.
    var reddish = 0;
    for (var y = area.top; y <= area.bottom; y += .5) {
      for (var x = area.left; x <= area.right; x += .5) {
        final px = (origin.dx + x * fit.scale + fit.dx).round();
        final py = (origin.dy + y * fit.scale + fit.dy).round();
        if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
        final at = (py * image.width + px) * 4;
        if (bytes[at] > 180 && bytes[at + 1] < 120 && bytes[at + 2] < 120) reddish++;
      }
    }
    image.dispose();
    expect(reddish, greaterThan(0));
  });
}
