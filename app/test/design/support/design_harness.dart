import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/design/design.dart';

export '../../support/window_motion.dart';

/// Wraps [child] in what every design widget reads: a [MotionScope] over
/// [windowMotion], a [ShaderLibraryScope] and a text direction.
Widget buildDesignHarness({
  required ValueListenable<MotionState> windowMotion,
  required Widget child,
  ShaderLibrary library = ShaderLibrary.empty,
}) {
  return MotionScope(
    windowMotion: windowMotion,
    child: ShaderLibraryScope(
      library: library,
      child: Directionality(
        textDirection: TextDirection.ltr,
        child: Center(child: child),
      ),
    ),
  );
}

/// A [CountUp] of bytes at [value] in the design harness over [windowMotion].
Widget buildCountUp(ValueListenable<MotionState> windowMotion, int value) {
  return buildDesignHarness(
    windowMotion: windowMotion,
    child: CountUp(value: value, format: formatBytes),
  );
}

/// Each [CustomPaint] that paints a [TPainter] over its child.
Finder findForegroundPainter<TPainter extends CustomPainter>() {
  return find.byWidgetPredicate(
    (Widget widget) => widget is CustomPaint && widget.foregroundPainter is TPainter,
  );
}

/// The [CustomPaint] that draws the arcs of the one [DiskRing].
Finder findRingPaint() {
  return find.descendant(of: find.byType(DiskRing), matching: find.byType(CustomPaint)).first;
}
