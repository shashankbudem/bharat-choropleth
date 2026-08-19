import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';

import 'chrome.dart';
import 'color_scale.dart';
import 'legend.dart';
import 'model.dart';
import 'projection.dart';
import 'topojson.dart';

/// An accessible India choropleth, drawn natively — no WebView, no DOM.
///
/// ```dart
/// IndiaChoropleth(
///   features: decodeTopoJson(topology),
///   values: const {'in-cs-30-goa': 6, 'Gujarat': 7},
///   onRegionTap: (region) => print(region.label),
/// )
/// ```
///
/// Feature-for-feature with the `bharat-choropleth` React and JavaScript
/// packages: the same projection and view box, the same colour ramp, the same
/// small-region handling, drill-down into districts with a breadcrumb back, a
/// tooltip carrying share-of-total and rank, a legend that doubles as a filter,
/// and an optional non-statistical reference overlay. The same data drawn
/// through any of the three lands in the same place and reads the same way.
class IndiaChoropleth extends StatefulWidget {
  const IndiaChoropleth({
    super.key,
    required this.features,
    this.values = const {},
    this.colorScale = const ColorScale(),
    this.selectedId,
    this.onRegionTap,
    this.onBackgroundTap,
    this.loadDistricts,
    this.drillDownId,
    this.onDrillDownChange,
    this.loadDistrictReferenceOverlay,
    this.referenceOverlay,
    this.referenceOverlayFill = ReferenceOverlayFill.hatch,
    this.referenceOverlayMergeIds = const [],
    this.referenceOverlayLegendLabel = 'Reference context · data unavailable',
    this.onInspect,
    this.onInsight,
    this.tooltipBuilder,
    this.showTooltip = true,
    this.showLegend = true,
    this.showBreadcrumb = true,
    this.legendLabels = ('Lower', 'Higher'),
    this.interactive = true,
    this.borderColor = const Color(0xFFFFFFFF),
    this.borderWidth = 1.0,
    this.selectionColor = const Color(0xFFFF725F),
    this.selectionWidth = 1.5,
    this.showRegionValues = false,
    this.minRegionMarkerSize = 7,
    this.minRegionMarkerOutline = const Color(0xFF53617B),
    this.minPartExtent = 0,
    this.minDistrictPartExtent,
    this.smallRegionExtent = 22,
    this.smallRegionTapRadius = 14,
    this.regionLabelOffsets = const {},
    this.regionValueStyle,
    this.semanticLabel = 'Interactive choropleth map',
    this.formatValue,
  });

  final List<MapFeature> features;

  /// Values keyed by region id *or* display name — whichever your data already
  /// has. An id wins when both are present.
  final Map<String, double?> values;

  final ColorScale colorScale;

  /// Marked with a ring, never by recolouring: the fill carries the value, so
  /// overwriting it would make the selected region's colour meaningless.
  final String? selectedId;

  final void Function(ChoroplethRegion region)? onRegionTap;

  /// Called for a tap that hit no region and was not close enough to a small one.
  /// Apps typically clear the selection here, so tapping the sea drops the
  /// selection ring. The widget never clears it on its own: [selectedId] belongs
  /// to the caller, and a renderer silently discarding it would be surprising.
  final void Function()? onBackgroundTap;

  /// Supply this and tapping a state drills into it. The loader is called with
  /// the state's id and the region that was tapped, and returns that state's
  /// districts with their own values.
  final Future<ChoroplethLayer> Function(String stateId, ChoroplethRegion state)? loadDistricts;

  /// Drive the drill-down from outside. Leave null to let the widget own it.
  final String? drillDownId;
  final void Function(String? stateId, ChoroplethRegion? state)? onDrillDownChange;

  /// The reference overlay for a drilled-in state, loaded the same way as its
  /// districts. Optional context: a failure here still leaves a usable map.
  final Future<ReferenceOverlay?> Function(String stateId, ChoroplethRegion state)?
      loadDistrictReferenceOverlay;

  /// Non-statistical context drawn beneath the data at the national level.
  final ReferenceOverlay? referenceOverlay;
  final ReferenceOverlayFill referenceOverlayFill;

  /// Regions whose border should disappear into the overlay rather than being
  /// drawn against it, where the two describe the same ground.
  final List<String> referenceOverlayMergeIds;
  final String referenceOverlayLegendLabel;

  /// Hover or tap moved onto a region, or off every region (null).
  final void Function(ChoroplethRegion? region, ChoroplethLevel level)? onInspect;

  /// The same context the tooltip is built from, for a host-owned panel. Unlike
  /// [onInspect] this falls back to the selected region when nothing is being
  /// pointed at, so a panel stays informative instead of blanking.
  final void Function(ChoroplethInsight? insight)? onInsight;

  /// Replace the default tooltip. Return null to draw nothing for that region.
  final Widget? Function(ChoroplethInsight insight)? tooltipBuilder;

  final bool showTooltip;
  final bool showLegend;
  final bool showBreadcrumb;

  /// The two ends of the legend's ramp, low first.
  final (String, String) legendLabels;

  /// Set false for a map that is a picture: no taps, no tooltip, and a legend
  /// that is a key rather than a filter.
  final bool interactive;

  final Color borderColor;
  final double borderWidth;
  final Color selectionColor;

  /// Stroke width of the selection ring, in logical pixels. The halo drawn under
  /// it is twice this, so one number controls the whole marker.
  final double selectionWidth;

  /// Draw each region's value at its centroid.
  final bool showRegionValues;

  /// Diameter, in view-box units, of the marker drawn for regions too small to
  /// see. Puducherry's enclaves are a couple of units across at national scale:
  /// without a marker the UT is invisible and impossible to tap, even though its
  /// geometry is perfectly correct. Set to 0 to draw geography only.
  final double minRegionMarkerSize;

