import 'dart:io';

import '../bridge/system_settings_url.dart';
import '../cleaner/settings_opener.dart';

const String _openExecutablePath = '/usr/bin/open';

/// Opens a URL with macOS's `open`, run with no shell; an exit code of 0
/// counts as opened.
final class ProcessSettingsOpener implements SettingsOpener {
  const ProcessSettingsOpener();

  @override
  Future<bool> open(SystemSettingsUrl url) async {
    try {
      final ProcessResult result = await Process.run(_openExecutablePath, [
        url.text,
      ]);
      return result.exitCode == 0;
    } on ProcessException {
      return false;
    }
  }
}
