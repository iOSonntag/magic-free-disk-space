import 'dart:io';

import '../bridge/bridge.dart';
import '../link/link.dart';

const String _openExecutablePath = '/usr/bin/open';

/// The arguments of `open` for [url]: `-R` shows a path in Finder, `-b` opens
/// an app by its bundle id, and a URL alone opens what its scheme names.
List<String> buildOpenArguments(OpenableUrl url) {
  return switch (url) {
    RevealUrl(:final String text) => ['-R', text],
    OpenAppUrl(:final String text) => ['-b', text],
    SystemSettingsUrl(:final String text) ||
    SettingsPaneUrl(:final String text) ||
    ReleasePageUrl(:final String text) => [text],
  };
}

/// Opens a URL with macOS's `open`, run with no shell; an exit code of 0
/// counts as opened.
final class ProcessUrlOpener implements UrlOpener {
  const ProcessUrlOpener();

  @override
  Future<bool> open(OpenableUrl url) async {
    try {
      final ProcessResult result = await Process.run(
        _openExecutablePath,
        buildOpenArguments(url),
      );
      return result.exitCode == 0;
    } on ProcessException {
      return false;
    }
  }
}
