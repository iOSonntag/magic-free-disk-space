import 'package:flutter/foundation.dart';

import '../bridge/bridge_event.dart';

abstract interface class CleanerBridge {
  Future<BridgeEvent> scan({required void Function(String message) onProgress});

  Future<BridgeEvent> plan(List<int> numbers);

  Future<BridgeEvent> delete({
    required int planId,
    required String confirmation,
  });
}

sealed class CleanerState {
  const CleanerState();
}

final class IdleState extends CleanerState {
  const IdleState({this.notice});

  final String? notice;
}

final class ScanningState extends CleanerState {
  const ScanningState({required this.progressMessage});

  final String progressMessage;
}

final class ScannedState extends CleanerState {
  const ScannedState({
    required this.scan,
    required this.selectedNumbers,
    this.notice,
  });

  final ScannedEvent scan;
  final Set<int> selectedNumbers;
  final String? notice;
}

final class DeletingState extends CleanerState {
  const DeletingState();
}

final class DeletedState extends CleanerState {
  const DeletedState({required this.lines});

  final List<String> lines;
}

final class FailedState extends CleanerState {
  const FailedState({required this.message});

  final String message;
}

const String cancelledNotice = 'Cancelled. Nothing was deleted.';

class CleanerController extends ChangeNotifier {
  CleanerController({required this._bridge});

  final CleanerBridge _bridge;
  CleanerState _state = const IdleState();
  bool _isRequestPending = false;

  CleanerState get state => _state;

  bool get isRequestPending => _isRequestPending;

  Future<void> scan() async {
    if (_isRequestPending) {
      return;
    }
    _setState(const ScanningState(progressMessage: 'Starting the scan…'));
    final BridgeEvent? answer = await _request(
      () => _bridge.scan(
        onProgress: (String message) {
          _setState(ScanningState(progressMessage: message));
        },
      ),
    );
    switch (answer) {
      case null:
        return;
      case ScannedEvent():
        _setState(ScannedState(scan: answer, selectedNumbers: const {}));
      case FailedEvent():
        _setState(IdleState(notice: answer.message));
      default:
        _setUnexpectedAnswer(answer);
    }
  }

  void toggle(int number) {
    final CleanerState current = _state;
    if (current is! ScannedState) {
      return;
    }
    final Set<int> selectedNumbers = {...current.selectedNumbers};
    if (!selectedNumbers.remove(number)) {
      selectedNumbers.add(number);
    }
    _setState(
      ScannedState(scan: current.scan, selectedNumbers: selectedNumbers),
    );
  }

  void selectSafe() {
    final CleanerState current = _state;
    if (current is! ScannedState) {
      return;
    }
    final Set<int> safeNumbers = {
      for (final CandidateView candidate in current.scan.candidates)
        if (candidate.risk == Risk.safe) candidate.number,
    };
    _setState(ScannedState(scan: current.scan, selectedNumbers: safeNumbers));
  }

  void clearSelection() {
    final CleanerState current = _state;
    if (current is! ScannedState) {
      return;
    }
    _setState(ScannedState(scan: current.scan, selectedNumbers: const {}));
  }

  /// Returns the [PlannedEvent] or [NothingApprovedEvent] for the page to
  /// show, or null when the answer went into [state] instead.
  Future<BridgeEvent?> requestPlan() async {
    final CleanerState current = _state;
    if (current is! ScannedState || _isRequestPending) {
      return null;
    }
    final List<int> numbers = current.selectedNumbers.toList()..sort();
    final BridgeEvent? answer = await _request(() => _bridge.plan(numbers));
    switch (answer) {
      case null:
        return null;
      case PlannedEvent() || NothingApprovedEvent():
        return answer;
      case FailedEvent():
        _setFailedAnswer(answer, current);
        return null;
      default:
        _setUnexpectedAnswer(answer);
        return null;
    }
  }

  Future<void> delete({
    required int planId,
    required String confirmation,
  }) async {
    final CleanerState current = _state;
    if (current is! ScannedState || _isRequestPending) {
      return;
    }
    _setState(const DeletingState());
    final BridgeEvent? answer = await _request(
      () => _bridge.delete(planId: planId, confirmation: confirmation),
    );
    switch (answer) {
      case null:
        return;
      case DeletedEvent():
        _setState(DeletedState(lines: answer.lines));
      case CancelledEvent():
        _setState(
          ScannedState(
            scan: current.scan,
            selectedNumbers: current.selectedNumbers,
            notice: cancelledNotice,
          ),
        );
      case FailedEvent():
        _setFailedAnswer(answer, current);
      default:
        _setUnexpectedAnswer(answer);
    }
  }

  /// Runs one request to the bridge; returns null when it threw, after
  /// moving to [FailedState].
  Future<BridgeEvent?> _request(Future<BridgeEvent> Function() send) async {
    _isRequestPending = true;
    try {
      return await send();
    } catch (error) {
      _setState(FailedState(message: '$error'));
      return null;
    } finally {
      _isRequestPending = false;
    }
  }

  void _setFailedAnswer(FailedEvent answer, ScannedState scanned) {
    if (answer.isScanDropped) {
      _setState(IdleState(notice: answer.message));
      return;
    }
    _setState(
      ScannedState(
        scan: scanned.scan,
        selectedNumbers: scanned.selectedNumbers,
        notice: answer.message,
      ),
    );
  }

  void _setUnexpectedAnswer(BridgeEvent answer) {
    _setState(
      FailedState(
        message:
            'The bridge answered with an unexpected ${answer.runtimeType}.',
      ),
    );
  }

  void _setState(CleanerState state) {
    _state = state;
    notifyListeners();
  }
}
