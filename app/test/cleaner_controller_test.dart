import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_event.dart';
import 'package:magic_free_disk_space/bridge_process/process_bridge_client.dart';
import 'package:magic_free_disk_space/cleaner/cleaner_controller.dart';

import 'support/fake_cleaner_bridge.dart';

const ItemView toolCacheItem = ItemView(
  number: 1,
  key: 'catalog:tool-cache:/Users/me/Library/Caches/ToolCache',
  title: 'Tool cache',
  risk: Risk.safe,
  riskText: 'safe',
  sizeText: '6.0 MB',
  detailLines: [
    ItemDetailLine(
      kind: ItemDetailLineKind.path,
      text: '/Users/me/Library/Caches/ToolCache',
    ),
  ],
  sectionKey: SectionKey.caches,
  group: ItemGroup.safe,
  origin: ItemOrigin.catalog,
  removal: ItemRemoval.delete,
  allocatedBytes: 6000000,
  isComplete: true,
  displayPath: '~/Library/Caches/ToolCache',
  revealPath: '/Users/me/Library/Caches/ToolCache',
  lastUsedAt: null,
  downloadedAt: null,
  appName: null,
  matchedBy: null,
);

const ItemView oldVideoItem = ItemView(
  number: 2,
  key: 'userFile:/Users/me/Movies/holiday.mov',
  title: 'Old video',
  risk: Risk.careful,
  riskText: 'careful',
  sizeText: '3.0 MB',
  detailLines: [
    ItemDetailLine(
      kind: ItemDetailLineKind.path,
      text: '/Users/me/Movies/holiday.mov',
    ),
  ],
  sectionKey: SectionKey.largeFiles,
  group: ItemGroup.careful,
  origin: ItemOrigin.largeFile,
  removal: ItemRemoval.delete,
  allocatedBytes: 3000000,
  isComplete: true,
  displayPath: '~/Movies/holiday.mov',
  revealPath: '/Users/me/Movies/holiday.mov',
  lastUsedAt: null,
  downloadedAt: null,
  appName: null,
  matchedBy: null,
);

/// Safe by risk, yet in Explore, so "Select safe" leaves it out.
const ItemView simulatorItem = ItemView(
  number: 3,
  key: 'explore:simulatorDevices:simulatorDevice:0A1B2C3D',
  title: 'Simulator iPhone 15',
  risk: Risk.safe,
  riskText: 'safe',
  sizeText: '1.0 MB',
  detailLines: [
    ItemDetailLine(
      kind: ItemDetailLineKind.command,
      text: 'xcrun simctl delete 0A1B2C3D',
    ),
  ],
  sectionKey: SectionKey.developerTools,
  group: ItemGroup.review,
  origin: ItemOrigin.explore,
  removal: ItemRemoval.tool,
  allocatedBytes: 1000000,
  isComplete: true,
  displayPath: '~/Library/Developer/CoreSimulator/Devices/0A1B2C3D',
  revealPath: '/Users/me/Library/Developer/CoreSimulator/Devices/0A1B2C3D',
  lastUsedAt: null,
  downloadedAt: null,
  appName: null,
  matchedBy: null,
);

const ScannedEvent scannedEvent = ScannedEvent(
  summary: SummaryView(
    titleText: 'Found 3 items',
    lines: [],
    totalBytes: 10000000,
    safeBytes: 6000000,
    disk: null,
  ),
  sections: [
    SectionView(
      key: SectionKey.caches,
      titleText: 'Caches',
      sizeText: '6.0 MB',
      isInitiallyExpanded: true,
      items: [toolCacheItem],
      checkGroup: null,
    ),
    SectionView(
      key: SectionKey.largeFiles,
      titleText: 'Large files',
      sizeText: '3.0 MB',
      isInitiallyExpanded: false,
      items: [],
      checkGroup: CheckGroupView(
        titleText: 'Check before deleting',
        items: [oldVideoItem],
      ),
    ),
  ],
  explore: ExploreView(
    titleText: 'Explore',
    introText: 'They are never selected for you.',
    items: [simulatorItem],
    adviceGroup: null,
  ),
  safeNumbers: [1],
  skipped: null,
  notices: [],
  sectionTotals: [
    SectionTotal(
      sectionKey: SectionKey.caches,
      allocatedBytes: 6000000,
      itemCount: 1,
      safeBytes: 6000000,
      adviceCount: 0,
    ),
    SectionTotal(
      sectionKey: SectionKey.developerTools,
      allocatedBytes: 1000000,
      itemCount: 1,
      safeBytes: 0,
      adviceCount: 0,
    ),
    SectionTotal(
      sectionKey: SectionKey.largeFiles,
      allocatedBytes: 3000000,
      itemCount: 1,
      safeBytes: 0,
      adviceCount: 0,
    ),
  ],
);

