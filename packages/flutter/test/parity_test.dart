import 'dart:async';
import 'dart:ui' as ui;

import 'package:bharat_choropleth/bharat_choropleth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

/// The features the web packages' own parity tests use, so a behaviour that
/// differs between Flutter and the browser shows up here rather than in someone's
/// app. Three regions across a three-colour ramp, one per band, so "the regions
/// painted in this colour" is an unambiguous set to check a filter against.
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

final rampFeatures = [
  box('low', 'Low', 0, 0, 10, 10),
  box('mid', 'Mid', 20, 0, 30, 10),
  box('high', 'High', 40, 0, 50, 10),
];
const rampValues = {'low': 0.0, 'mid': 5.0, 'high': 10.0};
const ramp = ColorScale(colors: [Color(0xFF111111), Color(0xFF222222), Color(0xFF333333)]);

/// Pure white behind the map, not the theme's tinted surface: the pixel checks
/// below composite the dulled fills against this, and a tinted ground would make
/// a grey come back out with a colour cast.
Future<void> pump(WidgetTester tester, Widget map) => tester.pumpWidget(MaterialApp(
      home: Scaffold(
        backgroundColor: const Color(0xFFFFFFFF),
        body: Center(child: SizedBox(width: kViewBox.width, height: kViewBox.height, child: map)),
      ),
    ));

/// The legend's swatches, in ramp order.
Finder swatches() => find.byWidgetPredicate(
      (widget) => widget is Container && widget.decoration is BoxDecoration &&
          (widget.decoration! as BoxDecoration).borderRadius == BorderRadius.circular(2),
    );

