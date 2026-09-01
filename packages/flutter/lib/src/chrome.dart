import 'package:flutter/material.dart';

import 'legend.dart';
import 'model.dart';
import 'tooltip_position.dart';

/// The furniture around the map: breadcrumb, legend, tooltip, status.
///
/// Split out of the widget file so the renderer stays about geometry. Every
/// string here is copied from the web packages verbatim rather than paraphrased
/// — a reader moving between the React, DOM and Flutter maps should not have to
/// notice which one they are looking at.

/// Space between the anchor and the tooltip edge. Mirrors the .75rem in style.css.
const double kTooltipGap = 12;

const Color _text = Color(0xFF081435);
const Color _muted = Color(0xFF53617B);
const Color _line = Color(0xFFDCE3E7);
const Color _accent = Color(0xFFFF725F);
const Color _focus = Color(0xFF0F766E);

String ordinal(int n) {
  final lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return '${n}th';
  const suffixes = ['th', 'st', 'nd', 'rd'];
  return '$n${n % 10 < suffixes.length ? suffixes[n % 10] : 'th'}';
}

/// Where the map sits in the hierarchy, and the way back out.
class ChoroplethBreadcrumb extends StatelessWidget {
  const ChoroplethBreadcrumb({
    super.key,
    required this.drilledLabel,
    required this.onBack,
    this.subDrilledLabel,
    this.onBackToDistricts,
  });

  final String? drilledLabel;
  final VoidCallback? onBack;

  /// The sub-district being shown, when the map is a level deeper. Null renders
  /// exactly the two-level trail this widget has always drawn, so a host that
  /// never drills that far sees no change.
  final String? subDrilledLabel;

  /// Back to the district level. Null falls back to a plain, unlinked crumb —
  /// the same way [onBack] does for a non-interactive map.
  final VoidCallback? onBackToDistricts;

