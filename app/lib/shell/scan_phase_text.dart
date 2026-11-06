import '../bridge/bridge_event.dart';
import '../cleaner/cleaner_controller.dart';

/// What a running scan does now, in the app's words; the bridge's own text
/// for a phase this app does not know.
String formatScanPhaseText(ScanningState state) {
  final ProgressEvent? progress = state.progress;
  if (progress == null) {
    return 'Starting the scan';
  }
  return switch (progress.phase) {
    ScanPhase.apps => 'Measuring your apps',
    ScanPhase.catalog => 'Looking through caches and known places',
    ScanPhase.projects => 'Looking through your projects',
    ScanPhase.largeFiles => 'Looking for large files',
    ScanPhase.leftovers => 'Looking for what removed apps left behind',
    ScanPhase.tools => 'Asking each tool what it holds',
    ScanPhase.unknown => progress.message,
  };
}
