import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge.dart';
import 'package:magic_free_disk_space/cleaner/cleaner.dart';

const StatusEvent grantedStatus = StatusEvent(
  fullDiskAccess: FullDiskAccess.granted,
  notices: [],
);

/// The progress the fake bridge sends before each scan answer, unless the
/// test sets another.
const ProgressEvent appsProgress = ProgressEvent(
  message: 'Measuring apps…',
  phase: ScanPhase.apps,
  found: [],
);

/// A bridge that answers with what the test set on it and records the kind
/// of each request when it is sent; like the process client, it sends each
/// request only after the answer of the one before, a held one included.
final class FakeCleanerBridge implements CleanerBridge {
  FakeCleanerBridge({required this.scanAnswer});

  ScanAnswer scanAnswer;
  ProgressEvent scanProgress = appsProgress;
  Future<StatusAnswer> Function() answerStatus = () async => grantedStatus;
  late PlanAnswer planAnswer;
  late DeleteAnswer deleteAnswer;
  Object? scanError;
  Object? deleteError;
  List<int>? plannedNumbers;
  ({int planId, String confirmation})? deleteRequest;
  final List<String> requestKinds = [];
  Future<void>? _previousRequest;
  Completer<ScanAnswer>? _heldScan;
  Completer<DeleteAnswer>? _heldDelete;

  /// Holds the next scan after its progress until the test completes the
  /// returned answer; the scan after it answers [scanAnswer] again.
  Completer<ScanAnswer> holdNextScan() {
    final Completer<ScanAnswer> heldScan = Completer<ScanAnswer>();
    _heldScan = heldScan;
    return heldScan;
  }

  /// Holds the next delete, once it is recorded in [deleteRequest], until
  /// the test completes the returned answer.
  Completer<DeleteAnswer> holdNextDelete() {
    final Completer<DeleteAnswer> heldDelete = Completer<DeleteAnswer>();
    _heldDelete = heldDelete;
    return heldDelete;
  }

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
      onProgress(scanProgress);
      final Completer<ScanAnswer>? heldScan = _heldScan;
      if (heldScan != null) {
        _heldScan = null;
        return heldScan.future;
      }
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
      final Completer<DeleteAnswer>? heldDelete = _heldDelete;
      if (heldDelete != null) {
        _heldDelete = null;
        return heldDelete.future;
      }
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

/// A cleaner on [bridge] that starts its scan at once, as the app's does;
/// disposed at tear-down.
CleanerController startScanningCleaner(FakeCleanerBridge bridge) {
  final CleanerController controller = CleanerController(bridge: bridge);
  addTearDown(controller.dispose);
  unawaited(controller.scan());
  return controller;
}