  /// Outline for that marker. It needs its own colour: the marker is filled with
  /// the region's ramp colour, so a low value on a light page would otherwise be
  /// a pale dot on a pale background, outlined in the white region border.
  final Color minRegionMarkerOutline;

  /// Grow any part narrower than this (view-box units) about its own centre, so
  /// it can be seen and tapped. Off by default.
  ///
  /// An archipelago cannot be drawn to scale and still be usable: Lakshadweep's
  /// islands are one to two kilometres across and spread over 250. This trades
  /// exact size for visibility, keeping every part in its true position.
  ///
  /// Regions with nowhere to grow into are left at their true size regardless —
  /// Puducherry is enclaves inside Tamil Nadu, and growing them would put a
  /// Puducherry of the wrong shape in the wrong place. Those fall back to the
  /// marker dot, which is a tap target in its own right.
  final double minPartExtent;

  /// Like [minPartExtent], but applied only after drilling into a state's
  /// districts. When omitted, districts inherit [minPartExtent].
  final double? minDistrictPartExtent;

  /// A region whose largest part is narrower than this (view-box units) is
  /// treated as small: its value label is moved outside the shape, taps near it
  /// still count, and if it is scattered across parts the water between them
  /// counts as part of it. Goa, Andaman & Nicobar and Lakshadweep all fall under it.
  final double smallRegionExtent;

  /// How far a tap may land from a small region and still select it, in view-box
  /// units. This only applies where the tap hit no region at all, so the buffer
  /// fills the empty sea around an island without ever stealing a tap from a
  /// neighbour — which is why it needs no notion of which side the ocean is on.
  final double smallRegionTapRadius;

  /// Per-region nudges for value labels, in view-box units, keyed by region id.
  /// The automatic placement pushes a small region's label away from the middle
  /// of the map; use this when a particular one reads better somewhere else.
  final Map<String, Offset> regionLabelOffsets;

  /// Style for those labels. Defaults to bold 11px in [borderColor]-haloed dark
  /// text, matching the web packages. Size is in view-box units, so labels scale
  /// with the map exactly as the SVG renderers do.
  final TextStyle? regionValueStyle;

  final String semanticLabel;

  /// Formats values for screen readers and the tooltip. Defaults to [formatValueDefault].
  final String Function(double value)? formatValue;

  /// Whole numbers read as `6`, not `6.0` — values are usually counts, and a
  /// screen reader saying "six point zero" for every region is noise.
  static String formatValueDefault(double value) =>
      value == value.roundToDouble() ? value.toStringAsFixed(0) : value.toString();

  @override
  State<IndiaChoropleth> createState() => _IndiaChoroplethState();
}

class _IndiaChoroplethState extends State<IndiaChoropleth> {
  List<ChoroplethRegion> _regions = const [];
  List<ChoroplethReferenceRegion> _referenceRegions = const [];
  List<ChoroplethRegion> _stateRegions = const [];
  List<LegendBucket> _buckets = const [];
  double _min = 0;
  double _max = 0;
  double _total = 0;

  String? _internalDrillDownId;
  ChoroplethLayer? _districts;
  String? _districtsFor;
  ReferenceOverlay? _districtOverlay;
  String? _districtOverlayFor;
  bool _loading = false;
  Object? _loadError;
  int _loadGeneration = 0;

  String? _inspectedId;
  int? _activeBucket;
  String? _bandsKey;

  String Function(double value) get _formatValue => widget.formatValue ?? IndiaChoropleth.formatValueDefault;
  String? get _drillDownId => widget.drillDownId ?? _internalDrillDownId;
  ChoroplethLevel get _level =>
      _drillDownId != null && _drilledState != null ? ChoroplethLevel.district : ChoroplethLevel.state;
  bool get _canDrill => widget.loadDistricts != null && _level == ChoroplethLevel.state;

  ChoroplethRegion? get _drilledState {
    for (final region in _stateRegions) {
      if (region.id == _drillDownId) return region;
    }
    return null;
  }

  ChoroplethRegion? get _selected => _find(_regions, widget.selectedId);
  ChoroplethRegion? get _inspected => _find(_regions, _inspectedId);

  static ChoroplethRegion? _find(List<ChoroplethRegion> regions, String? id) {
    if (id == null) return null;
    for (final region in regions) {
      if (region.id == id) return region;
    }
    return null;
  }

  @override
  void initState() {
    super.initState();
    _prepare();
    _scheduleInsight();
  }

