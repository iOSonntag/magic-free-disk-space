import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

import 'motion.dart';
import 'tokens.dart';

/// A soft bloom of [accent] behind [child], reaching past its bounds. It
/// breathes on the ambient time, so it stands still while motion is
/// reduced or the window is hidden.
class SectionGlow extends StatelessWidget {
  const SectionGlow({super.key, required this.accent, required this.child, this.intensity = 1});

  final Color accent;
  final Widget child;

  /// The glow's strength, from 0 for none to 1 for full.
  final double intensity;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: SectionGlowPainter(
        accent: accent,
        intensity: intensity,
        ambientTime: MotionScope.ambientTimeOf(context),
      ),
      child: child,
    );
  }
}

/// Paints the bloom around the center of its size, breathing on the ambient time.
class SectionGlowPainter extends CustomPainter {
  SectionGlowPainter({required this.accent, required this.intensity, required this.ambientTime})
    : super(repaint: ambientTime);

  final Color accent;
  final double intensity;
  final ValueListenable<double> ambientTime;

  @override
  void paint(Canvas canvas, Size size) {
    final double phase = ambientTime.value * GlowTokens.breathPerSecond * 2 * math.pi;
    final double breath = 1 - GlowTokens.breathDepth / 2 + GlowTokens.breathDepth / 2 * math.sin(phase);
    final double strength = intensity * breath;
    final Offset center = size.center(Offset.zero);
    final double radius = size.shortestSide / 2 * GlowTokens.tileHaloScale;
    final Rect bounds = Rect.fromCircle(center: center, radius: radius);
    final Paint bloom = Paint()
      ..shader = RadialGradient(
        colors: <Color>[
          accent.withValues(alpha: GlowTokens.coreAlpha * strength),
          accent.withValues(alpha: GlowTokens.haloAlpha * strength),
          accent.withValues(alpha: 0),
        ],
        stops: const <double>[0, 0.45, 1],
      ).createShader(bounds);
    canvas.drawCircle(center, radius, bloom);
  }

  @override
  bool shouldRepaint(SectionGlowPainter oldDelegate) =>
      oldDelegate.accent != accent || oldDelegate.intensity != intensity || oldDelegate.ambientTime != ambientTime;
}
