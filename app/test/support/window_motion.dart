import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/design/design.dart';

/// The motion of a window hidden behind others, while motion is allowed.
const MotionState hiddenWindowMotion = MotionState(
  isReduced: false,
  isWindowVisible: false,
);

/// A window motion source that a test turns by hand, disposed at tear-down.
ValueNotifier<MotionState> createWindowMotion(MotionState initial) {
  final ValueNotifier<MotionState> windowMotion = ValueNotifier<MotionState>(initial);
  addTearDown(windowMotion.dispose);
  return windowMotion;
}
