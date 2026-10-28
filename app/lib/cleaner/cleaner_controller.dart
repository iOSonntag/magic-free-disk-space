import 'package:flutter/foundation.dart';

import '../bridge/bridge_event.dart';

abstract interface class CleanerBridge {
  Future<ScanAnswer> scan({required void Function(String message) onProgress});

  Future<PlanAnswer> plan(List<int> numbers);

  Future<DeleteAnswer> delete({
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

/// A state that holds a scan and the numbers selected of it.
sealed class ListedState extends CleanerState {
  const ListedState({required this.scan, required this.selectedNumbers});

  final ScannedEvent scan;
  final Set<int> selectedNumbers;
}

final class ScannedState extends ListedState {
  const ScannedState({
    required super.scan,
    required super.selectedNumbers,
    this.notice,
  });

  final String? notice;
}

/// The plan of the selection waits for its confirmation word.
final class ConfirmingState extends ListedState {
  const ConfirmingState({
    required super.scan,
    required super.selectedNumbers,
    required this.plan,
  });

  final PlannedEvent plan;
}

final class DeletingState extends CleanerState {
  const DeletingState();
}

final class DeletedState extends CleanerState {
  const DeletedState({required this.lines});

  final List<String> lines;
}

class CleanerController extends ChangeNotifier {
  CleanerController({required this._bridge});

  final CleanerBridge _bridge;
  CleanerState _state = const IdleState();
  bool _isRequestPending = false;

  CleanerState get state => _state;

  Future<void> scan() async {
    if (_isRequestPending) {
      return;
    }
    _setState(const ScanningState(progressMessage: 'Starting the scan…'));
    final ScanAnswer? answer = await _request(
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
    }
  }

  void toggleCandidate(int number) {
    _select((ScannedState current) {
      final Set<int> selectedNumbers = {...current.selectedNumbers};
      if (!selectedNumbers.remove(number)) {
        selectedNumbers.add(number);
      }
      return selectedNumbers;
    });
  }

  void selectSafeCandidates() {
    _select(
      (ScannedState current) => {
        for (final CandidateView candidate in current.scan.candidates)
          if (candidate.risk == Risk.safe) candidate.number,
      },
    );
  }

  void clearSelection() {
    _select((ScannedState _) => const {});
  }

  Future<void> requestPlan() async {
    final CleanerState current = _state;
    if (current is! ScannedState || _isRequestPending) {
      return;
    }
    final List<int> numbers = current.selectedNumbers.toList()..sort();
    final PlanAnswer? answer = await _request(() => _bridge.plan(numbers));
    switch (answer) {
      case null:
        return;
      case PlannedEvent():
        _setState(
          ConfirmingState(
            scan: current.scan,
            selectedNumbers: current.selectedNumbers,
            plan: answer,
          ),
        );
      case NothingApprovedEvent():
        _showList(current, notice: answer.lines.join('\n'));
      case FailedEvent():
        _setFailedAnswer(answer, current);
    }
  }

  void cancelConfirmation() {
    final CleanerState current = _state;
    if (current is! ConfirmingState) {
      return;
    }
    _showList(current);
  }

  Future<void> confirmDeletion(String confirmation) async {
    final CleanerState current = _state;
    if (current is! ConfirmingState || _isRequestPending) {
      return;
    }
    _setState(const DeletingState());
    final DeleteAnswer? answer = await _request(
      () => _bridge.delete(
        planId: current.plan.planId,
        confirmation: confirmation,
      ),
    );
    switch (answer) {
      case null:
        return;
      case DeletedEvent():
        _setState(DeletedState(lines: answer.lines));
      case CancelledEvent():
        _showList(current, notice: answer.message);
      case FailedEvent():
        _setFailedAnswer(answer, current);
    }
  }

  /// Replaces the selection of the scan with the one [pick] returns; the
  /// notice of the scan goes with the old selection.
  void _select(Set<int> Function(ScannedState current) pick) {
    final CleanerState current = _state;
    if (current is! ScannedState) {
      return;
    }
    _setState(ScannedState(scan: current.scan, selectedNumbers: pick(current)));
  }

  /// Runs one request to the bridge; returns null when it threw, after
  /// moving to an [IdleState] with the error as its notice.
  Future<TAnswer?> _request<TAnswer>(Future<TAnswer> Function() send) async {
    _isRequestPending = true;
    try {
      return await send();
    } catch (error) {
      _setState(IdleState(notice: '$error'));
      return null;
    } finally {
      _isRequestPending = false;
    }
  }

  void _setFailedAnswer(FailedEvent answer, ListedState listed) {
    if (answer.isScanDropped) {
      _setState(IdleState(notice: answer.message));
      return;
    }
    _showList(listed, notice: answer.message);
  }

  /// Shows the list of [listed] with its selection and no plan.
  void _showList(ListedState listed, {String? notice}) {
    _setState(
      ScannedState(
        scan: listed.scan,
        selectedNumbers: listed.selectedNumbers,
        notice: notice,
      ),
    );
  }

  void _setState(CleanerState state) {
    _state = state;
    notifyListeners();
  }
}
