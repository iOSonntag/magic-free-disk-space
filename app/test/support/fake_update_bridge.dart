import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge.dart';
import 'package:magic_free_disk_space/update/update.dart';

/// A check that found no newer release, with the switch on.
const UpdateCheckedEvent quietUpdateCheck = UpdateCheckedEvent(
  isUpdateCheckEnabled: true,
  notice: null,
);

/// A bridge that answers with what the test set on it and records each value
/// it was asked to save.
final class FakeUpdateBridge implements UpdateBridge {
  FakeUpdateBridge({required this.answerCheck});

  Future<UpdateCheckAnswer> Function() answerCheck;
  Future<UpdateCheckSetAnswer> Function(bool isEnabled) answerSet = (
    bool isEnabled,
  ) async => UpdateCheckSetEvent(isUpdateCheckEnabled: isEnabled);
  final List<bool> savedValues = [];

  @override
  Future<UpdateCheckAnswer> checkUpdate() {
    return answerCheck();
  }

  @override
  Future<UpdateCheckSetAnswer> setUpdateCheck(bool isEnabled) {
    savedValues.add(isEnabled);
    return answerSet(isEnabled);
  }
}

/// An update controller over [bridge], which starts its check at once;
/// disposed at tear-down.
UpdateController createUpdateController(FakeUpdateBridge bridge) {
  final UpdateController controller = UpdateController(bridge: bridge);
  addTearDown(controller.dispose);
  return controller;
}
