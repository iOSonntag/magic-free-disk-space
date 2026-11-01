import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_event.dart';
import 'package:magic_free_disk_space/update/update_controller.dart';

import 'support/fake_update_bridge.dart';
import 'support/sample_events.dart';

Future<void> waitForAnswers() {
  return Future<void>.delayed(Duration.zero);
}

void main() {
  final UpdateCheckedEvent sampleCheck = loadSampleEvents()
      .whereType<UpdateCheckedEvent>()
      .single;
  const FailedEvent unknownRequest = FailedEvent(
    message: 'The bridge does not know the request.',
    effect: FailureEffect.scanKept,
  );

  late FakeUpdateBridge bridge;
  late UpdateController controller;

  setUp(() {
    bridge = FakeUpdateBridge(answerCheck: () async => sampleCheck);
  });

  tearDown(() {
    controller.dispose();
  });

  group('the check at start', () {
    test('loads, then shows the notice and the stored switch', () async {
      final Completer<UpdateCheckAnswer> pendingCheck =
          Completer<UpdateCheckAnswer>();
      bridge.answerCheck = () => pendingCheck.future;
      controller = UpdateController(bridge: bridge);

      expect(controller.updateCheckSwitch, isA<UpdateCheckSwitchLoading>());
      expect(controller.notice, isNull);

      pendingCheck.complete(sampleCheck);
      await waitForAnswers();

      expect(controller.updateCheckSwitch, isA<UpdateCheckSwitchEnabled>());
      expect(controller.notice, same(sampleCheck.notice));
      expect(controller.saveFailureText, isNull);
    });

    test('a switched off check shows no notice', () async {
      bridge.answerCheck = () async =>
          const UpdateCheckedEvent(isUpdateCheckEnabled: false, notice: null);
      controller = UpdateController(bridge: bridge);
      await waitForAnswers();

      expect(controller.updateCheckSwitch, isA<UpdateCheckSwitchDisabled>());
      expect(controller.notice, isNull);
    });

    test('a failed answer of an older bridge is silent', () async {
      bridge.answerCheck = () async => unknownRequest;
      controller = UpdateController(bridge: bridge);
      await waitForAnswers();

      expect(controller.updateCheckSwitch, isA<UpdateCheckSwitchUnavailable>());
      expect(controller.notice, isNull);
      expect(controller.saveFailureText, isNull);
    });

    test('a thrown check is silent', () async {
      bridge.answerCheck = () async =>
          throw const FormatException('Not an event.');
      controller = UpdateController(bridge: bridge);
      await waitForAnswers();

      expect(controller.updateCheckSwitch, isA<UpdateCheckSwitchUnavailable>());
      expect(controller.notice, isNull);
      expect(controller.saveFailureText, isNull);
    });
  });

  group('a change of the switch', () {
    setUp(() async {
      controller = UpdateController(bridge: bridge);
      await waitForAnswers();
    });

    test(
      'saves and holds the value the bridge stored, keeping the notice',
      () async {
        final Completer<UpdateCheckSetAnswer> pendingSave =
            Completer<UpdateCheckSetAnswer>();
        bridge.answerSet = (bool _) => pendingSave.future;

        final Future<void> save = controller.setUpdateCheck(false);

        expect(
          controller.updateCheckSwitch,
          isA<UpdateCheckSwitchSaving>().having(
            (saving) => saving.isEnabled,
            'isEnabled',
            isFalse,
          ),
        );

        pendingSave.complete(
          const UpdateCheckSetEvent(isUpdateCheckEnabled: false),
        );
        await save;

        expect(bridge.savedValues, [false]);
        expect(controller.updateCheckSwitch, isA<UpdateCheckSwitchDisabled>());
        expect(controller.notice, same(sampleCheck.notice));
      },
    );

    test(
      'a failed save shows its message and returns to the confirmed value',
      () async {
        bridge.answerSet = (bool _) async => const FailedEvent(
          message: 'The preference could not be saved.',
          effect: FailureEffect.scanKept,
        );

        await controller.setUpdateCheck(false);

        expect(controller.updateCheckSwitch, isA<UpdateCheckSwitchEnabled>());
        expect(
          controller.saveFailureText,
          'The preference could not be saved.',
        );
      },
    );

    test(
      'a thrown save shows the error and returns to the confirmed value',
      () async {
        bridge.answerSet = (bool _) async =>
            throw const FormatException('Not an event.');

        await controller.setUpdateCheck(false);

        expect(controller.updateCheckSwitch, isA<UpdateCheckSwitchEnabled>());
        expect(controller.saveFailureText, contains('Not an event.'));
      },
    );

    test('the next change clears the failure text', () async {
      bridge.answerSet = (bool _) async => unknownRequest;
      await controller.setUpdateCheck(false);
      bridge.answerSet = (bool isEnabled) async =>
          UpdateCheckSetEvent(isUpdateCheckEnabled: isEnabled);

      await controller.setUpdateCheck(false);

      expect(controller.saveFailureText, isNull);
      expect(controller.updateCheckSwitch, isA<UpdateCheckSwitchDisabled>());
    });

    test('a second change while saving is ignored', () async {
      final Completer<UpdateCheckSetAnswer> pendingSave =
          Completer<UpdateCheckSetAnswer>();
      bridge.answerSet = (bool _) => pendingSave.future;

      final Future<void> save = controller.setUpdateCheck(false);
      await controller.setUpdateCheck(true);
      pendingSave.complete(
        const UpdateCheckSetEvent(isUpdateCheckEnabled: false),
      );
      await save;

      expect(bridge.savedValues, [false]);
    });

    test('a change to the value the switch holds sends nothing', () async {
      await controller.setUpdateCheck(true);

      expect(bridge.savedValues, isEmpty);
      expect(controller.updateCheckSwitch, isA<UpdateCheckSwitchEnabled>());
    });
  });

  test('a change while the switch is unavailable sends nothing', () async {
    bridge.answerCheck = () async => unknownRequest;
    controller = UpdateController(bridge: bridge);
    await waitForAnswers();

    await controller.setUpdateCheck(false);

    expect(bridge.savedValues, isEmpty);
  });

  test('a check that answers after dispose changes nothing', () async {
    final Completer<UpdateCheckAnswer> pendingCheck =
        Completer<UpdateCheckAnswer>();
    bridge.answerCheck = () => pendingCheck.future;
    final UpdateController disposed = UpdateController(bridge: bridge);
    controller = UpdateController(bridge: bridge);

    disposed.dispose();
    pendingCheck.complete(sampleCheck);
    await waitForAnswers();

    expect(disposed.updateCheckSwitch, isA<UpdateCheckSwitchLoading>());
  });
}
