import 'dart:convert';
import 'dart:io';

import 'package:magic_free_disk_space/bridge/bridge.dart';

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

/// The one sample event of type [TEvent]; throws when the samples hold none
/// of it or several.
TEvent loadSampleEvent<TEvent extends BridgeEvent>() {
  return loadSampleEvents().whereType<TEvent>().single;
}

/// A fresh copy of the first sample line of [kind], for a test to change
/// before it parses it.
Map<String, Object?> loadSampleJson(String kind) {
  for (final String line in loadSampleLines()) {
    final Map<String, Object?> json = jsonDecode(line) as Map<String, Object?>;
    if (json['kind'] == kind) {
      return json;
    }
  }
  throw StateError('No sample line has the kind $kind.');
}

ScannedEvent parseScanJson(Map<String, Object?> json) {
  return parseBridgeEvent(json) as ScannedEvent;
}

/// The JSON maps of every selectable item of a scan's [json].
List<Map<String, Object?>> listScanItemJsons(Map<String, Object?> json) {
  final List<Map<String, Object?>> items = [];
  for (final Object? section in json['sections']! as List<Object?>) {
    final Map<String, Object?> sectionJson = section! as Map<String, Object?>;
    items.addAll((sectionJson['items']! as List<Object?>).cast());
    final Object? checkGroup = sectionJson['checkGroup'];
    if (checkGroup is Map<String, Object?>) {
      items.addAll((checkGroup['items']! as List<Object?>).cast());
    }
  }
  final Map<String, Object?> explore = json['explore']! as Map<String, Object?>;
  items.addAll((explore['items']! as List<Object?>).cast());
  return items;
}

/// The JSON maps of the advice items of a scan's [json].
List<Map<String, Object?>> listScanAdviceJsons(Map<String, Object?> json) {
  final Map<String, Object?> explore = json['explore']! as Map<String, Object?>;
  final Map<String, Object?> adviceGroup =
      explore['adviceGroup']! as Map<String, Object?>;
  return (adviceGroup['items']! as List<Object?>).cast();
}
