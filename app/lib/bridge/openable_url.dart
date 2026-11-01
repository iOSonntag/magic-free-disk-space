/// The one scheme a settings link may have: the panes of System Settings.
const String _systemSettingsScheme = 'x-apple.systempreferences';

const String _releasePageHost = 'github.com';

/// The release pages of this app's repository, one per tag `vX.Y.Z`.
final RegExp _releasePagePath = RegExp(
  r'^/iOSonntag/magic-free-disk-space/releases/tag/v[0-9]+\.[0-9]+\.[0-9]+$',
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
    final Uri url = Uri.parse(text);
    if (url.scheme != 'https') {
      throw FormatException(
        'A release page has the scheme "${url.scheme}", not "https".',
      );
    }
    if (url.host != _releasePageHost) {
      throw FormatException(
        'A release page is on "${url.host}", not "$_releasePageHost".',
      );
    }
    if (url.userInfo.isNotEmpty) {
      throw const FormatException('A release page has a user info.');
    }
    if (url.hasPort) {
      throw const FormatException('A release page has a port.');
    }
    if (url.hasQuery || url.hasFragment) {
      throw const FormatException('A release page has a query or a fragment.');
    }
    if (!_releasePagePath.hasMatch(url.path)) {
      throw FormatException(
        'The path "${url.path}" is not a release page of this app.',
      );
    }
    // Uri drops a default port such as ":443" and lowers the host, so only
    // the text itself shows them.
    if (text != 'https://$_releasePageHost${url.path}') {
      throw const FormatException('A release page is not in its plain form.');
    }
    return ReleasePageUrl._(text);
  }
}
