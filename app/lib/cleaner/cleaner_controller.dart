import 'dart:async';

import 'package:flutter/foundation.dart';

import '../bridge/bridge.dart';
import 'cleaner_bridge.dart';

sealed class CleanerState {
  const CleanerState();
}

final class IdleState extends CleanerState {
  const IdleState({this.notice});

  final String? notice;
}

final class ScanningState extends CleanerState {
  const ScanningState({this.progress});

  /// The bridge's latest progress, with the sections found so far; `null`
  /// until its first.
  final ProgressEvent? progress;
}

/// A state that holds a scan and the numbers selected of it.
sealed class ListedState extends CleanerState {
  const ListedState({required this.scan, required this.selectedNumbers});

  final ScannedEvent scan;
  final Set<int> selectedNumbers;
}

/// A step of the delete flow, which covers the pages: a plan under review,
/// its deletion, and its result.
sealed class RemovalFlowState implements CleanerState {}

final class ScannedState extends ListedState {
  const ScannedState({
    required super.scan,
    required super.selectedNumbers,
    this.notice,
  });

  final String? notice;
}

/// The plan of the selection waits for its confirmation word.
final class ConfirmingState extends ListedState implements RemovalFlowState {
  const ConfirmingState({
    required super.scan,
    required super.selectedNumbers,
    required this.plan,
    this.isReplanning = false,
  });

  final PlannedEvent plan;

  /// Whether the selection lost an item since [plan] and its new plan is on
  /// its way; [plan] then deletes more than the selection, so it is never
  /// confirmed.
  final bool isReplanning;
}

final class DeletingState extends CleanerState implements RemovalFlowState {
  const DeletingState({required this.plan});

  final PlannedEvent plan;
}

final class DeletedState extends CleanerState implements RemovalFlowState {
  const DeletedState({
    required this.result,
    required this.scan,
    required this.plan,
  });

  final DeletedEvent result;

  /// The scan the plan was made of, which describes the disk before the run.
  final ScannedEvent scan;

  /// The plan the run deleted, which names the items of its outcomes.
  final PlannedEvent plan;
}

const String _deletionStoppedText =
    'The deletion stopped before its answer, so some items may already be '
    'gone. Scan again to see what is left.';

class CleanerController extends ChangeNotifier {
  /// Asks the bridge for its status at once.
  CleanerController({required this._bridge}) {
    unawaited(_loadStatusNotices());
  }

  final CleanerBridge _bridge;
  CleanerState _state = const IdleState();
  List<NoticeView> _statusNotices = const [];
  bool _isRequestPending = false;
  bool _isDisposed = false;

  CleanerState get state => _state;

  /// The notices of the bridge's status, shown over every state; empty while
  /// it loads and when it failed.
  List<NoticeView> get statusNotices => _statusNotices;

  @override
  void dispose() {
    _isDisposed = true;
    super.dispose();
  }