  @override
  void didUpdateWidget(IndiaChoropleth oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.features, widget.features) ||
        !identical(oldWidget.values, widget.values) ||
        !identical(oldWidget.referenceOverlay, widget.referenceOverlay) ||
        oldWidget.drillDownId != widget.drillDownId ||
        oldWidget.colorScale != widget.colorScale ||
        oldWidget.minPartExtent != widget.minPartExtent ||
        oldWidget.minDistrictPartExtent != widget.minDistrictPartExtent) {
      _prepare();
    }
    if (oldWidget.drillDownId != widget.drillDownId && widget.drillDownId != null) {
      _loadDistrictsFor(widget.drillDownId!);
    }
    if (oldWidget.selectedId != widget.selectedId || !identical(oldWidget.values, widget.values)) {
      _scheduleInsight();
    }
  }

  double? _valueIn(Map<String, double?> values, MapFeature feature) =>
      values.containsKey(feature.id) ? values[feature.id] : values[feature.name];

  /// Project one layer into view-box space.
  ///
  /// The reference overlay is fitted *together with* the data, not separately:
  /// fitting each on its own would scale them differently and the outline would
  /// no longer register against the map it is context for.
  (List<ChoroplethRegion>, List<ChoroplethReferenceRegion>) _project(
    List<MapFeature> features,
    Map<String, double?> values,
    ReferenceOverlay? overlay,
    double minPartExtent,
  ) {
    final all = [...features, ...?overlay?.features];
    if (all.isEmpty) return (const [], const []);
    final projection = MercatorProjection.fit(all);

    List<List<Offset>> ringsOf(MapFeature feature) => [
          for (final ring in feature.rings)
            if (ring.isNotEmpty) ring.map(projection.project).toList(growable: false),
        ];
    Path pathOf(List<List<Offset>> rings) {
      final path = Path()..fillType = PathFillType.evenOdd;
      for (final ring in rings) {
        path.moveTo(ring.first.dx, ring.first.dy);
        for (final point in ring.skip(1)) {
          path.lineTo(point.dx, point.dy);
        }
        path.close();
      }
      return path;
    }

    final regions = <ChoroplethRegion>[];
    for (final feature in features) {
      final rings = ringsOf(feature);
      // Puducherry and anything else on the keep-true list is drawn as it really
      // is, however small, because there is no room around it to grow into.
      final projectedRings =
          keepsTrueGeometry(feature.id) ? rings : enlargeSmallParts(rings, minPartExtent);
      final path = pathOf(projectedRings);
      final hull = scatteredHitArea(projectedRings, widget.smallRegionExtent);
      final bounds = path.getBounds();
      regions.add(ChoroplethRegion(
        id: feature.id,
        label: feature.name,
        value: _valueIn(values, feature),
        path: path,
        hitPath: hull == null ? null : pathOf([hull]),
        bounds: bounds,
        labelPoint: labelPointFor(projectedRings, bounds),
        largestRingExtent: largestRingExtentOf(projectedRings),
        partBounds: projectedRings.map(boundsOfRing).toList(growable: false),
        feature: feature,
      ));
    }

    final references = <ChoroplethReferenceRegion>[
      for (final feature in overlay?.features ?? const <MapFeature>[])
        ChoroplethReferenceRegion(
          id: feature.id,
          label: feature.name,
          description: overlay?.descriptions[feature.id] ?? '',
          path: pathOf(ringsOf(feature)),
        ),
    ];
    return (regions, references);
  }

  void _prepare() {
    final (stateRegions, stateReferences) =
        _project(widget.features, widget.values, widget.referenceOverlay, widget.minPartExtent);
    _stateRegions = stateRegions;

    final districts = _districtsFor != null && _districtsFor == _drillDownId ? _districts : null;
    if (_drillDownId != null && districts != null) {
      final overlay = _districtOverlayFor == _drillDownId ? _districtOverlay : null;
      final (regions, references) = _project(
        districts.features,
        districts.values,
        overlay,
        widget.minDistrictPartExtent ?? widget.minPartExtent,
      );
      _regions = regions;
      _referenceRegions = references;
    } else if (_drillDownId != null && _drilledState != null) {
      _regions = const [];
      _referenceRegions = const [];
    } else {
      _regions = stateRegions;
      _referenceRegions = stateReferences;
    }

    final values = _regions.map((region) => region.value).whereType<double>();
    _min = values.isEmpty ? 0 : values.reduce(math.min);
    _max = values.isEmpty ? 0 : values.reduce(math.max);
    _total = _regions.fold(0, (total, region) => total + (region.value ?? 0));
    _buckets = legendBuckets(
      widget.colorScale.colors,
      _regions.map((region) => region.value),
      _min,
      _max,
    );

    // Bands come from this level's own min and max, and change with the ramp, so
    // an index picked under one of them means something else under another.
    // Keyed on the ramp's contents rather than the ColorScale's identity, which
    // a host rebuilding one inline would change on every frame.
    final bands = [
      _level.name,
      _drillDownId ?? '',
      widget.colorScale.colors.map((color) => color.toARGB32()).join(','),
    ].join('|');
    if (bands != _bandsKey) {
      _bandsKey = bands;
      _activeBucket = null;
    }
    if (_activeBucket != null && _activeBucket! >= _buckets.length) _activeBucket = null;
    if (_inspectedId != null && _find(_regions, _inspectedId) == null) _inspectedId = null;
  }

  // ---------------------------------------------------------------------
  // Drill-down
  // ---------------------------------------------------------------------

  void _loadDistrictsFor(String stateId) {
    final loader = widget.loadDistricts;
    final state = _find(_stateRegions, stateId);
    if (loader == null || state == null) return;

    final generation = ++_loadGeneration;
    setState(() {
      _loading = true;
      _loadError = null;
      _districts = null;
      _districtsFor = null;
      _districtOverlay = null;
      _districtOverlayFor = null;
      _prepare();
    });

    loader(stateId, state).then((layer) {
      if (!mounted || generation != _loadGeneration) return;
      setState(() {
        _districts = layer;
        _districtsFor = stateId;
        _loading = false;
        _prepare();
      });
    }).catchError((Object error) {
      if (!mounted || generation != _loadGeneration) return;
      setState(() {
        _loadError = error;
        _loading = false;
        _prepare();
      });
    });

    final overlayLoader = widget.loadDistrictReferenceOverlay;
    if (overlayLoader == null) return;
    overlayLoader(stateId, state).then((overlay) {
      if (!mounted || generation != _loadGeneration) return;
      setState(() {
        _districtOverlay = overlay;
        _districtOverlayFor = stateId;
        _prepare();
      });
      // Optional context must not stop a usable district view appearing.
    }).catchError((Object _) {
      if (!mounted || generation != _loadGeneration) return;
      setState(() {
        _districtOverlay = null;
        _districtOverlayFor = stateId;
        _prepare();
      });
    });
  }

  void _drillInto(ChoroplethRegion region) {
    widget.onDrillDownChange?.call(region.id, region);
    if (widget.drillDownId == null) {
      setState(() => _internalDrillDownId = region.id);
    }
    _loadDistrictsFor(region.id);
  }

  void _goBack() {
    final prior = _drilledState;
    widget.onDrillDownChange?.call(null, prior);
    _loadGeneration++;
    setState(() {
      _internalDrillDownId = null;
      _districts = null;
      _districtsFor = null;
      _districtOverlay = null;
      _districtOverlayFor = null;
      _loading = false;
      _loadError = null;
      _inspectedId = prior?.id;
      _prepare();
    });
    _notifyInsight();
  }

  // ---------------------------------------------------------------------
  // Inspection
  // ---------------------------------------------------------------------

  void _inspect(ChoroplethRegion? region) {
    if (region?.id == _inspectedId) return;
    setState(() => _inspectedId = region?.id);
    widget.onInspect?.call(region, _level);
    _notifyInsight();
  }

  /// Report the context after this frame rather than during it.
  ///
  /// React drives its equivalent from an effect on the derived context, so it
  /// fires on mount and on any change — including a selection made from outside.
  /// Both of those arrive here mid-build, and a host that calls setState from
  /// onInsight (which is the whole point of the callback) would be marking
  /// itself dirty while the tree is already building.
  void _scheduleInsight() {
    if (widget.onInsight == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _notifyInsight();
    });
  }

  void _notifyInsight() {
    final callback = widget.onInsight;
    if (callback == null) return;
    // Unlike onInspect, this falls back to the selected region so a host panel
    // stays informative when nothing is being pointed at.
    final source = _inspected ?? _selected;
    callback(source == null ? null : _insightFor(source));
  }

  ChoroplethInsight _insightFor(ChoroplethRegion region) {
    final valued = _regions.where((candidate) => candidate.value != null).toList(growable: false);
    final value = region.value;
    return ChoroplethInsight(
      region: region,
      level: _level,
      total: _total,
      share: value == null || _total == 0 ? null : value / _total * 100,
      // Ties share the better rank, which is what a reader expects from a
      // leaderboard and avoids an arbitrary tiebreak.
      rank: value == null ? null : valued.where((candidate) => candidate.value! > value).length + 1,
      rankedCount: valued.length,
      selected: region.id == widget.selectedId,
    );
  }

  void _activate(ChoroplethRegion region) {
    widget.onRegionTap?.call(region);
    if (_canDrill) _drillInto(region);
  }

  // ---------------------------------------------------------------------
  // Hit testing
  // ---------------------------------------------------------------------

  ChoroplethRegion? _regionAt(Offset point) {
    // Last drawn wins, matching what the user sees where outlines overlap.
    for (final region in _regions.reversed) {
      if (region.path.contains(point)) return region;
    }
    // A scattered group reads as the whole area its outer parts enclose — the
    // water inside Lakshadweep is Lakshadweep — so the hull counts too. Only
    // after every polygon has missed, which is what lets Puducherry's hull span
    // the Tamil Nadu coast without ever taking a tap away from Tamil Nadu.
    for (final region in _regions.reversed) {
      if (region.hitPath?.contains(point) ?? false) return region;
    }
    return null;
  }

  void _handleTapUp(TapUpDetails details, Size size) {
    final point = ViewBoxFit.of(size).toViewBox(details.localPosition);
    final hit = _regionAt(point);
    if (hit != null) {
      _inspect(hit);
      _activate(hit);
      return;
    }
    // Nothing hit. Small regions are hard to land on — Puducherry's enclaves are
    // a couple of pixels — so a tap in the empty space near one still counts.
    // This runs only after every polygon has missed, so the buffer can never take
    // a tap that belonged to a neighbouring state.
    final nearby = _smallRegionNear(point);
    if (nearby != null) {
      _inspect(nearby);
      _activate(nearby);
      return;
    }
    _inspect(null);
    widget.onBackgroundTap?.call();
  }

  void _handleHover(Offset local, Size size) {
    _inspect(_regionAt(ViewBoxFit.of(size).toViewBox(local)));
  }

  ChoroplethRegion? _smallRegionNear(Offset point) {
    final buffer = widget.smallRegionTapRadius;
    if (buffer <= 0) return null;

    ChoroplethRegion? best;
    var bestDistance = double.infinity;
    for (final region in _regions) {
      if (region.largestRingExtent <= 0 || region.largestRingExtent >= widget.smallRegionExtent) continue;
      var distance = double.infinity;
      for (final part in region.partBounds) {
        final d = _distanceToRect(point, part);
        if (d < distance) distance = d;
      }
      if (distance <= buffer && distance < bestDistance) {
        bestDistance = distance;
        best = region;
      }
    }
    return best;
  }

  /// Distance from a point to the nearest edge of a rect; zero when inside it.
  /// Measuring to the bounds rather than the centre matters for a scattered
  /// group like Lakshadweep, whose islands are spread across a tall box.
  static double _distanceToRect(Offset point, Rect rect) {
    final dx = (rect.left - point.dx).clamp(0.0, double.infinity) +
        (point.dx - rect.right).clamp(0.0, double.infinity);
    final dy = (rect.top - point.dy).clamp(0.0, double.infinity) +
        (point.dy - rect.bottom).clamp(0.0, double.infinity);
    return Offset(dx, dy).distance;
  }

  // ---------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final drilled = _drilledState;
    final isDrillRequested = drilled != null && _drillDownId != null;
    final showLoadStatus = isDrillRequested && (_districtsFor != _drillDownId || _loadError != null);
    final showEmptyStatus = !showLoadStatus && _regions.isEmpty;

    final Widget surface;
    if (widget.features.isEmpty) {
      return Semantics(label: 'No map data available.', child: const SizedBox.expand());
    } else if (showLoadStatus || showEmptyStatus) {
      surface = ChoroplethStatus(
        isError: _loadError != null,
        message: showEmptyStatus
            ? 'No district data is available for this state.'
            : _loadError != null
                ? 'Unable to load districts.'
                : _loading
                    ? 'Loading districts…'
                    : 'District data is unavailable for this state.',
      );
    } else {
      surface = _buildMap();
    }

    // The chrome is laid out first and the map takes what is left, so a bounded
    // box is filled exactly. Given an unbounded height instead, the map falls
    // back to the view box's own aspect ratio — the way the web renderers'
    // `height: auto` svg does — and the column sizes itself to its contents.
    return LayoutBuilder(builder: (context, constraints) {
      final bounded = constraints.hasBoundedHeight;
      return Column(
        mainAxisSize: bounded ? MainAxisSize.max : MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (widget.showBreadcrumb)
            ChoroplethBreadcrumb(drilledLabel: drilled?.label, onBack: widget.interactive ? _goBack : null),
          if (bounded)
            Expanded(child: surface)
          else
            AspectRatio(aspectRatio: kViewBox.width / kViewBox.height, child: surface),
          if (widget.showLegend)
            ChoroplethLegend(
              buckets: _buckets,
              activeBucket: _activeBucket,
              labels: widget.legendLabels,
              interactive: widget.interactive,
              formatValue: _formatValue,
              onPick: (index) => setState(() => _activeBucket = _activeBucket == index ? null : index),
              referenceLabel: _referenceRegions.isEmpty ? null : widget.referenceOverlayLegendLabel,
              referenceFill: widget.referenceOverlayFill,
            ),
        ],
      );
    });
  }

  Widget _buildMap() {
    return LayoutBuilder(
      builder: (context, constraints) {
        final size = Size(
          constraints.hasBoundedWidth ? constraints.maxWidth : kViewBox.width,
          constraints.hasBoundedHeight ? constraints.maxHeight : kViewBox.height,
        );
        final painter = _ChoroplethPainter(
          regions: _regions,
          referenceRegions: _referenceRegions,
          min: _min,
          max: _max,
          total: _total,
          colorScale: widget.colorScale,
          selectedId: widget.selectedId,
          inspectedId: _inspectedId,
          activeBucket: _activeBucket,
          canDrill: _canDrill,
          referenceOverlayFill: widget.referenceOverlayFill,
          referenceOverlayMergeIds: widget.referenceOverlayMergeIds.toSet(),
          borderColor: widget.borderColor,
          borderWidth: widget.borderWidth,
          selectionColor: widget.selectionColor,
          selectionWidth: widget.selectionWidth,
          showRegionValues: widget.showRegionValues,
          minRegionMarkerSize: widget.minRegionMarkerSize,
          minRegionMarkerOutline: widget.minRegionMarkerOutline,
          smallRegionExtent: widget.smallRegionExtent,
          regionLabelOffsets: widget.regionLabelOffsets,
          regionValueStyle: widget.regionValueStyle ?? _defaultValueStyle,
          formatValue: _formatValue,
        );

        Widget canvas = CustomPaint(size: size, painter: painter);
        if (widget.interactive) {
          canvas = MouseRegion(
            // Pointer devices get hover inspection, exactly as the web does.
            // Touch has no hover, which is why a tap inspects as well as selects.
            onHover: (event) => _handleHover(event.localPosition, size),
            onExit: (_) => _inspect(null),
            child: GestureDetector(
              onTapUp: (details) => _handleTapUp(details, size),
              child: canvas,
            ),
          );
        }

        final inspected = _inspected;
        final tooltip = !widget.showTooltip || !widget.interactive || inspected == null
            ? null
            : _buildTooltip(inspected, size);

        return SizedBox(
          key: kChoroplethSurfaceKey,
          width: size.width,
          height: size.height,
          child: Semantics(
            container: true,
            label: widget.semanticLabel,
            child: Stack(children: [canvas, if (tooltip != null) tooltip]),
          ),
        );
      },
    );
  }

  Widget? _buildTooltip(ChoroplethRegion region, Size size) {
    final insight = _insightFor(region);
    final content = widget.tooltipBuilder != null
        ? widget.tooltipBuilder!(insight)
        : ChoroplethTooltip(insight: insight, formatValue: _formatValue);
    if (content == null) return null;

    final fit = ViewBoxFit.of(size);
    final anchor = Offset(
      region.labelPoint.dx * fit.scale + fit.dx,
      region.labelPoint.dy * fit.scale + fit.dy,
    );
    return Positioned.fill(
      child: IgnorePointer(
        child: CustomSingleChildLayout(
          delegate: ChoroplethTooltipLayout(anchor),
          // Deliberately not a live region: the region's own semantics label
          // already carries name and value, and announcing the whole tooltip on
          // every hover was noise.
          child: ExcludeSemantics(child: content),
        ),
      ),
    );
  }
}

