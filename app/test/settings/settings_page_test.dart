import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_event.dart';
import 'package:magic_free_disk_space/settings/settings_page.dart';
import 'package:magic_free_disk_space/shell/stage_switch_track.dart';
import 'package:magic_free_disk_space/update/update_controller.dart';

import '../shell/support/stage_harness.dart';
import '../support/fake_update_bridge.dart';
import '../support/semantics_labels.dart';
import '../support/update_matchers.dart';

const UpdateCheckedEvent _checkedOn = UpdateCheckedEvent(
  isUpdateCheckEnabled: true,
  notice: null,
);

Future<UpdateController> _pumpSettings(
  WidgetTester tester,
  FakeUpdateBridge bridge,
) async {
  final UpdateController controller = UpdateController(bridge: bridge);
  addTearDown(controller.dispose);
  await pumpOnStage(tester, SettingsPage(updateController: controller));
  return controller;
}

StageSwitchTrack _readSwitchTrack(WidgetTester tester) {
  return tester.widget<StageSwitchTrack>(find.byType(StageSwitchTrack));
}

Finder _findSwitchRow() {
  return find.bySemanticsLabel(updateCheckItemText);
}

void main() {
  testWidgets('shows the stored switch on, and a tap saves it off', (
    WidgetTester tester,
  ) async {
    final FakeUpdateBridge bridge = FakeUpdateBridge(
      answerCheck: () async => _checkedOn,
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
      answerCheck: () async => _checkedOn,
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
      answerCheck: () async => _checkedOn,
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
    await _pumpSettings(tester, FakeUpdateBridge(answerCheck: () async => _checkedOn));

    await tapAndSettle(tester, find.text('Licences'));

    expect(find.byType(LicensePage), findsOneWidget);
  });

  test('the switch shows on only once the bridge confirmed it', () {
    expect(
      buildUpdateCheckSwitchLook(const UpdateCheckSwitchLoading()),
      (isOn: false, isEnabled: false),
    );
    expect(
      buildUpdateCheckSwitchLook(const UpdateCheckSwitchSaving(isEnabled: true)),
      (isOn: true, isEnabled: false),
    );
    expect(
      buildUpdateCheckSwitchLook(const UpdateCheckSwitchConfirmed(isEnabled: true)),
      (isOn: true, isEnabled: true),
    );
    expect(
      buildUpdateCheckSwitchLook(const UpdateCheckSwitchUnavailable()),
      (isOn: false, isEnabled: false),
    );
  });
}
