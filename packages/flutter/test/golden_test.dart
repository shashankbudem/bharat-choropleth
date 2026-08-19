import 'dart:convert';
import 'dart:io';

import 'package:bharat_choropleth/bharat_choropleth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Renders the real bundle to an image. Every other test asserts numbers about
/// the geometry; this one is the check that the numbers add up to a map that
/// actually looks like India — a flipped axis or a stitching bug survives the
/// bounds assertions but is obvious the moment it is painted.
void main() {
  testWidgets('paints the current-2019 states', (tester) async {
    final raw = File('../../data/generated/current-2019-states/states.topo.json').readAsStringSync();
    final features = decodeTopoJson(jsonDecode(raw) as Map<String, Object?>, objectName: 'states');

    await tester.binding.setSurfaceSize(const Size(960, 640));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        backgroundColor: const Color(0xFFFFFFFF),
        body: RepaintBoundary(
          child: IndiaChoropleth(
            features: features,
            values: const {
              'in-cs-27-maharashtra': 41,
              'in-cs-09-uttar-pradesh': 25,
              'in-cs-33-tamil-nadu': 18,
              'in-cs-29-karnataka': 15,
              'in-cs-24-gujarat': 7,
              'in-cs-30-goa': 6,
              'in-cs-01-jammu-and-kashmir': 2,
            },
            selectedId: 'in-cs-27-maharashtra',
            showRegionValues: true,
          ),
        ),
      ),
    ));
    await tester.pumpAndSettle();

    await expectLater(
      find.byType(RepaintBoundary).first,
      matchesGoldenFile('goldens/states.png'),
    );
  });
}