const PlannedEvent plannedEvent = PlannedEvent(
  planId: 7,
  lines: ['- 6.0 MB /Users/me/Library/Caches/ToolCache'],
  warningLines: ['Type DELETE to delete them permanently.'],
  items: [
    PlannedItemView(
      number: 1,
      key: 'catalog:tool-cache:/Users/me/Library/Caches/ToolCache',
      title: 'Tool cache',
      sectionKey: SectionKey.caches,
      risk: Risk.safe,
      allocatedBytes: 6000000,
    ),
  ],
  totalBytes: 6000000,
  holdsCareful: false,
);

/// The run of [plannedEvent], which removed its one item.
const DeletedEvent deletedEvent = DeletedEvent(
  lines: ['Freed 6.0 MB.'],
  outcomes: [
    DeletedOutcomeView(
      number: 1,
      key: 'catalog:tool-cache:/Users/me/Library/Caches/ToolCache',
      outcome: DeletedOutcome.removed,
      reasonKey: null,
      freedBytes: 6000000,
    ),
  ],
  freedBytes: 6000000,
  returnsLaterBytes: 0,
  availableBytesAfter: null,
  logPath: '/Users/me/Library/Logs/magic-free-disk-space/deletions.jsonl',
);

const StatusEvent deniedStatus = StatusEvent(
  fullDiskAccess: FullDiskAccess.denied,
  notices: [
    NoticeView(
      titleText: 'Full Disk Access is off',
      lines: ['A scan misses the protected folders.'],
      settingsLink: null,
    ),
  ],
);

/// Lets every answer of the fake bridge, which come as microtasks, arrive.
Future<void> waitForAnswers() {
  return Future<void>.delayed(Duration.zero);
}

