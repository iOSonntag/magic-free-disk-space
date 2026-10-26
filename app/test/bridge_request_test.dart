import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_request.dart';

void main() {
  test('builds the requests of the protocol fixture the bridge parses', () {
    final List<Object?> fixtureRequests = [
      for (final String line in File(
        '../test/bridge/bridgeRequests.jsonl',
      ).readAsLinesSync())
        if (line.trim().isNotEmpty) jsonDecode(line),
    ];

    expect([
      buildScanRequest(),
      buildPlanRequest([1, 3]),
      buildDeleteRequest(planId: 2, confirmation: 'DELETE'),
    ], fixtureRequests);
  });
}