void main() {
  group('legend filter', () {
    testWidgets('leaves exactly the regions painted in the tapped swatch at full colour', (tester) async {
      // The requirement, checked against the pixels rather than against the same
      // formula the widget uses — otherwise the test is a tautology and a filter
      // that drifted from the fill would still pass. Tapping the last colour must
      // leave the region drawn in it untouched and drain every other one.
      await pump(tester, IndiaChoropleth(
        features: rampFeatures,
        values: rampValues,
        colorScale: ramp,
        showBreadcrumb: false,
      ));

      final before = await _samples(tester);
      // Every region starts painted in its own band's colour.
      expect(before['low'], ramp.colors[0]);
      expect(before['mid'], ramp.colors[1]);
      expect(before['high'], ramp.colors[2]);

      await tester.tap(swatches().at(2));
      await tester.pumpAndSettle();
      final after = await _samples(tester);

      // The band that was tapped keeps its exact fill…
      expect(after['high'], ramp.colors[2]);
      // …and the others are drained to grey: no colour left in them at all.
      for (final id in ['low', 'mid']) {
        final sample = after[id]!;
        expect(sample, isNot(before[id]), reason: '\$id should have been dulled');
        expect(sample.r, closeTo(sample.g, 0.02), reason: '\$id should be grey');
        expect(sample.g, closeTo(sample.b, 0.02), reason: '\$id should be grey');
      }
    });

    testWidgets('dulls the rest of the map, and clears when tapped again', (tester) async {
      await pump(tester, IndiaChoropleth(features: rampFeatures, values: rampValues, colorScale: ramp));
      expect(swatches(), findsNWidgets(3));

      await tester.tap(swatches().at(2));
      await tester.pump();
      // The picked swatch is ringed; the others are faded.
      final active = tester.widgetList<Container>(swatches()).toList();
      expect((active[2].decoration! as BoxDecoration).border, isNotNull);
      expect((active[0].decoration! as BoxDecoration).border, isNull);

      await tester.tap(swatches().at(2));
      await tester.pump();
      for (final swatch in tester.widgetList<Container>(swatches())) {
        expect((swatch.decoration! as BoxDecoration).border, isNull);
      }
    });

    testWidgets('leaves a swatch with nothing in it inert', (tester) async {
      // Values 0, 5 and 10 fill a three-colour ramp; a fourth colour leaves one
      // band with nothing near its stop.
      const wider = ColorScale(colors: [Color(0xFF111111), Color(0xFF222222), Color(0xFF333333), Color(0xFF444444)]);
      await pump(tester, IndiaChoropleth(features: rampFeatures, values: rampValues, colorScale: wider));

      final buckets = legendBuckets(wider.colors, rampValues.values, 0, 10);
      final empty = buckets.indexWhere((bucket) => bucket.matches == 0);
      expect(empty, isNot(-1));

      await tester.tap(swatches().at(empty));
      await tester.pump();
      for (final swatch in tester.widgetList<Container>(swatches())) {
        expect((swatch.decoration! as BoxDecoration).border, isNull, reason: 'an empty band must not filter');
      }
    });

    testWidgets('is a plain key on a map that is not interactive', (tester) async {
      await pump(tester, IndiaChoropleth(
        features: rampFeatures,
        values: rampValues,
        colorScale: ramp,
        interactive: false,
      ));
      expect(swatches(), findsNWidgets(3));
      // Nothing to tap: the swatches are not wrapped in a gesture detector.
      expect(find.ancestor(of: swatches().at(0), matching: find.byType(GestureDetector)), findsNothing);
    });
  });

  group('tooltip and insight', () {
    testWidgets('a tap shows the region, its value, share and rank', (tester) async {
      await pump(tester, IndiaChoropleth(features: rampFeatures, values: rampValues, colorScale: ramp));
      final fit = ViewBoxFit.of(tester.getSize(find.byKey(kChoroplethSurfaceKey)));
      final origin = tester.getTopLeft(find.byKey(kChoroplethSurfaceKey));
      final projection = MercatorProjection.fit(rampFeatures);
      final centre = projection.project(const Offset(45, 5)); // inside 'High'

      await tester.tapAt(origin + Offset(centre.dx * fit.scale + fit.dx, centre.dy * fit.scale + fit.dy));
      await tester.pump();

      expect(find.text('High'), findsOneWidget);
      expect(find.text('10'), findsOneWidget);
      // 10 of 15 total, best of the two ranked regions with a non-zero value.
      expect(find.textContaining('66.7% of total'), findsOneWidget);
      expect(find.textContaining('1st of 3'), findsOneWidget);
    });

    testWidgets('reports the selected region before anything is pointed at', (tester) async {
      // React drives onInsight from an effect on the derived context, so a host
      // panel is populated on mount and stays right when the selection is
      // changed from outside. Firing only on inspection would leave it blank.
      final insights = <String?>[];
      await pump(tester, IndiaChoropleth(
        features: rampFeatures,
        values: rampValues,
        colorScale: ramp,
        selectedId: 'low',
        onInsight: (insight) => insights.add(insight?.region.id),
      ));
      await tester.pump();
      expect(insights, ['low']);

      await pump(tester, IndiaChoropleth(
        features: rampFeatures,
        values: rampValues,
        colorScale: ramp,
        selectedId: 'mid',
        onInsight: (insight) => insights.add(insight?.region.id),
      ));
      expect(insights.last, 'mid');
    });

    testWidgets('survives a host that setStates from onInsight', (tester) async {
      // The whole point of onInsight is to drive a host-owned panel, which means
      // setState. Reporting the context from didUpdateWidget — where an external
      // selection change arrives — does that mid-build, and the host marks itself
      // dirty while the tree is already building.
      await tester.pumpWidget(const MaterialApp(home: Scaffold(body: _InsightHost())));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);

      final fit = ViewBoxFit.of(tester.getSize(find.byKey(kChoroplethSurfaceKey)));
      final origin = tester.getTopLeft(find.byKey(kChoroplethSurfaceKey));
      final centre = MercatorProjection.fit(rampFeatures).project(const Offset(45, 5));
      await tester.tapAt(origin + Offset(centre.dx * fit.scale + fit.dx, centre.dy * fit.scale + fit.dy));
      await tester.pumpAndSettle();

      expect(tester.takeException(), isNull);
      expect(find.text('panel: high'), findsOneWidget);
    });

    testWidgets('onInsight falls back to the selected region, onInspect does not', (tester) async {
      final inspected = <String?>[];
      final insights = <String?>[];
      await pump(tester, IndiaChoropleth(
        features: rampFeatures,
        values: rampValues,
        colorScale: ramp,
        selectedId: 'low',
        onInspect: (region, _) => inspected.add(region?.id),
        onInsight: (insight) => insights.add(insight?.region.id),
      ));

      final fit = ViewBoxFit.of(tester.getSize(find.byKey(kChoroplethSurfaceKey)));
      final origin = tester.getTopLeft(find.byKey(kChoroplethSurfaceKey));
      final projection = MercatorProjection.fit(rampFeatures);
      final sea = projection.project(const Offset(45, 5));
      await tester.tapAt(origin + Offset(sea.dx * fit.scale + fit.dx, sea.dy * fit.scale + fit.dy));
      await tester.pump();
      expect(inspected.last, 'high');
      expect(insights.last, 'high');

      // Pointing at nothing clears the inspection but leaves the panel on the
      // selected region, so a host-owned panel stays informative.
      await tester.tapAt(origin + const Offset(4, 4));
      await tester.pump();
      expect(inspected.last, isNull);
      expect(insights.last, 'low');
    });
  });

  group('drill-down', () {
    final districts = [box('d1', 'Delta', 0, 0, 5, 10), box('d2', 'Echo', 6, 0, 10, 10)];

    testWidgets('tapping a state loads its districts and the breadcrumb leads back', (tester) async {
      final drilled = <String?>[];
      // Held open deliberately: a loader that returns an already-completed future
      // resolves in the same microtask as the tap, and the loading state — which
      // is the thing being tested — would never be painted.
      final gate = Completer<ChoroplethLayer>();
      await pump(tester, IndiaChoropleth(
        features: rampFeatures,
        values: rampValues,
        colorScale: ramp,
        onDrillDownChange: (id, _) => drilled.add(id),
        loadDistricts: (stateId, state) => gate.future,
      ));

      final fit = ViewBoxFit.of(tester.getSize(find.byKey(kChoroplethSurfaceKey)));
      final origin = tester.getTopLeft(find.byKey(kChoroplethSurfaceKey));
      final projection = MercatorProjection.fit(rampFeatures);
      final centre = projection.project(const Offset(45, 5));
      await tester.tapAt(origin + Offset(centre.dx * fit.scale + fit.dx, centre.dy * fit.scale + fit.dy));
      await tester.pump();
      expect(find.text('Loading districts…'), findsOneWidget);

      gate.complete(ChoroplethLayer(features: districts, values: const {'d1': 3.0, 'd2': 4.0}));
      await tester.pumpAndSettle();
      expect(drilled, ['high']);
      expect(find.text('High'), findsOneWidget); // the breadcrumb's current page
      expect(find.text('All states'), findsOneWidget);

      await tester.tap(find.text('All states'));
      await tester.pumpAndSettle();
      expect(drilled, ['high', null]);
    });

    testWidgets('says so when a state has no districts to show', (tester) async {
      await pump(tester, IndiaChoropleth(
        features: rampFeatures,
        values: rampValues,
        colorScale: ramp,
        loadDistricts: (stateId, state) async => const ChoroplethLayer(features: []),
      ));
      final fit = ViewBoxFit.of(tester.getSize(find.byKey(kChoroplethSurfaceKey)));
      final origin = tester.getTopLeft(find.byKey(kChoroplethSurfaceKey));
      final projection = MercatorProjection.fit(rampFeatures);
      final centre = projection.project(const Offset(45, 5));
      await tester.tapAt(origin + Offset(centre.dx * fit.scale + fit.dx, centre.dy * fit.scale + fit.dy));
      await tester.pumpAndSettle();
      expect(find.text('No district data is available for this state.'), findsOneWidget);
    });

    testWidgets('a failed load reports rather than showing an empty map', (tester) async {
      await pump(tester, IndiaChoropleth(
        features: rampFeatures,
        values: rampValues,
        colorScale: ramp,
        loadDistricts: (stateId, state) async => throw StateError('nope'),
      ));
      final fit = ViewBoxFit.of(tester.getSize(find.byKey(kChoroplethSurfaceKey)));
      final origin = tester.getTopLeft(find.byKey(kChoroplethSurfaceKey));
      final projection = MercatorProjection.fit(rampFeatures);
      final centre = projection.project(const Offset(45, 5));
      await tester.tapAt(origin + Offset(centre.dx * fit.scale + fit.dx, centre.dy * fit.scale + fit.dy));
      await tester.pumpAndSettle();
      expect(find.text('Unable to load districts.'), findsOneWidget);
    });

    testWidgets('drops a legend filter on the way in, where the bands mean something else', (tester) async {
      await pump(tester, IndiaChoropleth(
        features: rampFeatures,
        values: rampValues,
        colorScale: ramp,
        loadDistricts: (stateId, state) async =>
            ChoroplethLayer(features: districts, values: const {'d1': 3.0, 'd2': 4.0}),
      ));
      await tester.tap(swatches().at(0));
      await tester.pump();
      expect((tester.widgetList<Container>(swatches()).first.decoration! as BoxDecoration).border, isNotNull);

      final fit = ViewBoxFit.of(tester.getSize(find.byKey(kChoroplethSurfaceKey)));
      final origin = tester.getTopLeft(find.byKey(kChoroplethSurfaceKey));
      final projection = MercatorProjection.fit(rampFeatures);
      final centre = projection.project(const Offset(45, 5));
      await tester.tapAt(origin + Offset(centre.dx * fit.scale + fit.dx, centre.dy * fit.scale + fit.dy));
      await tester.pumpAndSettle();

      for (final swatch in tester.widgetList<Container>(swatches())) {
        expect((swatch.decoration! as BoxDecoration).border, isNull);
      }
    });
  });

  group('reference overlay', () {
    testWidgets('is fitted with the data, so it registers against the map', (tester) async {
      // Fitted on its own, an overlay wider than the data would be scaled to the
      // same box and the two would no longer line up.
      final overlay = ReferenceOverlay(
        features: [box('claim', 'Claimed outline', -10, -10, 60, 20)],
        descriptions: const {'claim': 'Non-statistical.'},
      );
      await pump(tester, IndiaChoropleth(
        features: rampFeatures,
        values: rampValues,
        colorScale: ramp,
        referenceOverlay: overlay,
      ));

      final withOverlay = MercatorProjection.fit([...rampFeatures, ...overlay.features]);
      final dataOnly = MercatorProjection.fit(rampFeatures);
      expect(withOverlay.project(const Offset(45, 5)), isNot(dataOnly.project(const Offset(45, 5))));
      // And the legend gains its key.
      expect(find.text('Reference context · data unavailable'), findsOneWidget);
    });
  });

  group('rebuild cost', () {
    testWidgets('does not re-project the map when a parent rebuilds', (tester) async {
      // A host that reports hover into its own setState rebuilds this widget on
      // every pointer move. Re-fitting the projection and rebuilding a Path per
      // region each time is fine for 36 states and ruinous for 788 districts.
      Path pathOf() {
        final painter = tester.widget<CustomPaint>(
          find.descendant(of: find.byKey(kChoroplethSurfaceKey), matching: find.byType(CustomPaint)),
        );
        return ((painter.painter! as dynamic).regions.first as ChoroplethRegion).path;
      }

      await pump(tester, IndiaChoropleth(
        features: rampFeatures,
        values: rampValues,
        colorScale: const ColorScale(colors: [Color(0xFF111111), Color(0xFF222222), Color(0xFF333333)]),
      ));
      final before = pathOf();

      // A fresh but equal ColorScale — exactly what a host that builds one inline
      // in its own build method hands over on every rebuild.
      await pump(tester, IndiaChoropleth(
        features: rampFeatures,
        values: rampValues,
        colorScale: ColorScale(colors: [const Color(0xFF111111), const Color(0xFF222222), const Color(0xFF333333)]),
      ));
      expect(identical(pathOf(), before), isTrue,
          reason: 'an equal ColorScale must not force a re-projection');
    });
  });
}



