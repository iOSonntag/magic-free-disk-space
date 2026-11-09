import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge.dart';
import 'package:magic_free_disk_space/cleaner/cleaner.dart';
import 'package:magic_free_disk_space/design/design.dart';
import 'package:magic_free_disk_space/settings/settings_page.dart';
import 'package:magic_free_disk_space/update/update.dart';

import '../support/fake_cleaner_bridge.dart';
import '../support/fake_update_bridge.dart';
import '../support/sample_events.dart';
import '../support/semantics_labels.dart';
import '../support/stage_controls.dart';
import '../support/stage_harness.dart';
import '../support/update_matchers.dart';

FakeCleanerBridge _createCleanerBridge() {
  return FakeCleanerBridge(scanAnswer: loadSampleEvent<ScannedEvent>());
}

Future<UpdateController> _pumpSettings(
  WidgetTester tester,
  FakeUpdateBridge bridge, {
  FakeCleanerBridge? cleanerBridge,
}) async {
  final UpdateController controller = createUpdateController(bridge);
  await _pumpSettingsWith(
    tester,
    updateController: controller,
    cleanerBridge: cleanerBridge ?? _createCleanerBridge(),
  );
  return controller;
}

Future<CleanerController> _pumpRescanSettings(
  WidgetTester tester,
  FakeCleanerBridge cleanerBridge,
) async {
  return _pumpSettingsWith(
    tester,
    updateController: createUpdateController(FakeUpdateBridge()),
    cleanerBridge: cleanerBridge,
  );
}

Future<CleanerController> _pumpSettingsWith(
  WidgetTester tester, {
  required UpdateController updateController,
  required FakeCleanerBridge cleanerBridge,
}) async {
  final CleanerController cleanerController = CleanerController(
    bridge: cleanerBridge,
  );
  addTearDown(cleanerController.dispose);
  await pumpOnStage(
    tester,
    SettingsPage(
      updateController: updateController,
      cleanerController: cleanerController,
    ),
  );
  return cleanerController;
}

/// The track of the update check, the first switch of the page.
StageSwitchTrack _readSwitchTrack(WidgetTester tester) {
  return tester.widget<StageSwitchTrack>(find.byType(StageSwitchTrack).at(0));
}

/// The track of the scan after a deletion, the second switch of the page.
StageSwitchTrack _readRescanTrack(WidgetTester tester) {
  return tester.widget<StageSwitchTrack>(find.byType(StageSwitchTrack).at(1));
}

Finder _findSwitchRow() {
  return find.bySemanticsLabel(updateCheckItemText);
}

Finder _findRescanRow() {
  return find.bySemanticsLabel(rescanItemText);
}

Matcher _isSwitchLook({required bool isOn, required bool isEnabled}) {
  return isA<SettingSwitchLook>()
      .having((SettingSwitchLook look) => look.isOn, 'isOn', isOn)
      .having((SettingSwitchLook look) => look.isEnabled, 'isEnabled', isEnabled);
}

void main() {
  testWidgets('shows the stored switch on, and a tap saves it off', (
    WidgetTester tester,
  ) async {
    final FakeUpdateBridge bridge = FakeUpdateBridge();
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
    final FakeUpdateBridge bridge = FakeUpdateBridge()..answerSet = (bool isEnabled) => save.future;
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
    final FakeUpdateBridge bridge = FakeUpdateBridge()..answerSet = (bool isEnabled) async => const FailedEvent(
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
    await _pumpSettings(tester, FakeUpdateBridge());

    await tapAndSettle(tester, find.text('Licences'));

    expect(find.byType(LicensePage), findsOneWidget);
  });

  testWidgets('shows the rescan switch on by default, and a tap saves it off', (
    WidgetTester tester,
  ) async {
    final FakeCleanerBridge bridge = _createCleanerBridge();
    final CleanerController controller = await _pumpRescanSettings(tester, bridge);

    expect(find.text(rescanItemText), findsOneWidget);
    expect(_readRescanTrack(tester).value, isTrue);
    expect(_readRescanTrack(tester).enabled, isTrue);
    expectEveryTappableNodeLabelled();

    await tapAndSettle(tester, _findRescanRow());

    expect(bridge.savedRescanValues, [false]);
    expect(controller.rescanSwitch, isA<RescanSwitchConfirmed>().having(
      (RescanSwitchConfirmed rescanSwitch) => rescanSwitch.isEnabled,
      'isEnabled',
      isFalse,
    ));
    expect(_readRescanTrack(tester).value, isFalse);
    // The other switch stays as it was.
    expect(_readSwitchTrack(tester).value, isTrue);
  });

  testWidgets('shows the stored rescan switch off, and a tap saves it on', (
    WidgetTester tester,
  ) async {
    final FakeCleanerBridge bridge = _createCleanerBridge()
      ..answerStatus = () async => const StatusEvent(
        fullDiskAccess: FullDiskAccess.granted,
        notices: [],
        isRescanAfterDeletionEnabled: false,
      );
    await _pumpRescanSettings(tester, bridge);

    expect(_readRescanTrack(tester).value, isFalse);

    await tapAndSettle(tester, _findRescanRow());

    expect(bridge.savedRescanValues, [true]);
    expect(_readRescanTrack(tester).value, isTrue);
  });

  testWidgets('says why a rescan change was not saved and keeps the stored value', (
    WidgetTester tester,
  ) async {
    final FakeCleanerBridge bridge = _createCleanerBridge()
      ..answerSetRescan = (bool isEnabled) async => const FailedEvent(
        message: 'The setting could not be saved.',
        effect: FailureEffect.scanKept,
      );
    await _pumpRescanSettings(tester, bridge);

    await tapAndSettle(tester, _findRescanRow());

    expect(find.text('The setting could not be saved.'), findsOneWidget);
    expect(_readRescanTrack(tester).value, isTrue);
    expect(_readRescanTrack(tester).enabled, isTrue);
  });

  testWidgets('disables the rescan switch when the status failed', (
    WidgetTester tester,
  ) async {
    final FakeCleanerBridge bridge = _createCleanerBridge()
      ..answerStatus = () async => const FailedEvent(
        message: 'Unknown request.',
        effect: FailureEffect.scanKept,
      );
    await _pumpRescanSettings(tester, bridge);

    expect(_readRescanTrack(tester).enabled, isFalse);

    await tapAndSettle(tester, _findRescanRow());

    expect(bridge.savedRescanValues, isEmpty);
  });

  test('the rescan switch shows on, as the bridge does, until it can be changed', () {
    expect(
      buildRescanSwitchLook(const RescanSwitchLoading()),
      _isSwitchLook(isOn: true, isEnabled: false),
    );
    expect(
      buildRescanSwitchLook(const RescanSwitchSaving(isEnabled: false)),
      _isSwitchLook(isOn: false, isEnabled: false),
    );
    expect(
      buildRescanSwitchLook(const RescanSwitchConfirmed(isEnabled: false)),
      _isSwitchLook(isOn: false, isEnabled: true),
    );
    expect(
      buildRescanSwitchLook(const RescanSwitchUnavailable()),
      _isSwitchLook(isOn: true, isEnabled: false),
    );
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