void main() {
  late FakeCleanerBridge bridge;
  late CleanerController controller;

  setUp(() {
    bridge = FakeCleanerBridge(scanAnswer: scannedEvent)
      ..planAnswer = plannedEvent
      ..deleteAnswer = deletedEvent;
  });

  group('the status at start', () {
    test('a denied status gives the banner its notices', () async {
      bridge.answerStatus = () async => deniedStatus;

      controller = CleanerController(bridge: bridge);
      await waitForAnswers();

      expect(bridge.requestKinds, ['status']);
      expect(controller.statusNotices, deniedStatus.notices);
      expect((controller.state as IdleState).notice, isNull);
    });

    for (final FullDiskAccess fullDiskAccess in [
      FullDiskAccess.granted,
      FullDiskAccess.unknown,
    ]) {
      test('a status of ${fullDiskAccess.name} shows no banner', () async {
        bridge.answerStatus = () async =>
            StatusEvent(fullDiskAccess: fullDiskAccess, notices: const []);

        controller = CleanerController(bridge: bridge);
        await waitForAnswers();

        expect(controller.statusNotices, isEmpty);
      });
    }

    test(
      'a failed status shows no banner and no error, and a scan still runs',
      () async {
        bridge.answerStatus = () async => const FailedEvent(
          message: 'This tool runs on macOS only.',
          effect: FailureEffect.bridgeStopping,
        );

        controller = CleanerController(bridge: bridge);
        await waitForAnswers();

        expect(controller.statusNotices, isEmpty);
        expect((controller.state as IdleState).notice, isNull);
        await controller.scan();
        expect(controller.state, isA<ScannedState>());
      },
    );

    test(
      'a status whose bridge stopped shows no banner and no error',
      () async {
        bridge.answerStatus = () async => throw const BridgeStoppedException(
          exitCode: 1,
          stderrText: 'It wrote nothing to stderr.',
        );

        controller = CleanerController(bridge: bridge);
        await waitForAnswers();

        expect(controller.statusNotices, isEmpty);
        expect((controller.state as IdleState).notice, isNull);
      },
    );

    test(
      'a scan asked for while the status loads waits for it, then runs',
      () async {
        final Completer<StatusAnswer> pendingStatus = Completer<StatusAnswer>();
        bridge.answerStatus = () => pendingStatus.future;
        controller = CleanerController(bridge: bridge);

        final Future<void> scan = controller.scan();
        await waitForAnswers();

        expect(bridge.requestKinds, ['status']);
        expect(controller.state, isA<ScanningState>());

        pendingStatus.complete(deniedStatus);
        await scan;

        expect(bridge.requestKinds, ['status', 'scan']);
        expect(controller.statusNotices, deniedStatus.notices);
        expect((controller.state as ScannedState).scan, same(scannedEvent));
      },
    );

    test('a status that answers after dispose changes nothing', () async {
      final Completer<StatusAnswer> pendingStatus = Completer<StatusAnswer>();
      bridge.answerStatus = () => pendingStatus.future;
      controller = CleanerController(bridge: bridge);

      controller.dispose();
      pendingStatus.complete(deniedStatus);
      await waitForAnswers();

      expect(controller.statusNotices, isEmpty);
    });
  });

  group('over a granted status', () {
    setUp(() {
      controller = CleanerController(bridge: bridge);
    });

    Future<void> scanAndSelectSafe() async {
      await controller.scan();
      controller.selectSafeCandidates();
    }

    test('a scan reaches the scanned state through its progress', () async {
      final List<String> progressMessages = [];
      controller.addListener(() {
        final CleanerState state = controller.state;
        if (state is ScanningState) {
          progressMessages.add(state.progressMessage);
        }
      });

      await controller.scan();

      expect(progressMessages, contains('Measuring apps…'));
      final ScannedState state = controller.state as ScannedState;
      expect(state.scan, same(scannedEvent));
      expect(state.selectedNumbers, isEmpty);
    });

    test('select safe selects the safe numbers of the scan, not each item of safe risk', () async {
      await scanAndSelectSafe();

      expect((controller.state as ScannedState).selectedNumbers, {1});
    });

    test('a plan waits for its confirmation, and the word deletes the plan it showed', () async {
      await scanAndSelectSafe();
      controller.toggleCandidate(2);

      await controller.requestPlan();

      expect(bridge.plannedNumbers, [1, 2]);
      expect((controller.state as ConfirmingState).plan, same(plannedEvent));

      await controller.confirmDeletion('DELETE');

      expect(bridge.deleteRequest, (planId: 7, confirmation: 'DELETE'));
      expect((controller.state as DeletedState).lines, ['Freed 6.0 MB.']);
      expect(bridge.requestKinds, ['status', 'scan', 'plan', 'delete']);
    });

    test('a tick while the plan request is pending changes nothing', () async {
      await scanAndSelectSafe();

      final Future<void> planRequest = controller.requestPlan();
      controller.toggleCandidate(2);

      expect((controller.state as ScannedState).selectedNumbers, {1});
      await planRequest;
      expect(bridge.plannedNumbers, [1]);
    });

    test(
      'cancelling the confirmation sends nothing and keeps the selection',
      () async {
        await scanAndSelectSafe();
        await controller.requestPlan();

        controller.cancelConfirmation();

        expect(bridge.deleteRequest, isNull);
        final ScannedState state = controller.state as ScannedState;
        expect(state.selectedNumbers, {1});
        expect(state.notice, isNull);
      },
    );

    test('cancelled keeps the list with the message of the bridge', () async {
      bridge.deleteAnswer = const CancelledEvent(
        message: 'Cancelled. Nothing was deleted.',
      );
      await scanAndSelectSafe();
      await controller.requestPlan();

      await controller.confirmDeletion('delete');

      final ScannedState state = controller.state as ScannedState;
      expect(state.scan, same(scannedEvent));
      expect(state.selectedNumbers, {1});
      expect(state.notice, 'Cancelled. Nothing was deleted.');
    });

    test(
      'nothing approved keeps the list with the lines of the bridge',
      () async {
        bridge.planAnswer = const NothingApprovedEvent(
          lines: ['Nothing of the selection can be deleted.'],
        );
        await scanAndSelectSafe();

        await controller.requestPlan();

        expect(
          (controller.state as ScannedState).notice,
          'Nothing of the selection can be deleted.',
        );
      },
    );

    test('failed with the scan dropped goes back to idle', () async {
      bridge.deleteAnswer = const FailedEvent(
        message: 'The scan is older than an hour; scan again.',
        effect: FailureEffect.scanDropped,
      );
      await scanAndSelectSafe();
      await controller.requestPlan();

      await controller.confirmDeletion('DELETE');

      expect(
        (controller.state as IdleState).notice,
        'The scan is older than an hour; scan again.',
      );
    });

    test('failed with the bridge stopping goes back to idle', () async {
      bridge.planAnswer = const FailedEvent(
        message: 'This tool runs on macOS only.',
        effect: FailureEffect.bridgeStopping,
      );
      await scanAndSelectSafe();

      await controller.requestPlan();

      expect(
        (controller.state as IdleState).notice,
        'This tool runs on macOS only.',
      );
    });

    test('failed with the scan kept keeps the list with the message', () async {
      bridge.planAnswer = const FailedEvent(
        message: 'No item has the number 4.',
        effect: FailureEffect.scanKept,
      );
      await scanAndSelectSafe();

      await controller.requestPlan();

      final ScannedState state = controller.state as ScannedState;
      expect(state.notice, 'No item has the number 4.');
    });

    test('a request that throws goes back to idle with the error', () async {
      bridge.scanError = const FormatException(
        'A bridge line is not an event.',
      );

      await controller.scan();

      expect(
        (controller.state as IdleState).notice,
        contains('A bridge line is not an event.'),
      );
    });

    test('a deletion that throws warns that some items may be gone', () async {
      bridge.deleteError = const FormatException('The bridge stopped.');
      await scanAndSelectSafe();
      await controller.requestPlan();

      await controller.confirmDeletion('DELETE');

      final String? notice = (controller.state as IdleState).notice;
      expect(notice, startsWith('The deletion stopped before its answer'));
      expect(notice, contains('The bridge stopped.'));
    });

    test('an answer after dispose changes nothing', () async {
      bridge.scanError = const FormatException('The bridge was stopped.');

      final Future<void> scan = controller.scan();
      controller.dispose();
      await scan;

      expect(controller.state, isA<ScanningState>());
    });
  });
}