/// Angles to try when placing a small region's label, as turns from the
/// away-from-centre direction: straight out first, then progressively to either
/// side, and inward only as a last resort.
const List<double> _labelSearchTurns = [
  0,
  math.pi / 6,
  -math.pi / 6,
  math.pi / 3,
  -math.pi / 3,
  math.pi / 2,
  -math.pi / 2,
  2 * math.pi / 3,
  -2 * math.pi / 3,
  5 * math.pi / 6,
  -5 * math.pi / 6,
  math.pi,
];

/// 11px bold, matching the web renderers' region-value text.
const TextStyle _defaultValueStyle = TextStyle(
  fontSize: 11,
  fontWeight: FontWeight.w700,
  color: Color(0xFF081435),
  height: 1,
);

class _ChoroplethPainter extends CustomPainter {
  _ChoroplethPainter({
    required this.regions,
    required this.referenceRegions,
    required this.min,
    required this.max,
    required this.total,
    required this.colorScale,
    required this.selectedId,
    required this.inspectedId,
    required this.activeBucket,
    required this.canDrill,
    required this.referenceOverlayFill,
    required this.referenceOverlayMergeIds,
    required this.borderColor,
    required this.borderWidth,
    required this.selectionColor,
    required this.selectionWidth,
    required this.showRegionValues,
    required this.minRegionMarkerSize,
    required this.minRegionMarkerOutline,
    required this.smallRegionExtent,
    required this.regionLabelOffsets,
    required this.regionValueStyle,
    required this.formatValue,
  });

