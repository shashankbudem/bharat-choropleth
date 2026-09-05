import 'dart:convert';

import 'package:bharat_choropleth/bharat_choropleth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:http/http.dart' as http;

/// The India Development Observatory, painted natively — no WebView, no DOM.
///
/// The same dataset, layout and interactions as the React and framework-free
/// versions beside it, so the three can be read against each other.
void main() => runApp(const ObservatoryApp());

const _ink = Color(0xFFE8EEF2);
const _muted = Color(0xFF93A4B3);
const _panel = Color(0xFF131A22);
const _line = Color(0xFF24303C);
const _accent = Color(0xFF4FD1C0);
const _bg = Color(0xFF0B1017);

const _ramp = [
  Color(0xFFE6F2F0), Color(0xFFC2E2DC), Color(0xFF95CEC4), Color(0xFF63B5A8),
  Color(0xFF3A988B), Color(0xFF1E786D), Color(0xFF0B5750),
];
final _rampInverse = _ramp.reversed.toList(growable: false);

/// One published indicator: its numbers, and everything needed to say where
/// they came from.
class Indicator {
  Indicator.fromJson(Map<String, Object?> json)
      : key = json['key']! as String,
        label = json['label']! as String,
        short = json['short']! as String,
        unit = json['unit']! as String,
        description = json['description']! as String,
        edition = json['edition']! as String,
        decimals = json['decimals']! as int,
        lowerIsBetter = json['lowerIsBetter'] == true,
        levels = (json['levels']! as List<Object?>).cast<String>(),
        source = (json['source']! as Map).cast<String, Object?>(),
        live = json['live'] == null ? null : (json['live']! as Map).cast<String, Object?>(),
        stateValues = _numbers((json['values']! as Map)['state']),
        districtValues = _numbers((json['values']! as Map)['district']);

  final String key;
  final String label;
  final String short;
  final String unit;
  final String description;
  final String edition;
  final int decimals;
  final bool lowerIsBetter;
  final List<String> levels;
  final Map<String, Object?> source;

  /// Present only on the indicator whose values are read from an API at run
  /// time rather than shipped with the app.
  final Map<String, Object?>? live;
  final Map<String, double?> stateValues;
  final Map<String, double?> districtValues;

  bool get hasDistricts => levels.contains('district');
  bool get hasSubDistricts => levels.contains('subdistrict');
  bool get isLive => live != null;

  List<Color> get ramp {
    final colors = live?['colorScale'];
    if (colors is List) {
      return [
        for (final value in colors) Color(int.parse('FF${(value as String).substring(1)}', radix: 16)),
      ];
    }
    return lowerIsBetter ? _rampInverse : _ramp;
  }

  (String, String) get legend {
    final labels = live?['legendLabels'];
    if (labels is List && labels.length == 2) return (labels[0] as String, labels[1] as String);
    return lowerIsBetter ? ('Better', 'Worse') : ('Lower', 'Higher');
  }

  /// Nulls are kept: a region a source does not cover reads as "No data" rather
  /// than quietly vanishing from the map.
  static Map<String, double?> _numbers(Object? raw) {
    if (raw is! Map) return const {};
    return raw.map((key, value) => MapEntry(key as String, (value as num?)?.toDouble()));
  }

  String format(double? value) =>
      value == null ? 'No data' : '${value.toStringAsFixed(decimals)}$unit';

  /// Ranked best-first, honouring whether low or high is the good end.
  List<MapEntry<String, double>> get ranked {
    final rows = <MapEntry<String, double>>[
      for (final entry in stateValues.entries)
        if (entry.value != null) MapEntry(entry.key, entry.value!),
    ];
    rows.sort((a, b) => lowerIsBetter ? a.value.compareTo(b.value) : b.value.compareTo(a.value));
    return rows;
  }
}

class ObservatoryApp extends StatelessWidget {
  const ObservatoryApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'India Development Observatory',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          brightness: Brightness.dark,
          scaffoldBackgroundColor: _bg,
          colorScheme: ColorScheme.fromSeed(
            seedColor: _accent,
            brightness: Brightness.dark,
            surface: _panel,
          ),
        ),
        home: const ObservatoryPage(),
      );
}

