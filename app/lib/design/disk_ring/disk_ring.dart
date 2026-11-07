import 'dart:ui';

import 'package:flutter/widgets.dart';

import '../motion.dart';
import '../shaders/shader_library.dart';
import '../tokens.dart';
import 'disk_ring_arcs.dart';
import 'disk_ring_painter.dart';

/// The disk as a lit gauge of [reading], what can be freed in [accent]
/// light. It eases to each new reading, or jumps while motion is reduced,
/// and a sweep circles it while [isScanning].
class DiskRing extends StatefulWidget {
  const DiskRing({
    super.key,
    required this.reading,
    required this.accent,
    required this.isScanning,
    required this.semanticsLabel,
    this.center,
  });

  final DiskRingReading reading;
  final Color accent;
  final bool isScanning;
  final String semanticsLabel;

  /// What stands inside the ring, such as the figure that can be freed.
  final Widget? center;

  @override
  State<DiskRing> createState() => _DiskRingState();
}

class _DiskRingState extends State<DiskRing> with SingleTickerProviderStateMixin {
  late final AnimationController _fill = AnimationController(vsync: this, duration: MotionTokens.ringFill);
  late final CurvedAnimation _eased = CurvedAnimation(parent: _fill, curve: MotionTokens.ringFillCurve);
  DiskRingArcs _fromArcs = DiskRingArcs.empty;
  late DiskRingArcs _toArcs = buildDiskRingArcs(widget.reading);
  bool _hasStartedFill = false;
  FragmentProgram? _program;
  FragmentShader? _shader;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final FragmentProgram? program = ShaderLibrary.of(context).ringGlow;
    if (program != _program) {
      _shader?.dispose();
      _program = program;
      _shader = program?.fragmentShader();
    }

    final bool isReduced = MotionScope.of(context).isReduced;
    if (!_hasStartedFill) {
      _hasStartedFill = true;
      _easeToArcs(isReduced: isReduced);
      return;
    }

    if (isReduced && _fill.isAnimating) {
      _fill.value = 1;
    }
  }

  @override
  void didUpdateWidget(DiskRing oldWidget) {
    super.didUpdateWidget(oldWidget);
    final DiskRingArcs nextArcs = buildDiskRingArcs(widget.reading);
    if (nextArcs == _toArcs) {
      return;
    }

    _fromArcs = _getShownArcs();
    _toArcs = nextArcs;
    _easeToArcs(isReduced: MotionScope.of(context).isReduced);
  }

  @override
  void dispose() {
    _shader?.dispose();
    _eased.dispose();
    _fill.dispose();
    super.dispose();
  }

  void _easeToArcs({required bool isReduced}) {
    if (isReduced) {
      _fill.value = 1;
      return;
    }

    _fill.forward(from: 0);
  }

  DiskRingArcs _getShownArcs() => DiskRingArcs.lerp(_fromArcs, _toArcs, _eased.value);

  @override
  Widget build(BuildContext context) {
    final MotionState motion = MotionScope.of(context);
    final Widget? center = widget.center;
    return Semantics(
      container: true,
      label: widget.semanticsLabel,
      child: AspectRatio(
        aspectRatio: 1,
        child: Stack(
          fit: StackFit.expand,
          children: <Widget>[
            RepaintBoundary(
              child: AnimatedBuilder(
                animation: _eased,
                builder: (BuildContext context, Widget? child) {
                  return CustomPaint(
                    painter: DiskRingPainter(
                      arcs: _getShownArcs(),
                      accent: widget.accent,
                      shader: _shader,
                      ambientTime: MotionScope.ambientTimeOf(context),
                      isSweeping: widget.isScanning && !motion.isReduced,
                    ),
                  );
                },
              ),
            ),
            if (center != null) Center(child: center),
          ],
        ),
      ),
    );
  }
}