  final List<ChoroplethRegion> regions;
  final List<ChoroplethReferenceRegion> referenceRegions;
  final double min;
  final double max;
  final double total;
  final ColorScale colorScale;
  final String? selectedId;
  final String? inspectedId;
  final int? activeBucket;
  final bool canDrill;
  final ReferenceOverlayFill referenceOverlayFill;
  final Set<String> referenceOverlayMergeIds;
  final Color borderColor;
  final double borderWidth;
  final Color selectionColor;
  final double selectionWidth;
  final bool showRegionValues;
  final double minRegionMarkerSize;
  final Color minRegionMarkerOutline;
  final double smallRegionExtent;
  final Map<String, Offset> regionLabelOffsets;
  final TextStyle regionValueStyle;
  final String Function(double value) formatValue;

  /// True when a legend band is picked and this region is not in it.
  bool _isDulled(ChoroplethRegion region) =>
      activeBucket != null && swatchIndexOf(region.value, min, max, colorScale.colors.length) != activeBucket;

  /// CSS `grayscale(1)` then `opacity`, worked out per colour rather than by
  /// filtering a layer: the canvas draws each region's fill and border as
  /// separate operations, and a layer-wide opacity would need a saveLayer for
  /// every one of them.
  ///
  /// Greyed as well as faded because fading alone does not separate the pale end
  /// of a ramp: a dark fill at low opacity lands on roughly the same light grey
  /// as a pale fill at full opacity, so picking the lightest band would leave the
  /// map reading as though nothing had been picked.
  static Color _dull(Color color) {
    final grey = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
    return Color.from(alpha: color.a * 0.25, red: grey, green: grey, blue: grey);
  }

