import 'dart:math' as math;

import 'package:flutter/widgets.dart';

import 'motion.dart';
import 'tokens.dart';

/// Dissolves [child] into rising motes of [accent] once [isDissolved]
/// turns true: a wipe crosses it from left to right and sheds the motes at
/// its front. While motion is reduced it is a plain fade. The child keeps
/// its space; [onDissolved] runs when it is gone.
class Dissolve extends StatefulWidget {
  const Dissolve({
    super.key,
    required this.isDissolved,
    required this.accent,
    required this.child,
    this.onDissolved,
  });

  final bool isDissolved;
  final Color accent;
  final Widget child;
  final VoidCallback? onDissolved;

  @override
  State<Dissolve> createState() => _DissolveState();
}

class _DissolveState extends State<Dissolve> with SingleTickerProviderStateMixin {
  late final AnimationController _progress = AnimationController(vsync: this);
  late final List<DissolveMote> _motes = _buildDissolveMotes(math.Random(identityHashCode(this)), 36);
  bool _isPlainFade = false;

  @override
  void initState() {
    super.initState();
    _progress.addStatusListener(_reportDissolved);
    if (widget.isDissolved) {
      _progress.value = 1;
    }
  }

  @override
  void didUpdateWidget(Dissolve oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.isDissolved == widget.isDissolved) {
      return;
    }

    if (!widget.isDissolved) {
      _progress.value = 0;
      return;
    }

    _isPlainFade = MotionScope.of(context).isReduced;
    _progress.duration = _isPlainFade ? MotionTokens.plainFade : MotionTokens.dissolve;
    _progress.forward(from: 0);
  }

  @override
  void dispose() {
    _progress.dispose();
    super.dispose();
  }

  void _reportDissolved(AnimationStatus status) {
    if (status == AnimationStatus.completed && widget.isDissolved) {
      widget.onDissolved?.call();
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _progress,
      child: widget.child,
      builder: (BuildContext context, Widget? child) {
        final double progress = _progress.value;
        if (progress == 0) {
          return child!;
        }

        if (_isPlainFade || progress == 1) {
          return Opacity(opacity: 1 - progress, child: child);
        }

        return CustomPaint(
          foregroundPainter: DissolveMotesPainter(motes: _motes, progress: progress, accent: widget.accent),
          child: ShaderMask(
            blendMode: BlendMode.dstIn,
            shaderCallback: (Rect bounds) => buildDissolveWipe(progress).createShader(bounds),
            child: child,
          ),
        );
      },
    );
  }
}

/// The share of the dissolve the wipe takes to cross; the motes it sheds
/// last live on for the rest.
const double dissolveWipeShare = 0.7;

/// The mask of the wipe at [progress]: opaque ahead of its front, clear
/// behind it, with a soft edge between.
LinearGradient buildDissolveWipe(double progress) {
  final double front = progress / dissolveWipeShare;
  const double softEdge = 0.12;
  return LinearGradient(
    colors: const <Color>[Color(0x00FFFFFF), Color(0xFFFFFFFF)],
    stops: <double>[
      (front - softEdge).clamp(0, 1).toDouble(),
      front.clamp(0, 1).toDouble(),
    ],
  );
}

/// One mote: where the wipe sheds it, as shares of the child's size, and
/// how it rises.
@immutable
class DissolveMote {
  const DissolveMote({
    required this.originX,
    required this.originY,
    required this.risePixels,
    required this.driftPixels,
    required this.radius,
  });

  final double originX;
  final double originY;
  final double risePixels;
  final double driftPixels;
  final double radius;
}

List<DissolveMote> _buildDissolveMotes(math.Random random, int count) {
  return List<DissolveMote>.generate(count, (int index) {
    return DissolveMote(
      originX: random.nextDouble(),
      originY: 0.15 + random.nextDouble() * 0.7,
      risePixels: 14 + random.nextDouble() * 34,
      driftPixels: (random.nextDouble() - 0.5) * 16,
      radius: 0.8 + random.nextDouble() * 1.8,
    );
  });
}

/// Paints the motes alive at [progress], each a hot core in a soft halo.
class DissolveMotesPainter extends CustomPainter {
  const DissolveMotesPainter({required this.motes, required this.progress, required this.accent});

  final List<DissolveMote> motes;
  final double progress;
  final Color accent;

  @override
  void paint(Canvas canvas, Size size) {
    const double lifeShare = 1 - dissolveWipeShare;
    final Paint halo = Paint()..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3);
    final Paint core = Paint();
    final Color hot = Color.lerp(accent, const Color(0xFFFFFFFF), 0.45)!;
    for (final DissolveMote mote in motes) {
      final double bornAt = mote.originX * dissolveWipeShare;
      final double age = (progress - bornAt) / lifeShare;
      if (age <= 0 || age >= 1) {
        continue;
      }

      final double eased = Curves.easeOut.transform(age);
      final double fade = 1 - age;
      final Offset position = Offset(
        mote.originX * size.width + mote.driftPixels * eased,
        mote.originY * size.height - mote.risePixels * eased,
      );
      halo.color = accent.withValues(alpha: 0.45 * fade);
      core.color = hot.withValues(alpha: 0.95 * fade);
      canvas.drawCircle(position, mote.radius * 2.6, halo);
      canvas.drawCircle(position, mote.radius, core);
    }
  }

  @override
  bool shouldRepaint(DissolveMotesPainter oldDelegate) =>
      oldDelegate.progress != progress || oldDelegate.accent != accent || oldDelegate.motes != motes;
}
