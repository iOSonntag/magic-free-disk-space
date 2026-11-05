import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/rendering.dart';

import '../tokens.dart';

/// Paints the stage: the `backdrop.frag` shader through [Paint.shader] when
/// [shader] is given, else a static gradient with no glow and no motion.
class BackdropPainter extends CustomPainter {
  BackdropPainter({required this.shader, required this.ambientTime, required this.accent})
    : super(repaint: shader == null ? null : ambientTime);

  final FragmentShader? shader;
  final ValueListenable<double> ambientTime;
  final Color accent;

  /// The accent's strength in the nebula, as the shader's `uAccent.a`.
  static const double _accentStrength = 1;

  @override
  void paint(Canvas canvas, Size size) {
    final Rect bounds = Offset.zero & size;
    final FragmentShader? stageShader = shader;
    if (stageShader == null) {
      _paintBackdropFallback(canvas, bounds, accent);
      return;
    }

    stageShader
      ..setFloat(0, size.width)
      ..setFloat(1, size.height)
      ..setFloat(2, ambientTime.value)
      ..setFloat(3, accent.r)
      ..setFloat(4, accent.g)
      ..setFloat(5, accent.b)
      ..setFloat(6, _accentStrength);
    canvas.drawRect(bounds, Paint()..shader = stageShader);
  }

  @override
  bool shouldRepaint(BackdropPainter oldDelegate) =>
      oldDelegate.shader != shader || oldDelegate.accent != accent || oldDelegate.ambientTime != ambientTime;
}

/// The stage without its shader: the night gradient, a still key light and
/// a faint pool of the accent.
void _paintBackdropFallback(Canvas canvas, Rect bounds, Color accent) {
  final Paint night = Paint()
    ..shader = const LinearGradient(
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
      colors: <Color>[StageColors.nightLifted, StageColors.night, StageColors.nightDeep],
      stops: <double>[0, 0.55, 1],
    ).createShader(bounds);
  canvas.drawRect(bounds, night);

  final Paint keyLight = Paint()
    ..shader = const RadialGradient(
      center: Alignment(0.6, -1.2),
      radius: 1.1,
      colors: <Color>[Color(0x2E4A63B5), Color(0x00000000)],
    ).createShader(bounds);
  canvas.drawRect(bounds, keyLight);

  final Paint accentPool = Paint()
    ..shader = RadialGradient(
      center: const Alignment(-0.7, 1.1),
      radius: 1.0,
      colors: <Color>[accent.withValues(alpha: 0.10), accent.withValues(alpha: 0)],
    ).createShader(bounds);
  canvas.drawRect(bounds, accentPool);
}
