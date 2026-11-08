import 'dart:ui';

import 'package:flutter/widgets.dart';

import 'motion.dart';
import 'shaders/backdrop_painter.dart';
import 'shaders/shader_library.dart';
import 'tokens.dart';

/// The always-dark stage every page stands on: the shader backdrop, lit in
/// [accent], under the one `BackdropGroup` that every glass card above it
/// shares.
class CinematicStage extends StatelessWidget {
  const CinematicStage({super.key, required this.accent, required this.child});

  final Color accent;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return BackdropGroup(
      child: Stack(
        fit: StackFit.expand,
        children: <Widget>[
          CinematicBackdrop(accent: accent),
          child,
        ],
      ),
    );
  }
}

/// The backdrop alone. Its accent eases to a new one, or jumps while motion
/// is reduced.
class CinematicBackdrop extends StatefulWidget {
  const CinematicBackdrop({super.key, required this.accent});

  final Color accent;

  @override
  State<CinematicBackdrop> createState() => _CinematicBackdropState();
}

class _CinematicBackdropState extends State<CinematicBackdrop> {
  FragmentProgram? _program;
  FragmentShader? _shader;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final FragmentProgram? program = ShaderLibrary.of(context).backdrop;
    if (program == _program) {
      return;
    }

    _shader?.dispose();
    _program = program;
    _shader = program?.fragmentShader();
  }

  @override
  void dispose() {
    _shader?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final MotionState motion = MotionScope.of(context);
    return RepaintBoundary(
      child: TweenAnimationBuilder<Color?>(
        tween: ColorTween(end: widget.accent),
        duration: motion.isReduced ? Duration.zero : MotionTokens.accentShift,
        curve: MotionTokens.accentShiftCurve,
        builder: (BuildContext context, Color? accent, Widget? child) {
          return CustomPaint(
            size: Size.infinite,
            isComplex: true,
            willChange: _shader != null,
            painter: BackdropPainter(
              shader: _shader,
              ambientTime: MotionScope.ambientTimeOf(context),
              accent: accent ?? widget.accent,
            ),
          );
        },
      ),
    );
  }
}
