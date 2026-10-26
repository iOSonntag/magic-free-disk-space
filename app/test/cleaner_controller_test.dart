import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_event.dart';
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
  confirmationWord: 'DELETE',
);

final class FakeCleanerBridge implements CleanerBridge {
  BridgeEvent planAnswer = plannedEvent;
  BridgeEvent deleteAnswer = const DeletedEvent(lines: ['Freed 6.0 MiB.']);
  List<int>? plannedNumbers;
  ({int planId, String confirmation})? deleteRequest;

  @override
  Future<BridgeEvent> scan({
    required void Function(String message) onProgress,
  }) async {
    onProgress('Measuring apps…');
    return scannedEvent;
  }

  @override
  Future<BridgeEvent> plan(List<int> numbers) async {
    plannedNumbers = numbers;
    return planAnswer;
  }

  @override
  Future<BridgeEvent> delete({
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

  Future<ScannedState> scanAndSelectSafe() async {
    await controller.scan();
    controller.selectSafe();
    return controller.state as ScannedState;
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
    final ScannedState state = await scanAndSelectSafe();

    expect(state.selectedNumbers, {1});
  });

  test('a plan and a delete reach the deleted state', () async {
    await scanAndSelectSafe();
    controller.toggle(2);

    final BridgeEvent? answer = await controller.requestPlan();
    expect(answer, same(plannedEvent));
    expect(bridge.plannedNumbers, [1, 2]);

    await controller.delete(planId: 7, confirmation: 'DELETE');

    expect(bridge.deleteRequest, (planId: 7, confirmation: 'DELETE'));
    final DeletedState state = controller.state as DeletedState;
    expect(state.lines, ['Freed 6.0 MiB.']);
  });

  test('cancelled keeps the list with the notice', () async {
    bridge.deleteAnswer = const CancelledEvent();
    await scanAndSelectSafe();
    await controller.requestPlan();

    await controller.delete(planId: 7, confirmation: 'delete');

    final ScannedState state = controller.state as ScannedState;
    expect(state.scan, same(scannedEvent));
    expect(state.selectedNumbers, {1});
    expect(state.notice, cancelledNotice);
  });

  test('failed with the scan dropped goes back to idle', () async {
    bridge.deleteAnswer = const FailedEvent(
      message: 'The scan is older than an hour; scan again.',
      isScanDropped: true,
    );
    await scanAndSelectSafe();
    await controller.requestPlan();

    await controller.delete(planId: 7, confirmation: 'DELETE');

    final IdleState state = controller.state as IdleState;
    expect(state.notice, 'The scan is older than an hour; scan again.');
  });

  test('failed with the scan kept keeps the list with the message', () async {
    bridge.planAnswer = const FailedEvent(
      message: 'No plan with this number is waiting.',
      isScanDropped: false,
    );
    await scanAndSelectSafe();

    final BridgeEvent? answer = await controller.requestPlan();

    expect(answer, isNull);
    final ScannedState state = controller.state as ScannedState;
    expect(state.notice, 'No plan with this number is waiting.');
  });
}
