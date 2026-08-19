import 'dart:convert';

import 'package:bharat_choropleth/bharat_choropleth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;

void main() => runApp(const DemoApp());

/// The one configuration all three example demos share, loaded from
/// `examples/parity-config.json` so the Flutter, plain-JS and React demos render
/// at the same size with the same colours and the same values.
class ParityConfig {
  const ParityConfig({
    required this.mapWidth,
    required this.fontColor,
    required this.borderColor,
    required this.borderWidth,
    required this.selectionColor,
    required this.selectionWidth,
    required this.colorScale,
    required this.values,
    required this.ariaLabel,
  });

  factory ParityConfig.fromJson(Map<String, Object?> json) {
    Color parse(String hex) => Color(int.parse(hex.replaceFirst('#', 'ff'), radix: 16));
    return ParityConfig(
      mapWidth: (json['mapWidth']! as num).toDouble(),
      fontColor: parse(json['fontColor']! as String),
      borderColor: parse(json['borderColor']! as String),
      borderWidth: (json['borderWidth']! as num).toDouble(),
      selectionColor: parse(json['selectionColor']! as String),
      selectionWidth: (json['selectionWidth']! as num).toDouble(),
      colorScale: (json['colorScale']! as List).map((value) => parse(value! as String)).toList(),
      values: (json['values']! as Map).map((key, value) => MapEntry(key as String, (value as num).toDouble())),
      ariaLabel: json['ariaLabel']! as String,
    );
  }

  final double mapWidth;
  final Color fontColor;
  final Color borderColor;
  final double borderWidth;
  final Color selectionColor;
  final double selectionWidth;
  final List<Color> colorScale;
  final Map<String, double?> values;
  final String ariaLabel;
}

class DemoApp extends StatelessWidget {
  const DemoApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Bharat Choropleth',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(colorSchemeSeed: const Color(0xFF147B71), useMaterial3: true),
        home: const MapScreen(),
      );
}

class MapScreen extends StatefulWidget {
  const MapScreen({super.key});

  @override
  State<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends State<MapScreen> {
  // Boundary data is never bundled with the package — load it yourself, from an
  // asset as here, or from the network. See data/ATTRIBUTION.md for the terms.
  late final Future<(ParityConfig, List<MapFeature>)> _loaded = _load()
    ..then((loaded) => setState(() => _status = 'Ready — ${loaded.$2.length} states and union territories'));
  String? _selectedId;
  String _status = 'Loading…';
  String _insight = 'Hover a region';

  /// A stable pseudo-random value per id, so the drill-down is a real choropleth
  /// and looks the same on every run without shipping a second data file. Same
  /// hash as the React parity demo, so both drill-downs colour identically.
  static double _sampleValue(String id) {
    var hash = 0;
    for (final unit in id.codeUnits) {
      hash = (hash * 31 + unit) % 997;
    }
    return 1 + (hash % 40).toDouble();
  }

  static Future<(ParityConfig, List<MapFeature>)> _load() async {
    final config = ParityConfig.fromJson(
      jsonDecode(await rootBundle.loadString('assets/parity-config.json')) as Map<String, Object?>,
    );
    final features = decodeTopoJson(
      jsonDecode(await rootBundle.loadString('assets/states.topo.json')) as Map<String, Object?>,
      objectName: 'states',
    );
    return (config, features);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: FutureBuilder<(ParityConfig, List<MapFeature>)>(
          future: _loaded,
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return Center(child: Text('Could not load: ${snapshot.error}'));
            }
            if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());

            final (config, features) = snapshot.data!;
            return SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
              child: Center(
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: config.mapWidth),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'Flutter — bharat_choropleth',
                        style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: Color(0xFF0F1B38)),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Every option the library exposes is switched on. Hover or tap for the tooltip, '
                        'tap a state to drill into its districts, tap open sea to clear the selection — '
                        'except inside an island group, where the water between the islands belongs to '
                        'the group. Pick a legend swatch to filter the map to that band.',
                        style: TextStyle(fontSize: 14, color: Color(0xFF53617B)),
                      ),
                      const SizedBox(height: 24),
                      // Same 960x640 view box as the web renderers, at the same
                      // on-screen width, so all three maps are the same size. The
                      // widget draws its own breadcrumb and legend, so there is no
                      // AspectRatio here — it sizes the map from the space left
                      // after the chrome, exactly as the web packages do.
                      IndiaChoropleth(
                        features: features,
                        values: config.values,
                        // Shared appearance — identical in all three demos.
                        colorScale: ColorScale(colors: config.colorScale),
                        borderColor: config.borderColor,
                        borderWidth: config.borderWidth,
                        selectionColor: config.selectionColor,
                        selectionWidth: config.selectionWidth,
                        // Everything else this renderer supports.
                        showRegionValues: true,
                        showLegend: true,
                        showBreadcrumb: true,
                        legendLabels: const ('Lower', 'Higher'),
                        // Grow parts under 14 units about their own centres, so
                        // Lakshadweep's islands are visible and tappable.
                        minDistrictPartExtent: 14,
                        regionValueStyle: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: config.fontColor,
                          height: 1,
                        ),
                        semanticLabel: config.ariaLabel,
                        selectedId: _selectedId,
                        formatValue: (value) => value.toStringAsFixed(0),
                        loadDistricts: (stateId, state) async {
                          final raw = await rootBundle.loadString('assets/districts/$stateId.topo.json');
                          final districts = decodeTopoJson(
                            jsonDecode(raw) as Map<String, Object?>,
                            objectName: 'districts',
                          );
                          // Districts need their own values or every one renders
                          // as "no data" — a near-white fill with white borders,
                          // which is invisible on this page.
                          return ChoroplethLayer(
                            features: districts,
                            values: {for (final d in districts) d.id: _sampleValue(d.id)},
                          );
                        },
                        // Keyed on the id, not the region: going back reports the
                        // state you came *from*, so testing the region would say
                        // "drilled into" on the way out as well as on the way in.
                        // Non-statistical context for a drilled-in state, where
                        // one exists: Jammu & Kashmir's Pakistan-administered
                        // districts are drawn as a hatched outline with no value,
                        // never coloured and never counted.
                        loadDistrictReferenceOverlay: (stateId, state) async {
                          try {
                            final raw = await rootBundle.loadString('assets/overlays/$stateId.topo.json');
                            return ReferenceOverlay(
                              features: decodeTopoJson(
                                jsonDecode(raw) as Map<String, Object?>,
                                objectName: 'outline',
                              ),
                              descriptions: const {},
                            );
                          } catch (_) {
                            return null; // most states have no overlay
                          }
                        },
                        onDrillDownChange: (stateId, state) => setState(() {
                          _status = stateId == null ? 'Back to all states' : 'Drilled into ${state?.label}';
                        }),
                        onRegionTap: (region) => setState(() {
                          _selectedId = region.id;
                          _status = 'Selected ${region.label}';
                        }),
                        onBackgroundTap: () => setState(() {
                          _selectedId = null;
                          _status = 'Selection cleared';
                        }),
                        onInsight: (insight) => setState(() {
                          _insight = insight == null
                              ? 'Hover a region'
                              : '${insight.region.label} · '
                                  '${insight.region.value?.toStringAsFixed(0) ?? "No data"}';
                        }),
                      ),
                      const SizedBox(height: 16),
                      Text(_insight, style: const TextStyle(fontSize: 14, color: Color(0xFF0F1B38))),
                      const SizedBox(height: 8),
                      Text(_status, style: const TextStyle(fontSize: 12, color: Color(0xFF53617B))),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
