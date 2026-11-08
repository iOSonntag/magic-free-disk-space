import 'dart:async';

import 'package:flutter/foundation.dart';

import '../bridge/bridge.dart';
import 'update_bridge.dart';

/// The switch "Look for updates at start" as the menu shows it.
sealed class UpdateCheckSwitch {
  const UpdateCheckSwitch();
}

/// The check at start still runs, so the stored value is not known yet.
final class UpdateCheckSwitchLoading extends UpdateCheckSwitch {
  const UpdateCheckSwitchLoading();
}

/// The bridge answered the stored value.
final class UpdateCheckSwitchConfirmed extends UpdateCheckSwitch {
  const UpdateCheckSwitchConfirmed({required this.isEnabled});

  final bool isEnabled;
}

final class UpdateCheckSwitchSaving extends UpdateCheckSwitch {
  const UpdateCheckSwitchSaving({required this.isEnabled});

  /// The value the save asks for; the confirmed one is its opposite.
  final bool isEnabled;
}

/// The check at start threw, or the bridge is older than the update check.
final class UpdateCheckSwitchUnavailable extends UpdateCheckSwitch {
  const UpdateCheckSwitchUnavailable();
}

class UpdateController extends ChangeNotifier {
  /// Asks the bridge for an update at once; a check that fails or throws
  /// shows nothing and leaves the switch unavailable.
  UpdateController({required this._bridge}) {
    unawaited(_checkUpdate());
  }

  final UpdateBridge _bridge;
  UpdateCheckSwitch _switch = const UpdateCheckSwitchLoading();
  UpdateNoticeView? _notice;
  String? _saveFailureText;
  bool _isDisposed = false;

  UpdateCheckSwitch get updateCheckSwitch => _switch;

  /// Set only when the check at start found a newer release.
  UpdateNoticeView? get notice => _notice;

  /// Why the last change of the switch was not saved; cleared by the next
  /// change.
  String? get saveFailureText => _saveFailureText;

  @override
  void dispose() {
    _isDisposed = true;
    super.dispose();
  }

  /// Saves [isEnabled] when the switch holds the opposite; a change while the
  /// check loads, a save runs, or the switch is unavailable is ignored.
  Future<void> setUpdateCheck(bool isEnabled) async {
    switch (_switch) {
      case UpdateCheckSwitchLoading() ||
          UpdateCheckSwitchSaving() ||
          UpdateCheckSwitchUnavailable():
        return;
      case UpdateCheckSwitchConfirmed(isEnabled: final bool confirmedValue):
        if (confirmedValue == isEnabled) {
          return;
        }
    }
    _setShownState(
      updateCheckSwitch: UpdateCheckSwitchSaving(isEnabled: isEnabled),
      saveFailureText: null,
    );
    final UpdateCheckSetAnswer answer;
    try {
      answer = await _bridge.setUpdateCheck(isEnabled);
    } catch (error) {
      _setShownState(
        updateCheckSwitch: UpdateCheckSwitchConfirmed(isEnabled: !isEnabled),
        saveFailureText: '$error',
      );
      return;
    }
    switch (answer) {
      case UpdateCheckSetEvent():
        _setShownState(
          updateCheckSwitch: UpdateCheckSwitchConfirmed(
            isEnabled: answer.isUpdateCheckEnabled,
          ),
          saveFailureText: null,
        );
      case FailedEvent():
        _setShownState(
          updateCheckSwitch: UpdateCheckSwitchConfirmed(isEnabled: !isEnabled),
          saveFailureText: answer.message,
        );
    }
  }

  Future<void> _checkUpdate() async {
    final UpdateCheckAnswer answer;
    try {
      answer = await _bridge.checkUpdate();
    } catch (_) {
      _setShownState(
        updateCheckSwitch: const UpdateCheckSwitchUnavailable(),
        saveFailureText: null,
      );
      return;
    }
    switch (answer) {
      case UpdateCheckedEvent():
        _setShownState(
          updateCheckSwitch: UpdateCheckSwitchConfirmed(
            isEnabled: answer.isUpdateCheckEnabled,
          ),
          saveFailureText: null,
          notice: answer.notice,
        );
      case FailedEvent():
        _setShownState(
          updateCheckSwitch: const UpdateCheckSwitchUnavailable(),
          saveFailureText: null,
        );
    }
  }

  /// Sets what the menu and the banner show; keeps the notice unless
  /// [notice] is given.
  void _setShownState({
    required UpdateCheckSwitch updateCheckSwitch,
    required String? saveFailureText,
    UpdateNoticeView? notice,
  }) {
    // An answer may come after the app that held the controller went away.
    if (_isDisposed) {
      return;
    }
    _switch = updateCheckSwitch;
    _saveFailureText = saveFailureText;
    _notice = notice ?? _notice;
    notifyListeners();
  }
}
