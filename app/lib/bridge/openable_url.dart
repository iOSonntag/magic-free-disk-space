/// The one scheme a settings link may have: the panes of System Settings.
const String _systemSettingsScheme = 'x-apple.systempreferences';

/// The release pages of this app's repository, one per tag `vX.Y.Z`.
final RegExp _releasePageUrl = RegExp(
  r'^https://github\.com/iOSonntag/magic-free-disk-space/releases/tag/v[0-9]+\.[0-9]+\.[0-9]+$',
);

/// The apps an advice item may open; [unknown] stands for an app of a newer
/// bridge, which this app cannot open.
enum OpenableApp {
  photos,
  messages,
  music,
  tv,
  podcasts,
  garageBand,
  logicPro,
  iMovie,
  finalCutPro,
  finder,
  unknown,
}

/// The panes of System Settings an advice item may open; [unknown] stands for
/// a pane of a newer bridge, which this app cannot open.
enum SettingsPane { storage, icloud, timeMachine, unknown }

/// The bundle id macOS knows each app by.
String? _getAppBundleId(OpenableApp app) {
  return switch (app) {
    OpenableApp.photos => 'com.apple.Photos',
    OpenableApp.messages => 'com.apple.MobileSMS',
    OpenableApp.music => 'com.apple.Music',
    OpenableApp.tv => 'com.apple.TV',
    OpenableApp.podcasts => 'com.apple.podcasts',
    OpenableApp.garageBand => 'com.apple.garageband10',
    OpenableApp.logicPro => 'com.apple.logic10',
    OpenableApp.iMovie => 'com.apple.iMovieApp',
    OpenableApp.finalCutPro => 'com.apple.FinalCut',
    OpenableApp.finder => 'com.apple.finder',
    OpenableApp.unknown => null,
  };
}

/// The URL of each pane, by the bundle id of the System Settings extension
/// that holds it.
String? _getPaneUrl(SettingsPane pane) {
  return switch (pane) {
    SettingsPane.storage => '$_systemSettingsScheme:com.apple.settings.Storage',
    SettingsPane.icloud =>
      '$_systemSettingsScheme:com.apple.systempreferences.AppleIDSettings',
    SettingsPane.timeMachine =>
      '$_systemSettingsScheme:com.apple.Time-Machine-Settings.extension',
    SettingsPane.unknown => null,
  };
}

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

/// One file or folder to show in Finder; its [text] is the absolute path.
final class RevealUrl extends OpenableUrl {
  const RevealUrl._(super.text) : super._();

  /// Throws a [FormatException] unless [path] is one of [allowedPaths], the
  /// `revealPath`s of the current scan and the `logPath` of the current run,
  /// and absolute, so `open` never reads it as an option.
  static RevealUrl parse(String path, {required Set<String> allowedPaths}) {
    if (!path.startsWith('/')) {
      throw FormatException('"$path" is not an absolute path.');
    }
    if (!allowedPaths.contains(path)) {
      throw const FormatException(
        'A path to reveal is neither of the current scan nor the log of the '
        'current run.',
      );
    }
    return RevealUrl._(path);
  }
}

/// One app of the fixed list; its [text] is the app's bundle id.
final class OpenAppUrl extends OpenableUrl {
  const OpenAppUrl._(super.text) : super._();

  /// `null` for [OpenableApp.unknown].
  static OpenAppUrl? forApp(OpenableApp app) {
    final String? bundleId = _getAppBundleId(app);
    return bundleId == null ? null : OpenAppUrl._(bundleId);
  }
}

/// One pane of System Settings of the fixed list.
final class SettingsPaneUrl extends OpenableUrl {
  const SettingsPaneUrl._(super.text) : super._();

  /// `null` for [SettingsPane.unknown].
  static SettingsPaneUrl? forPane(SettingsPane pane) {
    final String? url = _getPaneUrl(pane);
    return url == null ? null : SettingsPaneUrl._(url);
  }
}
