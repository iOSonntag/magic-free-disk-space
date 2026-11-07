import '../bridge/bridge.dart';
import '../cleaner/cleaner.dart';

/// What a running scan does now, in the app's words, with no closing "…";
/// the bridge's own text for a phase this app does not know.
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
    // The bridge ends its message with the "…" each caller adds.
    ScanPhase.unknown => _dropTrailingEllipsis(progress.message),
  };
}

String _dropTrailingEllipsis(String text) {
  if (text.endsWith('…')) {
    return text.substring(0, text.length - 1);
  }
  return text;
}
