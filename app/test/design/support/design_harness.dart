import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/design/design.dart';

/// The motion of a window hidden behind others, while motion is allowed.
const MotionState hiddenWindowMotion = MotionState(
  isReduced: false,
  isWindowVisible: false,
);

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

/// A window motion source that a test turns by hand, disposed at tear-down.
ValueNotifier<MotionState> createWindowMotion(MotionState initial) {
  final ValueNotifier<MotionState> windowMotion = ValueNotifier<MotionState>(initial);
  addTearDown(windowMotion.dispose);
  return windowMotion;
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