  @override
  void paint(Canvas canvas, Size size) {
    final fit = ViewBoxFit.of(size);
    canvas.save();
    canvas.translate(fit.dx, fit.dy);
    canvas.scale(fit.scale);

    _paintReference(canvas);

    final fill = Paint()..style = PaintingStyle.fill;
    final stroke = Paint()
      ..style = PaintingStyle.stroke
      // Divide by the canvas scale so borders stay a constant on-screen width,
      // the same as SVG's vector-effect: non-scaling-stroke.
      ..strokeWidth = borderWidth / fit.scale
      ..strokeJoin = StrokeJoin.round;

    for (final region in regions) {
      final dulled = _isDulled(region);
      final color = colorScale.colorFor(region.value, min, max);
      fill.color = dulled ? _dull(color) : color;
      // The border has to fade with its fill. Dulling only the fill would leave
      // a full-strength white mesh drawn over grey.
      stroke.color = dulled
          ? _dull(borderColor)
          : referenceOverlayMergeIds.contains(region.id)
              ? const Color(0x00000000)
              : borderColor;

      // The survivors of a filter are lifted off the page, so the picked band
      // reads as a group even where its own colour is nearly white. A shadow
      // rather than a heavier outline: strokes here are non-scaling, so a 2px
      // dark edge around one of Lakshadweep's one-unit islands swallows it whole.
      if (activeBucket != null && !dulled) {
        canvas.save();
        canvas.translate(0, 2 / fit.scale);
        canvas.drawPath(
          region.path,
          Paint()
            ..color = const Color(0x47081435)
            ..maskFilter = MaskFilter.blur(BlurStyle.normal, 3 / fit.scale),
        );
        canvas.restore();
      }

      canvas.drawPath(region.path, fill);
      canvas.drawPath(region.path, stroke);

      // A region whose largest part is smaller than the marker would otherwise
      // be invisible and untappable. The marker stands in for it at the same
      // colour, so it still reads as part of the choropleth.
      if (_needsMarker(region)) {
        canvas.drawCircle(region.labelPoint, minRegionMarkerSize / 2, fill);
        canvas.drawCircle(
          region.labelPoint,
          minRegionMarkerSize / 2,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = borderWidth / fit.scale
            ..color = dulled ? _dull(minRegionMarkerOutline) : minRegionMarkerOutline,
        );
      }
    }

    // Drawn after every region so a later neighbour can't paint over it. The web
    // adds a 2px lift to this as well, which is a CSS transform with no cheap
    // equivalent here; the darkened edge and the shadow carry it instead.
    final inspected = _regionById(inspectedId);
    if (inspected != null) {
      canvas.save();
      canvas.translate(0, 3 / fit.scale);
      canvas.drawPath(
        inspected.path,
        Paint()
          ..color = const Color(0x24081435)
          ..maskFilter = MaskFilter.blur(BlurStyle.normal, 4 / fit.scale),
      );
      canvas.restore();
      canvas.drawPath(
        inspected.path,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2 / fit.scale
          ..strokeJoin = StrokeJoin.round
          ..color = const Color(0xFF0F1B38),
      );
    }

    final selected = _regionById(selectedId);
    if (selected != null) {
      final halo = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = selectionWidth * 2 / fit.scale
        ..strokeJoin = StrokeJoin.round
        ..color = borderColor;
      final ring = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = selectionWidth / fit.scale
        ..strokeJoin = StrokeJoin.round
        ..color = selectionColor;
      canvas.drawPath(selected.path, halo);
      canvas.drawPath(selected.path, ring);
    }

    if (showRegionValues) _paintValues(canvas);

    _paintReferenceOutline(canvas, fit);
    canvas.restore();
  }

