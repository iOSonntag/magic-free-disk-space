/// The one scheme a settings link may have: the panes of System Settings.
const String _systemSettingsScheme = 'x-apple.systempreferences';

/// The release pages of this app's repository, one per tag `vX.Y.Z`.
final RegExp _releasePageUrl = RegExp(
  r'^https://github\.com/iOSonntag/magic-free-disk-space/releases/tag/v[0-9]+\.[0-9]+\.[0-9]+$',
);

/// A URL the app may hand to the system to open; each kind parses only the
/// URLs of its own target, so whatever opens one opens nothing else.
sealed class OpenableUrl {
  const OpenableUrl._(this.text);

  final String text;
}

/// A URL of a pane of System Settings.
final class SystemSettingsUrl extends OpenableUrl {
  const SystemSettingsUrl._(super.text) : super._();

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
}

/// The page of one release of this app on GitHub.
final class ReleasePageUrl extends OpenableUrl {
  const ReleasePageUrl._(super.text) : super._();

  /// Throws a [FormatException] unless [text] is exactly
  /// `https://github.com/iOSonntag/magic-free-disk-space/releases/tag/vX.Y.Z`.
  static ReleasePageUrl parse(String text) {
    if (!_releasePageUrl.hasMatch(text)) {
      throw FormatException('"$text" is not a release page of this app.');
    }
    return ReleasePageUrl._(text);
  }
}
