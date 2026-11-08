import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/design/dissolve.dart';
import 'package:magic_free_disk_space/design/motion.dart';
import 'package:magic_free_disk_space/design/tokens.dart';

import 'support/design_harness.dart';

const Color accent = Color(0xFFFF5470);

Widget buildDissolve(ValueNotifier<MotionState> windowMotion, {required bool isDissolved, VoidCallback? onDissolved}) {
  return buildDesignHarness(
    windowMotion: windowMotion,
    child: Dissolve(
      isDissolved: isDissolved,
      accent: accent,
      onDissolved: onDissolved,
      child: const SizedBox(width: 320, height: 44, child: Text('Xcode DerivedData')),
    ),
  );
}

void main() {
  testWidgets('sheds glowing motes behind a wipe, then reports the child gone', (WidgetTester tester) async {
    final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.allowed);
    int dissolvedCount = 0;
    await tester.pumpWidget(buildDissolve(windowMotion, isDissolved: false));

    await tester.pumpWidget(buildDissolve(windowMotion, isDissolved: true, onDissolved: () => dissolvedCount++));
    await tester.pump(MotionTokens.dissolve ~/ 2);

    expect(findForegroundPainter<DissolveMotesPainter>(), findsOneWidget);
    expect(find.byType(ShaderMask), findsOneWidget);
    expect(dissolvedCount, 0);

    await tester.pumpAndSettle();

    expect(dissolvedCount, 1);
    expect(findForegroundPainter<DissolveMotesPainter>(), findsNothing);
    expect(tester.widget<Opacity>(find.byType(Opacity)).opacity, 0);
  });

  testWidgets('is a plain fade with no motes while motion is reduced', (WidgetTester tester) async {
    final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.reduced);
    int dissolvedCount = 0;
    await tester.pumpWidget(buildDissolve(windowMotion, isDissolved: false));

    await tester.pumpWidget(buildDissolve(windowMotion, isDissolved: true, onDissolved: () => dissolvedCount++));
    await tester.pump(MotionTokens.plainFade ~/ 2);

    expect(findForegroundPainter<DissolveMotesPainter>(), findsNothing);
    expect(find.byType(ShaderMask), findsNothing);
    expect(tester.widget<Opacity>(find.byType(Opacity)).opacity, inExclusiveRange(0, 1));

    await tester.pump(MotionTokens.plainFade);

    expect(dissolvedCount, 1);
    expect(tester.hasRunningAnimations, isFalse);
  });

  testWidgets('pauses while the window is hidden', (WidgetTester tester) async {
    final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.allowed);
    await tester.pumpWidget(buildDissolve(windowMotion, isDissolved: false));
    await tester.pumpWidget(buildDissolve(windowMotion, isDissolved: true));
    await tester.pump(MotionTokens.dissolve ~/ 4);

    windowMotion.value = hiddenWindowMotion;
    await tester.pump();

    expect(tester.hasRunningAnimations, isFalse);
  });

  test('the wipe is clear behind its front and opaque ahead of it', () {
    final LinearGradient wipe = buildDissolveWipe(dissolveWipeShare / 2);

    expect(wipe.colors.first.a, 0);
    expect(wipe.colors.last.a, 1);
    expect(wipe.stops, <Matcher>[closeTo(0.38, 0.0001), closeTo(0.5, 0.0001)]);
  });
}