  /// Non-statistical context, drawn under the data and never dulled by a filter:
  /// it carries no value, so it is in no band.
  void _paintReference(Canvas canvas) {
    for (final region in referenceRegions) {
      canvas.drawPath(region.path, Paint()..color = const Color(0xFFEEF1F3));
      if (referenceOverlayFill != ReferenceOverlayFill.hatch) continue;
      canvas.save();
      canvas.clipPath(region.path);
      final bounds = region.path.getBounds();
      // In view-box units, not screen pixels: the web draws this from a
      // userSpaceOnUse pattern with no non-scaling-stroke, so its hatch thickens
      // with the map. The dashed outline below does carry non-scaling-stroke,
      // which is why that one is divided by the scale and this one is not.
      final hatch = Paint()
        ..color = const Color(0xFF9BA8AF)
        ..strokeWidth = 2;
      for (var x = bounds.left - bounds.height; x < bounds.right; x += 8) {
        canvas.drawLine(Offset(x, bounds.bottom), Offset(x + bounds.height, bounds.top), hatch);
      }
      canvas.restore();
    }
  }

  void _paintReferenceOutline(Canvas canvas, ViewBoxFit fit) {
    if (referenceRegions.isEmpty) return;
    final outline = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6 / fit.scale
      ..color = const Color(0xFF6F7D85);
    for (final region in referenceRegions) {
      canvas.drawPath(region.path, outline);
    }
  }

  /// Values are drawn inside the scaled canvas, so they grow and shrink with the
  /// map — the same behaviour as a font-size inside an SVG view box.
  void _paintValues(Canvas canvas) {
    for (final region in regions) {
      if (region.bounds.isEmpty) continue; // nothing to label
      final text = region.value == null ? '—' : formatValue(region.value!);
      final dulled = _isDulled(region);
      final style = dulled
          ? regionValueStyle.copyWith(color: _dull(regionValueStyle.color ?? const Color(0xFF081435)))
          : regionValueStyle;

      final painter = TextPainter(
        text: TextSpan(text: text, style: style),
        textDirection: TextDirection.ltr,
        textAlign: TextAlign.center,
      )..layout();

      final fitsInside = painter.width <= region.bounds.width && painter.height <= region.bounds.height;
      final isSmall = region.largestRingExtent > 0 && region.largestRingExtent < smallRegionExtent;

      // Moving a label outside only helps when there is empty space to move it
      // into. Goa, Lakshadweep and Andaman & Nicobar have open sea beside them;
      // Delhi and Chandigarh are ringed by other states, so pushing their numbers
      // out would drop them on a neighbour. Test the destination before using it.
      final outside = isSmall ? _outsideLabelCentre(region, painter) : null;
      final outsideIsClear = outside != null;

      Offset centre;
      if (!outsideIsClear && fitsInside) {
        centre = region.labelPoint;
      } else if (!outsideIsClear) {
        continue; // too small to hold its number, nowhere clear to put it
      } else {
        // Too small to hold its own number: put it in the empty space beside the
        // region instead of on top of it, and draw a leader so the pairing is
        // unambiguous. The direction is away from the middle of the map, which
        // for a coastal or island region means out to sea — Goa to the west,
        // Lakshadweep to the south-west, Andaman & Nicobar to the east.
        centre = outside;
        final anchor = region.labelPoint;
        final toward = (centre - anchor);
        if (toward.distance > 0) {
          final gap = math.max(region.largestRingExtent, minRegionMarkerSize) / 2 + 1;
          final start = anchor + toward / toward.distance * gap;
          final end = centre - toward / toward.distance * (painter.width / 2 + 1.5);
          if ((end - start).distance > 1) {
            canvas.drawLine(
              start,
              end,
              Paint()
                ..style = PaintingStyle.stroke
                ..strokeWidth = 0.8
                ..color = dulled ? _dull(minRegionMarkerOutline) : minRegionMarkerOutline,
            );
          }
        }
      }

      final origin = centre - Offset(painter.width / 2, painter.height / 2);
      // A halo behind the glyphs keeps them readable on both pale and dark fills,
      // standing in for SVG's paint-order: stroke.
      final haloed = TextPainter(
        text: TextSpan(
          text: text,
          style: style.copyWith(
            foreground: Paint()
              ..style = PaintingStyle.stroke
              ..strokeWidth = 2.5
              ..strokeJoin = StrokeJoin.round
              ..color = Color.from(alpha: dulled ? 0.25 : 0.82, red: 1, green: 1, blue: 1),
          ),
        ),
        textDirection: TextDirection.ltr,
        textAlign: TextAlign.center,
      )..layout();
      haloed.paint(canvas, origin);
      painter.paint(canvas, origin);
    }
  }

