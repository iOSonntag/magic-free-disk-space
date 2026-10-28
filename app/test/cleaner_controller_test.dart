import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_event.dart';
import 'package:magic_free_disk_space/cleaner/cleaner_bridge.dart';
import 'package:magic_free_disk_space/cleaner/cleaner_controller.dart';

const ScannedEvent scannedEvent = ScannedEvent(
  summaryText: 'Found 2 items',
  candidates: [
    CandidateView(
      number: 1,
      title: 'Tool cache',
      path: '/Users/me/Library/Caches/ToolCache',
      risk: Risk.safe,
      explanation: '',
      regeneration: '',
      sizeText: '6.0 MiB',
    ),
    CandidateView(
      number: 2,
      title: 'Old video',
      path: '/Users/me/Movies/holiday.mov',
      risk: Risk.careful,
      explanation: '',
      regeneration: '',
      sizeText: '3.0 MiB',
    ),
  ],
  notesLines: [],
);

const PlannedEvent plannedEvent = PlannedEvent(
  planId: 7,
  lines: ['- 6.0 MiB /Users/me/Library/Caches/ToolCache'],
  warningLines: ['Type DELETE to delete them permanently.'],
);

final class FakeCleanerBridge implements CleanerBridge {
  PlanAnswer planAnswer = plannedEvent;
  DeleteAnswer deleteAnswer = const DeletedEvent(lines: ['Freed 6.0 MiB.']);
  Object? scanError;
  List<int>? plannedNumbers;
  ({int planId, String confirmation})? deleteRequest;

  @override
  Future<ScanAnswer> scan({
    required void Function(String message) onProgress,
  }) async {
    final Object? error = scanError;
    if (error != null) {
      throw error;
    }
    onProgress('Measuring apps…');
    return scannedEvent;
  }

  @override
  Future<PlanAnswer> plan(List<int> numbers) async {
    plannedNumbers = numbers;
    return planAnswer;
  }

  @override
  Future<DeleteAnswer> delete({
    required int planId,
    required String confirmation,
  }) async {
    deleteRequest = (planId: planId, confirmation: confirmation);
    return deleteAnswer;
  }
}

void main() {
  late FakeCleanerBridge bridge;
  late CleanerController controller;

  setUp(() {
    bridge = FakeCleanerBridge();
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

  test('select safe selects the numbers of safe risk only', () async {
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
    expect((controller.state as DeletedState).lines, ['Freed 6.0 MiB.']);
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
      isScanDropped: true,
    );
    await scanAndSelectSafe();
    await controller.requestPlan();

    await controller.confirmDeletion('DELETE');

    expect(
      (controller.state as IdleState).notice,
      'The scan is older than an hour; scan again.',
    );
  });

  test('failed with the scan kept keeps the list with the message', () async {
    bridge.planAnswer = const FailedEvent(
      message: 'No item has the number 4.',
      isScanDropped: false,
    );
    await scanAndSelectSafe();

    await controller.requestPlan();

    final ScannedState state = controller.state as ScannedState;
    expect(state.notice, 'No item has the number 4.');
  });

  test('a request that throws goes back to idle with the error', () async {
    bridge.scanError = const FormatException('A bridge line is not an event.');

    await controller.scan();

    expect(
      (controller.state as IdleState).notice,
      contains('A bridge line is not an event.'),
    );
  });
}
