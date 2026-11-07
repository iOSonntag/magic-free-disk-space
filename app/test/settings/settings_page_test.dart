import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge.dart';
import 'package:magic_free_disk_space/design/design.dart';
import 'package:magic_free_disk_space/settings/settings_page.dart';
import 'package:magic_free_disk_space/update/update.dart';

import '../support/fake_update_bridge.dart';
import '../support/semantics_labels.dart';
import '../support/stage_controls.dart';
import '../support/stage_harness.dart';
import '../support/update_matchers.dart';

Future<UpdateController> _pumpSettings(
  WidgetTester tester,
  FakeUpdateBridge bridge,
) async {
  final UpdateController controller = createUpdateController(bridge);
  await pumpOnStage(tester, SettingsPage(updateController: controller));
  return controller;
}

StageSwitchTrack _readSwitchTrack(WidgetTester tester) {
  return tester.widget<StageSwitchTrack>(find.byType(StageSwitchTrack));
}

Finder _findSwitchRow() {
  return find.bySemanticsLabel(updateCheckItemText);
}

Matcher _isSwitchLook({required bool isOn, required bool isEnabled}) {
  return isA<UpdateCheckSwitchLook>()
      .having((UpdateCheckSwitchLook look) => look.isOn, 'isOn', isOn)
      .having((UpdateCheckSwitchLook look) => look.isEnabled, 'isEnabled', isEnabled);
}

void main() {
  testWidgets('shows the stored switch on, and a tap saves it off', (
    WidgetTester tester,
  ) async {
    final FakeUpdateBridge bridge = FakeUpdateBridge(
      answerCheck: () async => quietUpdateCheck,
    );
    final UpdateController controller = await _pumpSettings(tester, bridge);

    expect(find.text('Settings'), findsOneWidget);
    expect(_readSwitchTrack(tester).value, isTrue);
    expect(_readSwitchTrack(tester).enabled, isTrue);
    expectEveryTappableNodeLabelled();

    await tapAndSettle(tester, _findSwitchRow());

    expect(bridge.savedValues, [false]);
    expect(controller.updateCheckSwitch, isConfirmedSwitch(isEnabled: false));
    expect(_readSwitchTrack(tester).value, isFalse);
  });

  testWidgets('is disabled while the save runs', (WidgetTester tester) async {
    final Completer<UpdateCheckSetAnswer> save = Completer<UpdateCheckSetAnswer>();
    final FakeUpdateBridge bridge = FakeUpdateBridge(
      answerCheck: () async => quietUpdateCheck,
    )..answerSet = (bool isEnabled) => save.future;
    await _pumpSettings(tester, bridge);

    await tapAndSettle(tester, _findSwitchRow());

    expect(_readSwitchTrack(tester).value, isFalse);
    expect(_readSwitchTrack(tester).enabled, isFalse);

    await tapAndSettle(tester, _findSwitchRow());

    expect(bridge.savedValues, [false]);

    save.complete(const UpdateCheckSetEvent(isUpdateCheckEnabled: false));
    await tester.pumpAndSettle();

    expect(_readSwitchTrack(tester).enabled, isTrue);
  });

  testWidgets('is disabled for a bridge older than the update check', (
    WidgetTester tester,
  ) async {
    final FakeUpdateBridge bridge = FakeUpdateBridge(
      answerCheck: () async => const FailedEvent(
        message: 'Unknown request "checkUpdate".',
        effect: FailureEffect.scanKept,
      ),
    );
    await _pumpSettings(tester, bridge);

    expect(_readSwitchTrack(tester).enabled, isFalse);

    await tapAndSettle(tester, _findSwitchRow());

    expect(bridge.savedValues, isEmpty);
  });

  testWidgets('says why a change was not saved and keeps the stored value', (
    WidgetTester tester,
  ) async {
    final FakeUpdateBridge bridge = FakeUpdateBridge(
      answerCheck: () async => quietUpdateCheck,
    )..answerSet = (bool isEnabled) async => const FailedEvent(
        message: 'The setting could not be saved.',
        effect: FailureEffect.scanKept,
      );
    await _pumpSettings(tester, bridge);

    await tapAndSettle(tester, _findSwitchRow());

    expect(find.text('The setting could not be saved.'), findsOneWidget);
    expect(_readSwitchTrack(tester).value, isTrue);
    expect(_readSwitchTrack(tester).enabled, isTrue);
  });

  testWidgets('opens the licences', (WidgetTester tester) async {
    await _pumpSettings(tester, FakeUpdateBridge(answerCheck: () async => quietUpdateCheck));

    await tapAndSettle(tester, find.text('Licences'));

    expect(find.byType(LicensePage), findsOneWidget);
  });

  test('the switch shows on only once the bridge confirmed it', () {
    expect(
      buildUpdateCheckSwitchLook(const UpdateCheckSwitchLoading()),
      _isSwitchLook(isOn: false, isEnabled: false),
    );
    expect(
      buildUpdateCheckSwitchLook(const UpdateCheckSwitchSaving(isEnabled: true)),
      _isSwitchLook(isOn: true, isEnabled: false),
    );
    expect(
      buildUpdateCheckSwitchLook(const UpdateCheckSwitchConfirmed(isEnabled: true)),
      _isSwitchLook(isOn: true, isEnabled: true),
    );
    expect(
      buildUpdateCheckSwitchLook(const UpdateCheckSwitchUnavailable()),
      _isSwitchLook(isOn: false, isEnabled: false),
    );
  });
}