/// The colour actually painted at the centre of each ramp region.
///
/// Rendering and sampling the pixels is the only way to check what the painter
/// did: the dulling lives inside a CustomPainter, so there is no widget tree to
/// inspect the way the web packages inspect a class on a path element.
Future<Map<String, Color>> _samples(WidgetTester tester) async {
  final boundary = tester.renderObject<RenderRepaintBoundary>(
    find.byType(RepaintBoundary).first,
  );
  // Rasterising is real async work, so it has to happen outside the fake async
  // zone the test pumps in — inside it, toImage() simply never completes.
  final image = (await tester.runAsync(boundary.toImage))!;
  final data = (await tester.runAsync(
    () => image.toByteData(format: ui.ImageByteFormat.rawRgba),
  ))!
      .buffer
      .asUint8List();
  final width = image.width;

  final surface = find.byKey(kChoroplethSurfaceKey);
  final fit = ViewBoxFit.of(tester.getSize(surface));
  final origin = tester.getTopLeft(surface) - tester.getTopLeft(find.byType(RepaintBoundary).first);
  final projection = MercatorProjection.fit(rampFeatures);

  Color sample(Offset lonLat) {
    final point = projection.project(lonLat);
    final x = (origin.dx + point.dx * fit.scale + fit.dx).round();
    final y = (origin.dy + point.dy * fit.scale + fit.dy).round();
    final offset = (y * width + x) * 4;
    return Color.from(
      alpha: data[offset + 3] / 255,
      red: data[offset] / 255,
      green: data[offset + 1] / 255,
      blue: data[offset + 2] / 255,
    );
  }

  image.dispose();
  return {
    'low': sample(const Offset(5, 5)),
    'mid': sample(const Offset(25, 5)),
    'high': sample(const Offset(45, 5)),
  };
}


/// A host of the shape onInsight exists for: it keeps the reported region in its
/// own state, and selects the tapped region, so both the insight callback and a
/// selection change round-trip through setState.
class _InsightHost extends StatefulWidget {
  const _InsightHost();

  @override
  State<_InsightHost> createState() => _InsightHostState();
}

class _InsightHostState extends State<_InsightHost> {
  String? _selectedId;
  String _panel = 'panel: none';

  @override
  Widget build(BuildContext context) => Column(
        children: [
          SizedBox(
            width: kViewBox.width,
            // Room for the panel below: the test surface is the view box exactly,
            // and an overflow would be reported as the exception under test.
            height: kViewBox.height - 60,
            child: IndiaChoropleth(
              features: rampFeatures,
              values: rampValues,
              colorScale: ramp,
              selectedId: _selectedId,
              onRegionTap: (region) => setState(() => _selectedId = region.id),
              onInsight: (insight) => setState(() => _panel = 'panel: ${insight?.region.id ?? "none"}'),
            ),
          ),
          Text(_panel),
        ],
      );
}
