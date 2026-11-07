import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/design/count_up.dart';
import 'package:magic_free_disk_space/design/format_bytes.dart';
import 'package:magic_free_disk_space/design/motion.dart';
import 'package:magic_free_disk_space/design/section_glow.dart';

import 'support/design_harness.dart';

const MethodChannel windowMotionChannel = MethodChannel(windowMotionChannelName);

Future<void> sendMotionStateChange(WidgetTester tester, Object? arguments) async {
  final ByteData message = const StandardMethodCodec().encodeMethodCall(MethodCall('motionStateChanged', arguments));
  await tester.binding.defaultBinaryMessenger.handlePlatformMessage(windowMotionChannelName, message, (_) {});
}

/// Answers each call the app makes on the runner's channel with [answer],
/// until tear-down.
void mockRunnerChannel(WidgetTester tester, Future<Object?> Function(MethodCall call) answer) {
  tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(windowMotionChannel, answer);
  addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(windowMotionChannel, null));
}

/// Answers the channel as a runner without it does, such as the Windows one.
void mockRunnerWithoutChannel(WidgetTester tester) {
  mockRunnerChannel(tester, (MethodCall call) async => throw MissingPluginException());
}

ValueListenable<double> findAmbientTime(WidgetTester tester) {
  return MotionScope.ambientTimeOf(tester.element(find.byType(SectionGlow)));
}

