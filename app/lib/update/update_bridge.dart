import '../bridge/bridge.dart';

/// The bridge as the update check needs it; a bridge older than these
/// requests answers them with a [FailedEvent].
abstract interface class UpdateBridge {
  Future<UpdateCheckAnswer> checkUpdate();

  Future<UpdateCheckSetAnswer> setUpdateCheck(bool isEnabled);
}
