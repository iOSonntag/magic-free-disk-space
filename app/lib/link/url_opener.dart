import '../bridge/openable_url.dart';

/// Opens a URL the bridge gave, such as a pane of System Settings or a release
/// page.
abstract interface class UrlOpener {
  /// Opens [url]; answers whether it opened. Never throws.
  Future<bool> open(OpenableUrl url);
}
