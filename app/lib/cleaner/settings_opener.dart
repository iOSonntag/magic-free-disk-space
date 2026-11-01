/// Opens a pane of System Settings as the page needs it.
abstract interface class SettingsOpener {
  /// Opens [url]; answers whether it opened. Never throws.
  Future<bool> open(Uri url);
}
