/// The one scheme a settings link may have: the panes of System Settings.
const String _systemSettingsScheme = 'x-apple.systempreferences';

/// A URL of a pane of System Settings; no other URL parses, so whatever opens
/// it opens nothing else.
final class SystemSettingsUrl {
  const SystemSettingsUrl._(this.text);

  /// Throws a [FormatException] when [text] is not of the scheme of System
  /// Settings.
  static SystemSettingsUrl parse(String text) {
    final Uri url = Uri.parse(text);
    if (url.scheme != _systemSettingsScheme) {
      throw FormatException(
        'A settings link has the scheme "${url.scheme}", not '
        '"$_systemSettingsScheme".',
      );
    }
    return SystemSettingsUrl._(text);
  }

  final String text;
}
