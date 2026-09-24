import 'dart:async';

import 'package:bharat_choropleth/bharat_choropleth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

MapFeature box(String id, String name, double west, double east) => MapFeature(
      id: id,
      name: name,
      rings: [
        [Offset(west, 0), Offset(east, 0), Offset(east, 10), Offset(west, 10), Offset(west, 0)],
      ],
    );

final states = [box('a', 'Alpha', 0, 10), box('b', 'Bravo', 20, 30)];
final districtsOf = {
  'a': [box('a1', 'Alpha One', 0, 5), box('a2', 'Alpha Two', 5, 10)],
  'b': [box('b1', 'Bravo One', 20, 25), box('b2', 'Bravo Two', 25, 30)],
};
final subDistricts = [box('s1', 'Sierra', 0, 2), box('s2', 'Tango', 2, 5)];

Widget map({String? drillDownId, String? subDistrictDrillDownId, List<String>? districtCalls, List<String>? subCalls}) =>
    MaterialApp(
      home: Scaffold(
        body: SizedBox(
          width: 800,
          height: 600,
          child: IndiaChoropleth(
            features: states,
            values: const {'a': 1.0, 'b': 2.0},
            drillDownId: drillDownId,
            subDistrictDrillDownId: subDistrictDrillDownId,
            loadDistricts: (stateId, state) async {
              districtCalls?.add(stateId);
              return ChoroplethLayer(features: districtsOf[stateId]!);
            },
            loadSubDistricts: (districtId, district, stateId) async {
              subCalls?.add(districtId);
              return ChoroplethLayer(features: subDistricts);
            },
          ),
        ),
      ),
    );

/// The breadcrumb's current page, which names the level on screen.
String? currentCrumb(WidgetTester tester) {
  final labels = tester.widgetList<Text>(find.byType(Text)).map((text) => text.data).toSet();
  for (final name in ['Sierra', 'Alpha One', 'Alpha', 'Bravo']) {
    if (labels.contains(name)) return name;
  }
  return null;
}

void main() {
  testWidgets('a map built already drilled into a state loads its districts', (tester) async {
    final calls = <String>[];
    final gate = Completer<void>();
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SizedBox(
          width: 800,
          height: 600,
          child: IndiaChoropleth(
            features: states,
            values: const {'a': 1.0},
            drillDownId: 'a',
            loadDistricts: (stateId, state) async {
              calls.add(stateId);
              await gate.future;
              return ChoroplethLayer(features: districtsOf[stateId]!, values: const {'a1': 7.0});
            },
          ),
        ),
      ),
    ));
    await tester.pump();
    expect(find.text('Loading districts…'), findsOneWidget);
    expect(find.textContaining('unavailable'), findsNothing);

    gate.complete();
    await tester.pumpAndSettle();
    expect(calls, ['a']);
    expect(find.textContaining('unavailable'), findsNothing);
    expect(find.text('Loading districts…'), findsNothing);
  });

  testWidgets('a map built with a state and a district opens the sub-districts', (tester) async {
    final subCalls = <String>[];
    await tester.pumpWidget(map(drillDownId: 'a', subDistrictDrillDownId: 'a1', subCalls: subCalls));
    await tester.pumpAndSettle();
    expect(subCalls, ['a1']);
    expect(find.text('Alpha One'), findsOneWidget); // the district is the current page
    expect(find.widgetWithText(TextButton, 'Alpha'), findsOneWidget); // the state is a link back
  });

  testWidgets('a deep link that sets both ids at once opens the sub-districts', (tester) async {
    final subCalls = <String>[];
    await tester.pumpWidget(map(subCalls: subCalls));
    await tester.pumpAndSettle();
    await tester.pumpWidget(map(drillDownId: 'a', subDistrictDrillDownId: 'a1', subCalls: subCalls));
    await tester.pumpAndSettle();
    expect(subCalls, ['a1']);
    expect(find.widgetWithText(TextButton, 'Alpha'), findsOneWidget);
  });

  testWidgets('a controlled drillDownId set back to null returns to the national map', (tester) async {
    // Tapped while uncontrolled, so the widget holds 'a' itself...
    await tester.pumpWidget(map());
    await tester.pumpAndSettle();
    final fit = ViewBoxFit.of(tester.getSize(find.byKey(kChoroplethSurfaceKey)));
    final origin = tester.getTopLeft(find.byKey(kChoroplethSurfaceKey));
    final centre = MercatorProjection.fit(states).project(const Offset(5, 5));
    await tester.tapAt(origin + Offset(centre.dx * fit.scale + fit.dx, centre.dy * fit.scale + fit.dy));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextButton, 'All states'), findsOneWidget);

    // ...then the host takes over, and later sends it back to the national map.
    await tester.pumpWidget(map(drillDownId: 'b'));
    await tester.pumpAndSettle();
    expect(find.text('Bravo'), findsOneWidget);
    await tester.pumpWidget(map());
    await tester.pumpAndSettle();
    expect(find.widgetWithText(TextButton, 'All states'), findsNothing);
    expect(find.text('All states'), findsOneWidget);
  });

  testWidgets('changing the controlled state drops a sub-district of the old one', (tester) async {
    final subCalls = <String>[];
    await tester.pumpWidget(map(drillDownId: 'a', subDistrictDrillDownId: 'a1', subCalls: subCalls));
    await tester.pumpAndSettle();
    await tester.pumpWidget(map(drillDownId: 'b', subDistrictDrillDownId: 'a1', subCalls: subCalls));
    await tester.pumpAndSettle();
    // 'a1' is not a district of Bravo, so the level below does not open.
    expect(subCalls, ['a1']);
    expect(find.text('Bravo'), findsOneWidget);
    expect(find.textContaining('unavailable'), findsNothing);
  });
}
