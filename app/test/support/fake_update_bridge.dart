import 'package:magic_free_disk_space/bridge/bridge_event.dart';
import 'package:magic_free_disk_space/update/update_bridge.dart';

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