  @override
  Widget build(BuildContext context) {
    final label = drilledLabel;
    return SizedBox(
      height: 40,
      child: Semantics(
        container: true,
        label: 'Map hierarchy',
        child: Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            if (label == null)
              const Text('All states', style: TextStyle(color: _muted, fontSize: 14, fontWeight: FontWeight.w500))
            else ...[
              TextButton(
                onPressed: onBack,
                style: TextButton.styleFrom(
                  foregroundColor: _focus,
                  padding: const EdgeInsets.all(6),
                  minimumSize: const Size(0, 32),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text('All states', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
              ),
              const Text(' / ', style: TextStyle(color: _muted, fontSize: 14)),
              if (subDrilledLabel == null)
                Text(label, style: const TextStyle(color: _text, fontSize: 14, fontWeight: FontWeight.w500))
              else ...[
                TextButton(
                  onPressed: onBackToDistricts,
                  style: TextButton.styleFrom(
                    foregroundColor: _focus,
                    padding: const EdgeInsets.all(6),
                    minimumSize: const Size(0, 32),
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: Text(label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
                ),
                const Text(' / ', style: TextStyle(color: _muted, fontSize: 14)),
                Text(subDrilledLabel!,
                    style: const TextStyle(color: _text, fontSize: 14, fontWeight: FontWeight.w500)),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

/// The colour ramp, and — when the map is interactive — a filter.
///
/// Each swatch highlights the regions painted in it and dulls the rest. A band
/// no region falls in stays at full strength, because the ramp is continuous and
/// fading one stop out of the middle of it reads as a broken legend; it is inert
/// instead, since filtering to nothing would just dim the whole map.
class ChoroplethLegend extends StatelessWidget {
  const ChoroplethLegend({
    super.key,
    required this.buckets,
    required this.activeBucket,
    required this.labels,
    required this.interactive,
    required this.formatValue,
    required this.onPick,
    this.referenceLabel,
    this.referenceFill,
  });

  final List<LegendBucket> buckets;
  final int? activeBucket;
  final (String, String) labels;
  final bool interactive;
  final String Function(double value) formatValue;
  final void Function(int index) onPick;

  /// Shown beside a key for the reference overlay, when one is drawn.
  final String? referenceLabel;
  final ReferenceOverlayFill? referenceFill;

  @override
  Widget build(BuildContext context) {
    const style = TextStyle(color: _muted, fontSize: 13, fontWeight: FontWeight.w400);
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Wrap(
        alignment: WrapAlignment.center,
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 12,
        runSpacing: 8,
        children: [
          Text(labels.$1, style: style),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final bucket in buckets)
                Padding(
                  padding: EdgeInsets.only(left: bucket.index == 0 ? 0 : 4),
                  child: _Swatch(
                    bucket: bucket,
                    active: activeBucket == bucket.index,
                    muted: activeBucket != null && activeBucket != bucket.index,
                    interactive: interactive,
                    description: legendBucketLabel(bucket, formatValue),
                    onPick: () => onPick(bucket.index),
                  ),
                ),
            ],
          ),
          Text(labels.$2, style: style),
          if (referenceLabel != null) ...[
            _ReferenceKey(fill: referenceFill ?? ReferenceOverlayFill.hatch),
            Text(referenceLabel!, style: style),
          ],
        ],
      ),
    );
  }
}

class _Swatch extends StatelessWidget {
  const _Swatch({
    required this.bucket,
    required this.active,
    required this.muted,
    required this.interactive,
    required this.description,
    required this.onPick,
  });

  final LegendBucket bucket;
  final bool active;
  final bool muted;
  final bool interactive;
  final String description;
  final VoidCallback onPick;

  @override
  Widget build(BuildContext context) {
    // The bar keeps the same 12px height it has on the web; the padding above and
    // below lifts the tap target to 24 without changing the legend's own height.
    final bar = Opacity(
      opacity: muted ? 0.3 : 1,
      child: Container(
        width: 44,
        height: 12,
        decoration: BoxDecoration(
          color: bucket.color,
          borderRadius: BorderRadius.circular(2),
          border: active ? Border.all(color: _accent, width: 2) : null,
        ),
      ),
    );
    if (!interactive) return bar;

    return Semantics(
      button: true,
      enabled: bucket.matches > 0,
      toggled: active,
      label: description,
      child: Tooltip(
        message: description,
        // A band no region falls in is inert — it filters to nothing, so it has
        // no onTap — and the cursor says so rather than inviting a dead click.
        child: MouseRegion(
          cursor: bucket.matches == 0 ? SystemMouseCursors.forbidden : SystemMouseCursors.click,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: bucket.matches == 0 ? null : onPick,
            child: Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: bar),
          ),
        ),
      ),
    );
  }
}

class _ReferenceKey extends StatelessWidget {
  const _ReferenceKey({required this.fill});

  final ReferenceOverlayFill fill;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: 16,
        height: 12,
        child: CustomPaint(painter: _ReferenceKeyPainter(fill)),
      );
}

class _ReferenceKeyPainter extends CustomPainter {
  _ReferenceKeyPainter(this.fill);

  final ReferenceOverlayFill fill;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    canvas.drawRect(rect, Paint()..color = const Color(0xFFEEF1F3));
    if (fill == ReferenceOverlayFill.hatch) {
      canvas.save();
      canvas.clipRect(rect);
      final hatch = Paint()
        ..color = const Color(0xFF9BA8AF)
        ..strokeWidth = 1;
      for (var x = -size.height; x < size.width; x += 4) {
        canvas.drawLine(Offset(x, size.height), Offset(x + size.height, 0), hatch);
      }
      canvas.restore();
    }
    canvas.drawRect(
      rect,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1
        ..color = const Color(0xFF6F7D85),
    );
  }

  @override
  bool shouldRepaint(_ReferenceKeyPainter old) => old.fill != fill;
}

/// The default tooltip: name, value, and how the region sits against the rest.
class ChoroplethTooltip extends StatelessWidget {
  const ChoroplethTooltip({super.key, required this.insight, required this.formatValue});

  final ChoroplethInsight insight;
  final String Function(double value) formatValue;

  @override
  Widget build(BuildContext context) {
    final share = insight.share;
    final rank = insight.rank;
    return Container(
      constraints: const BoxConstraints(minWidth: 128),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFFFF),
        border: Border.all(color: const Color(0xFFB8C2CE)),
        borderRadius: BorderRadius.circular(10),
        boxShadow: const [BoxShadow(color: Color(0x1C081435), blurRadius: 20, offset: Offset(0, 8))],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(insight.region.label,
              style: const TextStyle(color: _text, fontSize: 14, fontWeight: FontWeight.w700)),
          const SizedBox(height: 3),
          // Same wording as the region's own semantics label, so the two never disagree.
          Text(insight.region.value == null ? 'No data' : formatValue(insight.region.value!),
              style: const TextStyle(color: _text, fontSize: 19, fontWeight: FontWeight.w700)),
          if (share != null) ...[
            const SizedBox(height: 5),
            // The bar repeats the number beside it, so it is decorative and
            // hidden from assistive tech.
            ExcludeSemantics(
              child: SizedBox(
                width: 128,
                height: 5,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(5),
                  child: Stack(children: [
                    Container(color: const Color(0xFFE7EDF0)),
                    FractionallySizedBox(
                      widthFactor: (share < 1.5 ? 1.5 : share) / 100,
                      child: Container(color: _accent),
                    ),
                  ]),
                ),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              [
                '${share.toStringAsFixed(1)}% of total',
                if (rank != null) '${ordinal(rank)} of ${insight.rankedCount}',
              ].join(' · '),
              style: const TextStyle(color: _muted, fontSize: 12),
            ),
          ],
        ],
      ),
    );
  }
}

/// Places the tooltip above its anchor, nudged to stay inside the map — the same
/// correction the web renderers apply, through the same [placeTooltip].
class ChoroplethTooltipLayout extends SingleChildLayoutDelegate {
  const ChoroplethTooltipLayout(this.anchor);

  /// The region's label point, in the map surface's own coordinates.
  final Offset anchor;

  @override
  BoxConstraints getConstraintsForChild(BoxConstraints constraints) => constraints.loosen();

  @override
  Offset getPositionForChild(Size size, Size childSize) {
    final left = anchor.dx - childSize.width / 2;
    final top = anchor.dy - kTooltipGap - childSize.height;
    final placement = placeTooltip(
      Rect.fromLTWH(left, top, childSize.width, childSize.height),
      Offset.zero & size,
      kTooltipGap,
    );
    return Offset(
      left + placement.dx,
      placement.side == TooltipSide.below ? anchor.dy + kTooltipGap : top,
    );
  }

  @override
  bool shouldRelayout(ChoroplethTooltipLayout old) => old.anchor != anchor;
}

/// Loading, error and empty states, worded exactly as the web packages word them.
class ChoroplethStatus extends StatelessWidget {
  const ChoroplethStatus({super.key, required this.message, required this.isError});

  final String message;
  final bool isError;

  @override
  Widget build(BuildContext context) => Semantics(
        liveRegion: isError,
        child: Container(
          constraints: const BoxConstraints(minHeight: 256),
          padding: const EdgeInsets.all(32),
          decoration: BoxDecoration(border: Border.all(color: _line, style: BorderStyle.solid)),
          alignment: Alignment.center,
          child: Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(color: _muted, fontSize: 15, fontWeight: FontWeight.w500, height: 1.5),
          ),
        ),
      );
}
