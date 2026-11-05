import 'package:magic_free_disk_space/bridge/bridge_event.dart';
import 'package:magic_free_disk_space/cleaner/cleaner_bridge.dart';

const StatusEvent grantedStatus = StatusEvent(
  fullDiskAccess: FullDiskAccess.granted,
  notices: [],
);

/// The progress the fake bridge sends before each scan answer.
const ProgressEvent appsProgress = ProgressEvent(
  message: 'Measuring apps…',
  phase: ScanPhase.apps,
  found: [],
);

/// A bridge that answers with what the test set on it and records the kind
/// of each request when it is sent; like the process client, it sends each
/// request only after the answer of the one before.
final class FakeCleanerBridge implements CleanerBridge {
  FakeCleanerBridge({required this.scanAnswer});

  ScanAnswer scanAnswer;
  Future<StatusAnswer> Function() answerStatus = () async => grantedStatus;
  late PlanAnswer planAnswer;
  late DeleteAnswer deleteAnswer;
  Object? scanError;
  Object? deleteError;
  List<int>? plannedNumbers;
  ({int planId, String confirmation})? deleteRequest;
  final List<String> requestKinds = [];
  Future<void>? _previousRequest;

  @override
  Future<StatusAnswer> status() {
    return _answerRequest('status', answerStatus);
  }

  @override
  Future<ScanAnswer> scan({
    required void Function(ProgressEvent progress) onProgress,
  }) {
    return _answerRequest('scan', () async {
      final Object? error = scanError;
      if (error != null) {
        throw error;
      }
      onProgress(appsProgress);
      return scanAnswer;
    });
  }

  @override
  Future<PlanAnswer> plan(List<int> numbers) {
    return _answerRequest('plan', () async {
      plannedNumbers = numbers;
      return planAnswer;
    });
  }

  @override
  Future<DeleteAnswer> delete({
    required int planId,
    required String confirmation,
  }) {
    return _answerRequest('delete', () async {
      deleteRequest = (planId: planId, confirmation: confirmation);
      final Object? error = deleteError;
      if (error != null) {
        throw error;
      }
      return deleteAnswer;
    });
  }

  Future<TAnswer> _answerRequest<TAnswer>(
    String kind,
    Future<TAnswer> Function() answer,
  ) {
    // A future made in setUp would answer outside the fake time of a widget
    // test, so the first request awaits nothing.
    final Future<void>? previous = _previousRequest;
    Future<TAnswer> sendAfterPrevious() async {
      if (previous != null) {
        await previous;
      }
      requestKinds.add(kind);
      return answer();
    }

    final Future<TAnswer> result = sendAfterPrevious();
    _previousRequest = result.then<void>((TAnswer _) {}, onError: (_) {});
    return result;
  }
}
