import 'dart:io';

import '../bridge/openable_url.dart';
import '../link/url_opener.dart';

const String _openExecutablePath = '/usr/bin/open';

/// Opens a URL with macOS's `open`, run with no shell; an exit code of 0
/// counts as opened.
final class ProcessUrlOpener implements UrlOpener {
  const ProcessUrlOpener();

  @override
  Future<bool> open(OpenableUrl url) async {
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
