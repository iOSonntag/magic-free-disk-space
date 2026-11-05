import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/design/motion.dart';
import 'package:magic_free_disk_space/design/sweep.dart';

import 'support/design_harness.dart';

Widget buildSweep(ValueNotifier<MotionState> windowMotion, {required bool isSweeping}) {
  return buildDesignHarness(
    windowMotion: windowMotion,
    child: ScanSweep(
      isSweeping: isSweeping,
      accent: const Color(0xFF9B7BFF),
      child: const SizedBox(width: 320, height: 120),
    ),
  );
}

Finder findSweepLight() {
  return find.byWidgetPredicate((Widget widget) => widget is CustomPaint && widget.foregroundPainter is ScanSweepPainter);
}

void main() {
  testWidgets('passes its light over the child while sweeping', (WidgetTester tester) async {
    final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.allowed);
    await tester.pumpWidget(buildSweep(windowMotion, isSweeping: true));
    await tester.pump(const Duration(milliseconds: 300));

    expect(findSweepLight(), findsOneWidget);
    expect(tester.hasRunningAnimations, isTrue);
  });

  testWidgets('is off while motion is reduced', (WidgetTester tester) async {
    final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.reduced);
    await tester.pumpWidget(buildSweep(windowMotion, isSweeping: true));

    expect(findSweepLight(), findsNothing);
    expect(tester.hasRunningAnimations, isFalse);
  });

  testWidgets('is off once the scan ends', (WidgetTester tester) async {
    final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.allowed);
    await tester.pumpWidget(buildSweep(windowMotion, isSweeping: true));
    await tester.pumpWidget(buildSweep(windowMotion, isSweeping: false));

    expect(findSweepLight(), findsNothing);
    expect(tester.hasRunningAnimations, isFalse);
  });
}
