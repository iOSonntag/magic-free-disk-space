import 'dart:convert';
import 'dart:io';

import 'package:magic_free_disk_space/bridge/bridge_event.dart';

/// The lines of the sample events the bridge's own tests share, blank lines
/// left out; read from the `app` folder, where `flutter test` runs.
List<String> loadSampleLines() {
  return [
    for (final String line in File(
      '../test/bridge/bridgeEvents.jsonl',
    ).readAsLinesSync())
      if (line.trim().isNotEmpty) line,
  ];
}

List<BridgeEvent> loadSampleEvents() {
  return [
    for (final String line in loadSampleLines())
      parseBridgeEvent(jsonDecode(line)),
  ];
}
