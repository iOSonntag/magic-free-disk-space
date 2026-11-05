import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/design/motion.dart';
import 'package:magic_free_disk_space/design/shaders/shader_library.dart';

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
