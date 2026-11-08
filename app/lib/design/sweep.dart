import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import 'motion.dart';
import 'tokens.dart';

/// The scan's live sweep: a band of [accent] light that passes over
/// [child] again and again while [isSweeping]. It is off while motion is
/// reduced, and stands still while the window is hidden.
class ScanSweep extends StatelessWidget {
  const ScanSweep({super.key, required this.isSweeping, required this.accent, required this.child});

  final bool isSweeping;
  final Color accent;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!isSweeping || MotionScope.of(context).isReduced) {
      return child;
    }

    return CustomPaint(
      foregroundPainter: ScanSweepPainter(accent: accent, ambientTime: MotionScope.ambientTimeOf(context)),
      child: child,
    );
  }
}

/// Paints the sweep's band where the ambient time puts it in its period.
class ScanSweepPainter extends CustomPainter {
  ScanSweepPainter({required this.accent, required this.ambientTime}) : super(repaint: ambientTime);

  final Color accent;
  final ValueListenable<double> ambientTime;

  /// The band's width as a share of the swept width.
  static const double _bandShare = 0.35;

  @override
  void paint(Canvas canvas, Size size) {
    final double phase = getAmbientLoopPhase(ambientTime.value, MotionTokens.sweepPeriod);
    final double bandWidth = size.width * _bandShare;
    final double bandLeft = -bandWidth + phase * (size.width + bandWidth);
    final Rect band = Rect.fromLTWH(bandLeft, 0, bandWidth, size.height);
    final Paint light = Paint()
      ..blendMode = BlendMode.plus
      ..shader = LinearGradient(
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
        colors: <Color>[
          accent.withValues(alpha: 0),
          accent.withValues(alpha: 0.10),
          const Color(0x2EFFFFFF),
          accent.withValues(alpha: 0.10),
          accent.withValues(alpha: 0),
        ],
        stops: const <double>[0, 0.35, 0.5, 0.65, 1],
        transform: const GradientRotation(0.18),
      ).createShader(band);
    canvas.save();
    canvas.clipRect(Offset.zero & size);
    canvas.drawRect(band, light);
    canvas.restore();
  }

  @override
  bool shouldRepaint(ScanSweepPainter oldDelegate) =>
      oldDelegate.accent != accent || oldDelegate.ambientTime != ambientTime;
}