void main() {
  group('the ambient ticker', () {
    testWidgets('stops when Reduce Motion turns on, and its time stands still', (WidgetTester tester) async {
      final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.allowed);
      await tester.pumpWidget(
        buildDesignHarness(
          windowMotion: windowMotion,
          child: const SectionGlow(accent: Color(0xFF38E1FF), child: SizedBox.square(dimension: 48)),
        ),
      );
      await tester.pump(const Duration(milliseconds: 500));
      expect(tester.hasRunningAnimations, isTrue);
      expect(findAmbientTime(tester).value, greaterThan(0));

      windowMotion.value = MotionState.reduced;
      await tester.pump();
      final double frozenSeconds = findAmbientTime(tester).value;
      await tester.pump(const Duration(seconds: 2));

      expect(tester.hasRunningAnimations, isFalse);
      expect(findAmbientTime(tester).value, frozenSeconds);
    });

    testWidgets('stops when the window hides, and resumes where it stood', (WidgetTester tester) async {
      final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.allowed);
      await tester.pumpWidget(
        buildDesignHarness(
          windowMotion: windowMotion,
          child: const SectionGlow(accent: Color(0xFF38E1FF), child: SizedBox.square(dimension: 48)),
        ),
      );
      await tester.pump(const Duration(milliseconds: 500));

      windowMotion.value = hiddenWindowMotion;
      await tester.pump();
      final double frozenSeconds = findAmbientTime(tester).value;
      await tester.pump(const Duration(seconds: 5));
      expect(tester.hasRunningAnimations, isFalse);
      expect(findAmbientTime(tester).value, frozenSeconds);

      windowMotion.value = MotionState.allowed;
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(tester.hasRunningAnimations, isTrue);
      expect(findAmbientTime(tester).value, closeTo(frozenSeconds + 0.1, 0.02));
    });

    testWidgets('runs only while something listens', (WidgetTester tester) async {
      final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.allowed);
      await tester.pumpWidget(buildDesignHarness(windowMotion: windowMotion, child: const SizedBox.square(dimension: 48)));
      await tester.pump(const Duration(milliseconds: 500));

      expect(tester.hasRunningAnimations, isFalse);
    });
  });

  testWidgets('pauses every ticker below it while the window is hidden', (WidgetTester tester) async {
    final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.allowed);
    Widget buildCount(int value) {
      return buildDesignHarness(
        windowMotion: windowMotion,
        child: CountUp(value: value, format: formatBytes),
      );
    }

    await tester.pumpWidget(buildCount(0));
    await tester.pumpWidget(buildCount(4000000000));
    await tester.pump(const Duration(milliseconds: 100));
    expect(tester.hasRunningAnimations, isTrue);

    windowMotion.value = hiddenWindowMotion;
    await tester.pump();

    expect(tester.hasRunningAnimations, isFalse);
  });

  group('MotionScope', () {
    testWidgets('reads the engine flag as reduced motion', (WidgetTester tester) async {
      final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.allowed);
      late MotionState seen;
      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(disableAnimations: true),
          child: MotionScope(
            windowMotion: windowMotion,
            child: Builder(
              builder: (BuildContext context) {
                seen = MotionScope.of(context);
                return const SizedBox();
              },
            ),
          ),
        ),
      );

      expect(seen.isReduced, isTrue);
      expect(seen.runsAmbientEffects, isFalse);
    });

    testWidgets('rebuilds its readers when the window state changes', (WidgetTester tester) async {
      final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.allowed);
      late MotionState seen;
      await tester.pumpWidget(
        MotionScope(
          windowMotion: windowMotion,
          child: Builder(
            builder: (BuildContext context) {
              seen = MotionScope.of(context);
              return const SizedBox();
            },
          ),
        ),
      );
      expect(seen, MotionState.allowed);

      windowMotion.value = hiddenWindowMotion;
      await tester.pump();

      expect(seen, hiddenWindowMotion);
      expect(seen.runsAmbientEffects, isFalse);
    });
  });

  group('parseWindowMotionState', () {
    test('parses the runner state', () {
      expect(
        parseWindowMotionState(<String, Object?>{'reducesMotion': true, 'isWindowVisible': false}),
        const MotionState(isReduced: true, isWindowVisible: false),
      );
    });

    test('refuses any other shape', () {
      expect(parseWindowMotionState(null), isNull);
      expect(parseWindowMotionState(true), isNull);
      expect(parseWindowMotionState(<String, Object?>{'reducesMotion': true}), isNull);
      expect(parseWindowMotionState(<String, Object?>{'reducesMotion': 'yes', 'isWindowVisible': true}), isNull);
    });
  });

  group('WindowMotionChannel', () {
    testWidgets('reads a missing runner channel as motion allowed', (WidgetTester tester) async {
      mockRunnerWithoutChannel(tester);
      final WindowMotionChannel channel = WindowMotionChannel();
      addTearDown(channel.dispose);

      await channel.connect();

      expect(channel.value, MotionState.allowed);
    });

    testWidgets('takes the state the runner loads', (WidgetTester tester) async {
      mockRunnerChannel(tester, (MethodCall call) async {
        return <String, Object?>{'reducesMotion': true, 'isWindowVisible': true};
      });
      final WindowMotionChannel channel = WindowMotionChannel();
      addTearDown(channel.dispose);

      await channel.connect();

      expect(channel.value, MotionState.reduced);
    });

    testWidgets('takes each change the runner sends, and ignores a malformed one', (WidgetTester tester) async {
      mockRunnerWithoutChannel(tester);
      final WindowMotionChannel channel = WindowMotionChannel();
      addTearDown(channel.dispose);
      await channel.connect();

      await sendMotionStateChange(tester, <String, Object?>{'reducesMotion': false, 'isWindowVisible': false});
      expect(channel.value, hiddenWindowMotion);

      await sendMotionStateChange(tester, <String, Object?>{'isWindowVisible': true});
      expect(channel.value, hiddenWindowMotion);
    });

    testWidgets('keeps a change that arrives before the load answer', (WidgetTester tester) async {
      mockRunnerChannel(tester, (MethodCall call) async {
        await sendMotionStateChange(tester, <String, Object?>{'reducesMotion': true, 'isWindowVisible': false});
        return <String, Object?>{'reducesMotion': false, 'isWindowVisible': true};
      });
      final WindowMotionChannel channel = WindowMotionChannel();
      addTearDown(channel.dispose);

      await channel.connect();

      expect(channel.value, const MotionState(isReduced: true, isWindowVisible: false));
    });
  });
}
