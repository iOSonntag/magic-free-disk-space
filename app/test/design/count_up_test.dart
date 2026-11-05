import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/design/count_up.dart';
import 'package:magic_free_disk_space/design/format_bytes.dart';
import 'package:magic_free_disk_space/design/motion.dart';
import 'package:magic_free_disk_space/design/tokens.dart';

import 'support/design_harness.dart';

Widget buildCountUp(ValueNotifier<MotionState> windowMotion, int value) {
  return buildDesignHarness(
    windowMotion: windowMotion,
    child: CountUp(value: value, format: formatBytes),
  );
}

String readShownText(WidgetTester tester) => tester.widget<Text>(find.byType(Text)).data!;

void main() {
  testWidgets('jumps to the new value while motion is reduced', (WidgetTester tester) async {
    final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.reduced);
    await tester.pumpWidget(buildCountUp(windowMotion, 0));

    await tester.pumpWidget(buildCountUp(windowMotion, 4200000000));

    expect(readShownText(tester), '4.2 GB');
    expect(tester.hasRunningAnimations, isFalse);
  });

  testWidgets('counts through the values between and ends on the new one', (WidgetTester tester) async {
    final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.allowed);
    await tester.pumpWidget(buildCountUp(windowMotion, 0));

    await tester.pumpWidget(buildCountUp(windowMotion, 4200000000));
    await tester.pump(MotionTokens.countUp ~/ 4);
    final String midway = readShownText(tester);
    await tester.pumpAndSettle();

    expect(midway, isNot(anyOf('0 B', '4.2 GB')));
    expect(readShownText(tester), '4.2 GB');
  });

  testWidgets('counts down from the figure it shows when the value falls midway', (WidgetTester tester) async {
    final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.allowed);
    await tester.pumpWidget(buildCountUp(windowMotion, 0));
    await tester.pumpWidget(buildCountUp(windowMotion, 9000000000));
    await tester.pump(MotionTokens.countUp ~/ 2);

    await tester.pumpWidget(buildCountUp(windowMotion, 1000000000));
    await tester.pump(const Duration(milliseconds: 16));
    final String justAfter = readShownText(tester);
    await tester.pumpAndSettle();

    expect(justAfter, isNot('1.0 GB'));
    expect(readShownText(tester), '1.0 GB');
  });

  testWidgets('jumps to its value when Reduce Motion turns on midway', (WidgetTester tester) async {
    final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.allowed);
    await tester.pumpWidget(buildCountUp(windowMotion, 0));
    await tester.pumpWidget(buildCountUp(windowMotion, 4200000000));
    await tester.pump(MotionTokens.countUp ~/ 4);

    windowMotion.value = MotionState.reduced;
    await tester.pump();

    expect(readShownText(tester), '4.2 GB');
    expect(tester.hasRunningAnimations, isFalse);
  });

  testWidgets('gives assistive technology only the value', (WidgetTester tester) async {
    final SemanticsHandle semantics = tester.ensureSemantics();
    final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.allowed);
    await tester.pumpWidget(buildCountUp(windowMotion, 0));
    await tester.pumpWidget(buildCountUp(windowMotion, 4200000000));
    await tester.pump(MotionTokens.countUp ~/ 4);

    expect(find.bySemanticsLabel('4.2 GB'), findsOneWidget);

    await tester.pumpAndSettle();
    semantics.dispose();
  });
}
