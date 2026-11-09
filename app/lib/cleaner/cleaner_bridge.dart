import '../bridge/bridge.dart';

/// The bridge as the cleaner needs it: each request answers with its own
/// [ScanAnswer], [PlanAnswer], [DeleteAnswer], [StatusAnswer], or
/// [RescanAfterDeletionSetAnswer]; requests are answered one at a time in the
/// order they were made.
abstract interface class CleanerBridge {
  Future<ScanAnswer> scan({
    required void Function(ProgressEvent progress) onProgress,
  });

  /// The view of the scan the bridge holds, such as the one a deletion kept.
  Future<ScanAnswer> showScan();

  Future<PlanAnswer> plan(List<int> numbers);

  Future<DeleteAnswer> delete({
    required int planId,
    required String confirmation,
  });

  Future<StatusAnswer> status();

  Future<RescanAfterDeletionSetAnswer> setRescanAfterDeletion(bool isEnabled);
}
