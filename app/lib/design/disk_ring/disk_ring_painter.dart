import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/rendering.dart';

import '../tokens.dart';
import 'disk_ring_arcs.dart';

/// The ring's size within the square it is painted in.
@immutable
class DiskRingGeometry {
  const DiskRingGeometry({required this.radius, required this.strokeWidth, required this.glowReach});

  factory DiskRingGeometry.fit(Size size) {
    final double side = size.shortestSide;
    final double strokeWidth = side * 0.072;
    final double glowReach = strokeWidth * 1.4;
    return DiskRingGeometry(
      radius: side / 2 - strokeWidth / 2 - glowReach * 1.6,
      strokeWidth: strokeWidth,
      glowReach: glowReach,
    );
  }

  final double radius;
  final double strokeWidth;
  final double glowReach;
}

/// Paints the disk ring as a lit gauge: the `ring_glow.frag` shader through
/// [Paint.shader] when [shader] is given, else plain arcs with no glow,
/// no shimmer and no sweep.
class DiskRingPainter extends CustomPainter {
  DiskRingPainter({
    required this.arcs,
    required this.accent,
    required this.shader,
    required this.ambientTime,
    required this.isSweeping,
  }) : super(repaint: shader == null ? null : ambientTime);

  final DiskRingArcs arcs;
  final Color accent;
  final FragmentShader? shader;
  final ValueListenable<double> ambientTime;

  /// The scan sweep circles the ring; the caller turns it off while motion is reduced.
  final bool isSweeping;

  /// The glow's strength, as the shader's `uAccent.a`.
  static const double _glowStrength = 1;

  @override
  void paint(Canvas canvas, Size size) {
    final DiskRingGeometry geometry = DiskRingGeometry.fit(size);
    final FragmentShader? ringShader = shader;
    if (ringShader == null) {
      _paintRingFallback(canvas, size, geometry);
      return;
    }

    ringShader
      ..setFloat(0, size.width)
      ..setFloat(1, size.height)
      ..setFloat(2, ambientTime.value)
      ..setFloat(3, geometry.radius)
      ..setFloat(4, geometry.strokeWidth)
      ..setFloat(5, geometry.glowReach)
      ..setFloat(6, isSweeping ? _findSweepHead() : -1)
      ..setFloat(7, arcs.keptEnd)
      ..setFloat(8, arcs.freeableEnd)
      ..setFloat(9, accent.r)
      ..setFloat(10, accent.g)
      ..setFloat(11, accent.b)
      ..setFloat(12, _glowStrength);
    canvas.drawRect(Offset.zero & size, Paint()..shader = ringShader);
  }

  double _findSweepHead() {
    final double periodSeconds = MotionTokens.ringSweepPeriod.inMicroseconds / Duration.microsecondsPerSecond;
    return (ambientTime.value / periodSeconds) % 1;
  }

  void _paintRingFallback(Canvas canvas, Size size, DiskRingGeometry geometry) {
    final Rect circle = Rect.fromCircle(center: size.center(Offset.zero), radius: geometry.radius);
    const double topAngle = -math.pi / 2;
    final Paint track = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = geometry.strokeWidth
      ..color = StageColors.diskAvailable;
    canvas.drawArc(circle, 0, math.pi * 2, false, track);

    if (arcs.keptEnd > 0) {
      final Paint used = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = geometry.strokeWidth
        ..color = StageColors.diskUsed;
      canvas.drawArc(circle, topAngle, arcs.keptEnd * math.pi * 2, false, used);
    }

    final double freeableSweep = (arcs.freeableEnd - arcs.keptEnd) * math.pi * 2;
    if (freeableSweep > 0) {
      final Paint freeable = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = geometry.strokeWidth
        ..strokeCap = StrokeCap.round
        ..color = accent;
      canvas.drawArc(circle, topAngle + arcs.keptEnd * math.pi * 2, freeableSweep, false, freeable);
    }
  }

  @override
  bool shouldRepaint(DiskRingPainter oldDelegate) =>
      oldDelegate.arcs != arcs ||
      oldDelegate.accent != accent ||
      oldDelegate.shader != shader ||
      oldDelegate.ambientTime != ambientTime ||
      oldDelegate.isSweeping != isSweeping;
}
