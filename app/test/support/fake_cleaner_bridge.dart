import 'package:magic_free_disk_space/bridge/bridge_event.dart';
import 'package:magic_free_disk_space/cleaner/cleaner_bridge.dart';

const StatusEvent grantedStatus = StatusEvent(
  fullDiskAccess: FullDiskAccess.granted,
  notices: [],
);

/// A bridge that answers with what the test set on it and records the kind
/// of each request; like the process client, it throws a [StateError] on a
/// request sent while another is pending.
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
  bool _isRequestPending = false;

  @override
  Future<StatusAnswer> status() {
    return _answerRequest('status', answerStatus);
  }

  @override
  Future<ScanAnswer> scan({required void Function(String message) onProgress}) {
    return _answerRequest('scan', () async {
      final Object? error = scanError;
      if (error != null) {
        throw error;
      }
      onProgress('Measuring apps…');
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
  ) async {
    if (_isRequestPending) {
      throw StateError('A request to the bridge is still pending.');
    }
    requestKinds.add(kind);
    _isRequestPending = true;
    try {
      return await answer();
    } finally {
      _isRequestPending = false;
    }
  }
}
