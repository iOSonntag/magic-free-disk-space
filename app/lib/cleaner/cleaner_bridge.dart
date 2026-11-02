import '../bridge/bridge_event.dart';

/// The bridge as the cleaner needs it: each request answers with its own
/// [ScanAnswer], [PlanAnswer], [DeleteAnswer], or [StatusAnswer]; requests
/// are answered one at a time in the order they were made.
abstract interface class CleanerBridge {
  Future<ScanAnswer> scan({required void Function(String message) onProgress});

  Future<PlanAnswer> plan(List<int> numbers);

  Future<DeleteAnswer> delete({
    required int planId,
    required String confirmation,
  });

  Future<StatusAnswer> status();
}