class ObservatoryPage extends StatefulWidget {
  const ObservatoryPage({super.key});

  @override
  State<ObservatoryPage> createState() => _ObservatoryPageState();
}

class _ObservatoryPageState extends State<ObservatoryPage> {
  List<Indicator> _indicators = const [];
  Indicator? _indicator;
  Map<String, String> _editionLabels = const {};
  List<MapFeature>? _features;
  Map<String, String> _names = const {};
  String? _selectedId;
  String? _drillDownId;
  ChoroplethInsight? _insight;
  bool _showValues = true;
  String? _error;
  Map<String, Map<String, List<double>>> _centroids = const {};
  Map<String, double?> _liveValues = const {};
  String? _observedAt;

  /// Values for whichever source the current indicator has.
  Map<String, double?> get _stateValues =>
      (_indicator?.isLive ?? false) ? _liveValues : (_indicator?.stateValues ?? const {});

  /// Current readings for a set of region ids, in one request. The API takes
  /// comma-separated coordinates and answers in the same order, so a whole
  /// level is one call.
  Future<Map<String, double?>> _readTemperatures(Indicator indicator, String level, List<String> ids) async {
    final points = _centroids[level] ?? const {};
    final known = ids.where(points.containsKey).toList(growable: false);
    if (known.isEmpty) return const {};
    final spec = indicator.live!;
    final uri = Uri.parse('${spec['endpoint']}'
        '?latitude=${known.map((id) => points[id]![0]).join(',')}'
        '&longitude=${known.map((id) => points[id]![1]).join(',')}'
        '&current=${spec['variable']}');
    final response = await http.get(uri);
    if (response.statusCode != 200) {
      throw Exception('The weather API responded ${response.statusCode}');
    }
    final decoded = jsonDecode(response.body);
    // One coordinate comes back as an object, several as an array.
    final entries = decoded is List ? decoded : [decoded];
    final values = <String, double?>{};
    for (var index = 0; index < known.length; index++) {
      final current = (entries[index] as Map)['current'] as Map?;
      final reading = current?[spec['variable']];
      values[known[index]] = reading is num ? reading.toDouble() : null;
      if (current?['time'] is String) _observedAt = current!['time'] as String;
    }
    return values;
  }