  Future<void> scan() async {
    if (_isRequestPending) {
      return;
    }
    _setState(const ScanningState());
    final ScanAnswer? answer = await _request(
      () => _bridge.scan(
        onProgress: (ProgressEvent progress) {
          _setState(ScanningState(progress: progress));
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

  /// Ticks every item of [numbers] while any of them is unticked, else
  /// unticks them all, in one change of the selection.
  void toggleCandidateGroup(List<int> numbers) {
    _select((ScannedState current) {
      final Set<int> selectedNumbers = {...current.selectedNumbers};
      if (numbers.every(selectedNumbers.contains)) {
        selectedNumbers.removeAll(numbers);
      } else {
        selectedNumbers.addAll(numbers);
      }
      return selectedNumbers;
    });
  }

  void selectSafeCandidates() {
    _select((ScannedState current) => {...current.scan.safeNumbers});
  }

  void clearSelection() {
    _select((ScannedState _) => const {});
  }

  Future<void> requestPlan() async {
    final CleanerState current = _state;
    if (current is! ScannedState || _isRequestPending) {
      return;
    }
    await _planSelection(current);
  }

  /// Takes [number] out of the plan under review and plans what is left of
  /// the selection again; with nothing left, shows the list.
  Future<void> removeCandidateFromPlan(int number) async {
    final CleanerState current = _state;
    if (current is! ConfirmingState ||
        current.isReplanning ||
        _isRequestPending ||
        !current.selectedNumbers.contains(number)) {
      return;
    }
    final Set<int> selectedNumbers = {...current.selectedNumbers}
      ..remove(number);
    if (selectedNumbers.isEmpty) {
      _setState(ScannedState(scan: current.scan, selectedNumbers: const {}));
      return;
    }
    final ConfirmingState replanning = ConfirmingState(
      scan: current.scan,
      selectedNumbers: selectedNumbers,
      plan: current.plan,
      isReplanning: true,
    );
    _setState(replanning);
    await _planSelection(replanning);
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
    if (current is! ConfirmingState ||
        current.isReplanning ||
        _isRequestPending) {
      return;
    }
    _setState(DeletingState(plan: current.plan));
    final DeleteAnswer? answer = await _request(
      () => _bridge.delete(
        planId: current.plan.planId,
        confirmation: confirmation,
      ),
      errorLead: _deletionStoppedText,
    );
    switch (answer) {
      case null:
        return;
      case DeletedEvent():
        _setState(
          DeletedState(result: answer, scan: current.scan, plan: current.plan),
        );
      case CancelledEvent():
        _showList(current, notice: answer.message);
      case FailedEvent():
        _setFailedAnswer(answer, current);
    }
  }

  /// Leaves the Result of a run for a new scan, because the run changed the
  /// disk its scan describes.
  Future<void> finishDeletion() async {
    if (_state is! DeletedState) {
      return;
    }
    await scan();
  }

  /// Asks the bridge to plan the selection of [waiting], the state shown
  /// meanwhile; an answer that comes after the user left [waiting] is
  /// dropped.
  Future<void> _planSelection(ListedState waiting) async {
    final List<int> numbers = waiting.selectedNumbers.toList()..sort();
    final PlanAnswer? answer = await _request(() => _bridge.plan(numbers));
    if (answer == null || !identical(_state, waiting)) {
      return;
    }
    switch (answer) {
      case PlannedEvent():
        _setState(
          ConfirmingState(
            scan: waiting.scan,
            selectedNumbers: waiting.selectedNumbers,
            plan: answer,
          ),
        );
      case NothingApprovedEvent():
        _showList(waiting, notice: answer.lines.join('\n'));
      case FailedEvent():
        _setFailedAnswer(answer, waiting);
    }
  }

  /// Replaces the selection of the scan with the one [pick] returns; the
  /// notice of the scan goes with the old selection.
  void _select(Set<int> Function(ScannedState current) pick) {
    final CleanerState current = _state;
    // The answer of a pending plan request keeps the selection it was sent
    // with, so a tick meanwhile would be lost.
    if (current is! ScannedState || _isRequestPending) {
      return;
    }
    _setState(ScannedState(scan: current.scan, selectedNumbers: pick(current)));
  }

  /// Runs one request to the bridge; returns null when it threw, after
  /// moving to an [IdleState] whose notice is the error, below [errorLead]
  /// when given.
  Future<TAnswer?> _request<TAnswer>(
    Future<TAnswer> Function() send, {
    String? errorLead,
  }) async {
    _isRequestPending = true;
    try {
      return await send();
    } catch (error) {
      final String notice = errorLead == null ? '$error' : '$errorLead\n$error';
      _setState(IdleState(notice: notice));
      return null;
    } finally {
      _isRequestPending = false;
    }
  }

  /// A status that failed or threw leaves the notices empty and the state as
  /// it is; the next request starts the bridge again.
  Future<void> _loadStatusNotices() async {
    final StatusAnswer answer;
    try {
      answer = await _bridge.status();
    } catch (_) {
      return;
    }
    switch (answer) {
      case StatusEvent():
        _setStatusNotices(answer.notices);
      case FailedEvent():
        return;
    }
  }

  void _setFailedAnswer(FailedEvent answer, ListedState listed) {
    switch (answer.effect) {
      case FailureEffect.scanKept:
        _showList(listed, notice: answer.message);
      case FailureEffect.scanDropped || FailureEffect.bridgeStopping:
        _setState(IdleState(notice: answer.message));
    }
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
    // The answer of a request may come after the page that held the
    // controller went away.
    if (_isDisposed) {
      return;
    }
    _state = state;
    notifyListeners();
  }

  void _setStatusNotices(List<NoticeView> notices) {
    // The status may answer after the page that held the controller went
    // away.
    if (_isDisposed) {
      return;
    }
    _statusNotices = notices;
    notifyListeners();
  }
}