  /// True when a label centred at [point] would sit on top of a different
  /// region — checked at the label's corners as well as its centre, so a number
  /// that only clips a neighbour still counts as blocked.
  bool _overlapsAnotherRegion(ChoroplethRegion region, Offset point, TextPainter painter) {
    final half = Offset(painter.width / 2, painter.height / 2);
    final probes = <Offset>[
      point,
      point - half,
      point + half,
      point + Offset(half.dx, -half.dy),
      point + Offset(-half.dx, half.dy),
    ];
    for (final other in regions) {
      if (identical(other, region)) continue;
      for (final probe in probes) {
        if (other.path.contains(probe)) return true;
      }
    }
    return false;
  }

  /// Push a small region's label outside its shape, away from the centre of the
  /// map, then keep it inside the view box so an edge region's number is not
  /// pushed off screen. An explicit entry in [regionLabelOffsets] wins.
  Offset? _outsideLabelCentre(ChoroplethRegion region, TextPainter painter) {
    final override = regionLabelOffsets[region.id];
    if (override != null) return region.labelPoint + override;

    // Start pointing away from the middle of the map, then fan out. One fixed
    // direction is not enough: Puducherry sits south-east of centre, so the
    // radial direction runs inland into Tamil Nadu while its open sea is due
    // east. Trying a spread of angles finds whichever side is actually clear.
    final fromCentre = region.labelPoint - Offset(kViewBox.width / 2, kViewBox.height / 2);
    final base = fromCentre.distance == 0 ? 0.0 : math.atan2(fromCentre.dy, fromCentre.dx);
    final clearance = math.max(region.largestRingExtent, minRegionMarkerSize) / 2 + 4 + painter.width / 2;

    for (final turn in _labelSearchTurns) {
      final angle = base + turn;
      final placed = region.labelPoint + Offset(math.cos(angle), math.sin(angle)) * clearance;
      final clamped = Offset(
        placed.dx.clamp(painter.width / 2, kViewBox.width - painter.width / 2),
        placed.dy.clamp(painter.height / 2, kViewBox.height - painter.height / 2),
      );
      if (!_overlapsAnotherRegion(region, clamped, painter)) return clamped;
    }
    return null; // hemmed in on every side — the caller keeps the label inside
  }

  bool _needsMarker(ChoroplethRegion region) =>
      minRegionMarkerSize > 0 &&
      region.largestRingExtent > 0 &&
      region.largestRingExtent < minRegionMarkerSize;

  ChoroplethRegion? _regionById(String? id) {
    if (id == null) return null;
    for (final region in regions) {
      if (region.id == id) return region;
    }
    return null;
  }

  /// One semantics node per region, so a screen reader can explore the map
  /// region by region instead of hitting one opaque image.
  @override
  SemanticsBuilderCallback get semanticsBuilder => (Size size) {
        final fit = ViewBoxFit.of(size);
        final action = canDrill ? 'Activate to view districts.' : 'Activate to select.';
        return [
          // A region the source has no geometry for has an empty rect. Flutter
          // rejects zero-size semantics nodes, and rightly so: announcing a
          // button nobody can reach or see is worse than omitting it.
          for (final region in regions.where((r) => !r.bounds.isEmpty))
            CustomPainterSemantics(
              rect: Rect.fromLTWH(
                region.bounds.left * fit.scale + fit.dx,
                region.bounds.top * fit.scale + fit.dy,
                region.bounds.width * fit.scale,
                region.bounds.height * fit.scale,
              ),
              properties: SemanticsProperties(
                label: '${region.label}, '
                    '${region.value == null ? "No data" : formatValue(region.value!)}. $action',
                selected: region.id == selectedId,
                button: true,
                textDirection: TextDirection.ltr,
              ),
            ),
          for (final region in referenceRegions)
            if (!region.path.getBounds().isEmpty)
              CustomPainterSemantics(
                rect: Rect.fromLTWH(
                  region.path.getBounds().left * fit.scale + fit.dx,
                  region.path.getBounds().top * fit.scale + fit.dy,
                  region.path.getBounds().width * fit.scale,
                  region.path.getBounds().height * fit.scale,
                ),
                properties: SemanticsProperties(
                  label: '${region.label}.${region.description.isEmpty ? "" : " ${region.description}"}',
                  image: true,
                  textDirection: TextDirection.ltr,
                ),
              ),
        ];
      };

  @override
  bool shouldRepaint(_ChoroplethPainter old) =>
      !identical(old.regions, regions) ||
      !identical(old.referenceRegions, referenceRegions) ||
      old.min != min ||
      old.max != max ||
      old.total != total ||
      old.selectedId != selectedId ||
      old.inspectedId != inspectedId ||
      old.activeBucket != activeBucket ||
      old.canDrill != canDrill ||
      old.referenceOverlayFill != referenceOverlayFill ||
      old.referenceOverlayMergeIds != referenceOverlayMergeIds ||
      old.colorScale != colorScale ||
      old.borderColor != borderColor ||
      old.borderWidth != borderWidth ||
      old.selectionColor != selectionColor ||
      old.selectionWidth != selectionWidth ||
      old.showRegionValues != showRegionValues ||
      old.minRegionMarkerSize != minRegionMarkerSize ||
      old.minRegionMarkerOutline != minRegionMarkerOutline ||
      old.smallRegionExtent != smallRegionExtent ||
      old.regionLabelOffsets != regionLabelOffsets ||
      old.regionValueStyle != regionValueStyle;

  @override
  bool shouldRebuildSemantics(_ChoroplethPainter old) =>
      !identical(old.regions, regions) ||
      !identical(old.referenceRegions, referenceRegions) ||
      old.selectedId != selectedId ||
      old.canDrill != canDrill;
}
