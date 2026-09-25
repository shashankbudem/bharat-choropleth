import 'package:bharat_choropleth/bharat_choropleth.dart';
import 'package:flutter/material.dart';
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
}