  /// Geometry for one level, plus a live reading for every region in it.
  Future<ChoroplethLayer> _liveLayer(Indicator indicator, String assetPath, String object, String level) async {
    final raw = jsonDecode(await rootBundle.loadString(assetPath)) as Map<String, Object?>;
    final features = decodeTopoJson(raw, objectName: object);
    final values = await _readTemperatures(indicator, level, features.map((f) => f.id).toList(growable: false));
    if (mounted) setState(() {});
    return ChoroplethLayer(features: features, values: values);
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final raw = jsonDecode(await rootBundle.loadString('assets/india-observatory.json'))
          as Map<String, Object?>;
      final raw2 = jsonDecode(await rootBundle.loadString('assets/region-centroids.json'))
          as Map<String, Object?>;
      final editions = (raw['editions']! as Map).cast<String, Object?>();
      final indicators = (raw['indicators']! as List<Object?>)
          .map((entry) => Indicator.fromJson((entry! as Map).cast<String, Object?>()))
          .toList(growable: false);
      setState(() {
        _indicators = indicators;
        _editionLabels = {
          for (final entry in editions.entries)
            entry.key: ((entry.value! as Map)['label']! as String),
        };
      });
      _centroids = ((raw2['centroids']! as Map).cast<String, Object?>()).map(
        (level, byId) => MapEntry(
          level,
          (byId! as Map).map((id, point) => MapEntry(id as String, (point as List).cast<num>().map((n) => n.toDouble()).toList())),
        ),
      );
      await _select(indicators.first);
    } catch (error) {
      setState(() => _error = '$error');
    }
  }

  Future<void> _select(Indicator next) async {
    final editionChanged = _indicator?.edition != next.edition;
    setState(() {
      _indicator = next;
      _selectedId = null;
      _drillDownId = null;
      _insight = null;
      if (editionChanged) _features = null;
    });
    if (!editionChanged && _features != null) return;

    // A different vintage is a different map: a 2011 statistic belongs on 2011
    // units, so the geometry is swapped with the indicator rather than reused.
    final raw = await rootBundle.loadString('assets/${next.edition}/states.topo.json');
    final features = decodeTopoJson(jsonDecode(raw) as Map<String, Object?>, objectName: 'states');
    if (!mounted) return;
    setState(() {
      _features = features;
      _names = {for (final feature in features) feature.id: feature.name};
    });

    if (next.isLive) {
      try {
        final values = await _readTemperatures(next, 'states', features.map((f) => f.id).toList(growable: false));
        if (mounted) setState(() => _liveValues = values);
      } catch (error) {
        if (mounted) setState(() => _error = '$error');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final indicator = _indicator;
    if (_error != null) {
      return Scaffold(body: Center(child: Text('Could not load the dataset:\n$_error', textAlign: TextAlign.center)));
    }
    if (indicator == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator(color: _accent)));
    }
    final wide = MediaQuery.sizeOf(context).width >= 900;
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1280),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _header(),
                  const SizedBox(height: 18),
                  _tabs(indicator),
                  const SizedBox(height: 14),
                  _kpis(indicator),
                  const SizedBox(height: 12),
                  if (wide)
                    IntrinsicHeight(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(child: _mapPanel(indicator)),
                          const SizedBox(width: 12),
                          SizedBox(width: 320, child: _rail(indicator)),
                        ],
                      ),
                    )
                  else ...[
                    _mapPanel(indicator),
                    const SizedBox(height: 12),
                    _rail(indicator),
                  ],
                  const SizedBox(height: 18),
                  _footer(),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _header() => Row(
        children: [
          Container(
            width: 42,
            height: 42,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(11),
              gradient: const LinearGradient(colors: [Color(0xFF2F9C90), Color(0xFF1C6F8F)]),
            ),
            child: const Text('IN', style: TextStyle(fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 12),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('India Development Observatory',
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: _ink)),
                Text("Official statistics on this repository's own boundary bundles · bharat_choropleth for Flutter",
                    style: TextStyle(fontSize: 12, color: _muted)),
              ],
            ),
          ),
        ],
      );

  Widget _tabs(Indicator active) => Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final indicator in _indicators)
            ChoiceChip(
              label: Text(indicator.short),
              selected: indicator.key == active.key,
              onSelected: (_) => _select(indicator),
              backgroundColor: _panel,
              selectedColor: _accent.withValues(alpha: .16),
              side: BorderSide(color: indicator.key == active.key ? _accent : _line),
              labelStyle: TextStyle(
                fontSize: 13,
                color: indicator.key == active.key ? _accent : _muted,
                fontWeight: indicator.key == active.key ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
        ],
      );

  Widget _card({required Widget child}) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: _panel,
          border: Border.all(color: _line),
          borderRadius: BorderRadius.circular(14),
        ),
        child: child,
      );

  /// Ranked best-first for a published indicator; warmest-first when live.
  List<MapEntry<String, double>> _board(Indicator indicator) {
    if (!indicator.isLive) return indicator.ranked;
    final rows = <MapEntry<String, double>>[
      for (final entry in _liveValues.entries)
        if (entry.value != null) MapEntry(entry.key, entry.value!),
    ];
    rows.sort((a, b) => b.value.compareTo(a.value));
    return rows;
  }

  Widget _kpis(Indicator indicator) {
    final board = _board(indicator);
    final best = board.isEmpty ? null : board.first;
    final median = board.isEmpty ? null : board[board.length ~/ 2].value;
    final cards = <List<String>>[
      ['Reporting', '${board.length} / ${indicator.stateValues.length}', 'states & UTs with a value'],
      [
        indicator.lowerIsBetter ? 'Lowest' : 'Highest',
        best == null ? '—' : (_names[best.key] ?? best.key),
        best == null ? '' : indicator.format(best.value),
      ],
      ['Median', indicator.format(median), 'across reporting regions'],
      [
        'Boundaries',
        (_editionLabels[indicator.edition] ?? indicator.edition).replaceAll(' boundaries', ''),
        '${indicator.isLive && _observedAt != null ? 'read ${_observedAt!.replaceFirst('T', ' ')} UTC' : '${indicator.source['vintage']} data'}'
            ' · ${indicator.hasSubDistricts ? 'to sub-district' : indicator.hasDistricts ? 'state and district' : 'state level only'}',
      ],
    ];
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 820 ? 4 : (constraints.maxWidth >= 460 ? 2 : 1);
        final width = (constraints.maxWidth - (columns - 1) * 10) / columns;
        return Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (final card in cards)
              SizedBox(
                width: width,
                child: _card(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(card[0].toUpperCase(),
                          style: const TextStyle(fontSize: 10, letterSpacing: 1.1, color: _muted)),
                      const SizedBox(height: 4),
                      Text(card[1],
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w600, color: _ink)),
                      const SizedBox(height: 2),
                      Text(card[2], style: const TextStyle(fontSize: 11, color: _muted)),
                    ],
                  ),
                ),
              ),
          ],
        );
      },
    );
  }

  Widget _mapPanel(Indicator indicator) {
    final features = _features;
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(indicator.label, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: _ink)),
          const SizedBox(height: 4),
          Text(indicator.description, style: const TextStyle(fontSize: 12.5, color: _muted)),
          Row(
            children: [
              Checkbox(
                value: _showValues,
                onChanged: (value) => setState(() => _showValues = value ?? true),
                activeColor: _accent,
                visualDensity: VisualDensity.compact,
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              const Text('Values on map', style: TextStyle(fontSize: 12.5, color: _muted)),
              const Spacer(),
              Flexible(
                child: Text(
                  indicator.hasDistricts
                      ? (indicator.hasSubDistricts
                          ? 'Tap a state, then a district, to sample the level below'
                          : 'Tap a state to drill into its districts')
                      : 'State level only',
                  textAlign: TextAlign.end,
                  style: const TextStyle(fontSize: 11.5, color: _muted),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 520,
            child: features == null
                ? const Center(child: CircularProgressIndicator(color: _accent))
                : IndiaChoropleth(
                    key: ValueKey('${indicator.key}-${indicator.edition}'),
                    features: features,
                    values: _stateValues,
                    colorScale: ColorScale(colors: indicator.ramp),
                    legendLabels: indicator.legend,
                    formatValue: (value) => '${value.toStringAsFixed(indicator.decimals)}${indicator.unit}',
                    semanticLabel: '${indicator.label} by state and union territory',
                    selectedId: _selectedId,
                    drillDownId: _drillDownId,
                    onDrillDownChange: (stateId, _) => setState(() => _drillDownId = stateId),
                    onRegionTap: (region) => setState(() => _selectedId = region.id),
                    onBackgroundTap: () => setState(() => _selectedId = null),
                    onInsight: (insight) => setState(() => _insight = insight),
                    borderColor: _bg,
                    showRegionValues: _showValues,
                    loadDistricts: indicator.hasDistricts
                        ? (stateId, state) async {
                            final path = 'assets/${indicator.edition}-districts/$stateId.topo.json';
                            if (indicator.isLive) return _liveLayer(indicator, path, 'districts', 'districts');
                            final raw = await rootBundle.loadString(path);
                            return ChoroplethLayer(
                              features: decodeTopoJson(
                                jsonDecode(raw) as Map<String, Object?>,
                                objectName: 'districts',
                              ),
                              values: indicator.districtValues,
                            );
                          }
                        : null,
                    loadSubDistricts: indicator.hasSubDistricts
                        ? (districtId, district, stateId) async {
                            try {
                              return await _liveLayer(
                                indicator,
                                'assets/subdistricts/$districtId.topo.json',
                                'subdistricts',
                                'subdistricts',
                              );
                            } catch (_) {
                              // Three of the 788 districts have no sub-district
                              // level; null leaves them as leaves.
                              return null;
                            }
                          }
                        : null,
                  ),
          ),
          const SizedBox(height: 12),
          _provenance(indicator),
        ],
      ),
    );
  }

  Widget _provenance(Indicator indicator) {
    final source = indicator.source;
    final rows = <List<String>>[
      ['Publisher', '${source['publisher']}'],
      ['Release', '${source['title']}'],
      ['Vintage', '${source['vintage']}'],
      ['Boundaries', _editionLabels[indicator.edition] ?? indicator.edition],
      ['Join', '${source['joinRule']}'],
      if (source['formula'] != null) ['Formula', '${source['formula']}'],
      if (source['licence'] != null) ['Licence', '${source['licence']}'],
      if (source['sha256'] != null) ['Source file', '${source['sha256']}'],
    ];
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        tilePadding: EdgeInsets.zero,
        childrenPadding: const EdgeInsets.only(bottom: 8),
        title: const Text('Where this number comes from', style: TextStyle(fontSize: 13, color: _muted)),
        children: [
          for (final row in rows)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(width: 96, child: Text(row[0], style: const TextStyle(fontSize: 12, color: _muted))),
                  Expanded(
                    child: Text(row[1],
                        style: TextStyle(fontSize: 12, color: row[0] == 'Source file' ? _muted : _ink)),
                  ),
                ],
              ),
            ),
          if (source['caveat'] != null)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFFC58A3D).withValues(alpha: .1),
                border: const Border(left: BorderSide(color: Color(0xFFC58A3D), width: 3)),
              ),
              child: Text('${source['caveat']}', style: const TextStyle(fontSize: 12, color: Color(0xFFE2C79A))),
            ),
        ],
      ),
    );
  }

  Widget _rail(Indicator indicator) {
    final insight = _insight;
    final board = _board(indicator);
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('Regional detail', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: _ink)),
          const SizedBox(height: 8),
          if (insight == null)
            const Text('Tap or focus a region for its value and rank.',
                style: TextStyle(fontSize: 13, color: _muted))
          else ...[
            Text(insight.region.label, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: _ink)),
            Text(indicator.format(insight.region.value),
                style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w600, color: _accent)),
            const SizedBox(height: 6),
            _railRow('Rank in view',
                insight.rank == null ? '—' : '#${insight.rank} of ${insight.rankedCount}'),
            _railRow('Level', insight.level.name),
          ],
          const SizedBox(height: 18),
          Text('${indicator.lowerIsBetter ? 'BEST PERFORMING' : 'HIGHEST'} STATES',
              style: const TextStyle(fontSize: 10, letterSpacing: 1.1, color: _muted)),
          const SizedBox(height: 6),
          for (final (index, row) in board.take(10).indexed)
            InkWell(
              onTap: () => setState(() => _selectedId = row.key),
              borderRadius: BorderRadius.circular(7),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(7),
                  color: row.key == _selectedId ? _accent.withValues(alpha: .1) : null,
                  border: Border.all(color: row.key == _selectedId ? _accent : Colors.transparent),
                ),
                child: Row(
                  children: [
                    SizedBox(width: 20, child: Text('${index + 1}', style: const TextStyle(fontSize: 12, color: _muted))),
                    Expanded(
                      child: Text(_names[row.key] ?? row.key,
                          maxLines: 1, overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 13, color: _ink)),
                    ),
                    Text(indicator.format(row.value), style: const TextStyle(fontSize: 12, color: _muted)),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _railRow(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 5),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: const TextStyle(fontSize: 12.5, color: _muted)),
            Text(value, style: const TextStyle(fontSize: 12.5, color: _ink)),
          ],
        ),
      );

  Widget _footer() => const Text(
        'Every figure is a published official statistic joined to boundary data in this repository. Regions a source '
        'does not cover are shown as No data and are never estimated. Boundary provenance and licences are in '
        'data/ATTRIBUTION.md.',
        style: TextStyle(fontSize: 11.5, color: _muted),
      );
}
