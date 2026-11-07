import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_event.dart';
import 'package:magic_free_disk_space/cleaner/cleaner_bridge.dart';
import 'package:magic_free_disk_space/main.dart';
import 'package:magic_free_disk_space/update/update_bridge.dart';

import '../support/fake_cleaner_bridge.dart';
import '../support/fake_update_bridge.dart';
import '../support/fake_url_opener.dart';
import '../support/sample_events.dart';
import '../support/stage_harness.dart';

/// One bridge for both controllers, as the process bridge is, that names
/// each request in the order the app makes it.
final class _OrderRecordingBridge implements CleanerBridge, UpdateBridge {
  _OrderRecordingBridge({required this.cleanerBridge, required this.updateBridge});

  final FakeCleanerBridge cleanerBridge;
  final FakeUpdateBridge updateBridge;
  final List<String> requestedKinds = [];

  @override
  Future<StatusAnswer> status() {
    requestedKinds.add('status');
    return cleanerBridge.status();
  }

  @override
  Future<ScanAnswer> scan({
    required void Function(ProgressEvent progress) onProgress,
  }) {
    requestedKinds.add('scan');
    return cleanerBridge.scan(onProgress: onProgress);
  }

  @override
  Future<PlanAnswer> plan(List<int> numbers) {
    requestedKinds.add('plan');
    return cleanerBridge.plan(numbers);
  }

  @override
  Future<DeleteAnswer> delete({
    required int planId,
    required String confirmation,
  }) {
    requestedKinds.add('delete');
    return cleanerBridge.delete(planId: planId, confirmation: confirmation);
  }

  @override
  Future<UpdateCheckAnswer> checkUpdate() {
    requestedKinds.add('checkUpdate');
    return updateBridge.checkUpdate();
  }

  @override
  Future<UpdateCheckSetAnswer> setUpdateCheck(bool isEnabled) {
    requestedKinds.add('setUpdateCheck');
    return updateBridge.setUpdateCheck(isEnabled);
  }
}

void main() {
  final ScannedEvent sampleScan = loadSampleEvent<ScannedEvent>();
  final UpdateCheckedEvent sampleCheck = loadSampleEvent<UpdateCheckedEvent>();

  testWidgets(
    'starts the scan at launch, queued before the update check, and shows its Overview',
    (WidgetTester tester) async {
      final _OrderRecordingBridge bridge = _OrderRecordingBridge(
        cleanerBridge: FakeCleanerBridge(scanAnswer: sampleScan),
        updateBridge: FakeUpdateBridge(answerCheck: () async => sampleCheck),
      );
      setStageWindowSize(tester);

      await tester.pumpWidget(
        buildStageScopes(
          MagicFreeDiskSpaceApp(
            cleanerBridge: bridge,
            updateBridge: bridge,
            urlOpener: FakeUrlOpener(isOpening: true),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(bridge.requestedKinds, ['status', 'scan', 'checkUpdate']);
      expect(find.text('at least 26 MB can be freed'), findsOneWidget);
      expect(find.text(sampleCheck.notice!.titleText), findsOneWidget);
      expect(find.byType(MaterialApp), findsOneWidget);
    },
  );
}
