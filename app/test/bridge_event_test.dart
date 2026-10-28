import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_event.dart';

void main() {
  final List<String> sampleLines = [
    for (final String line in File(
      '../test/bridge/bridgeEvents.jsonl',
    ).readAsLinesSync())
      if (line.trim().isNotEmpty) line,
  ];
  final List<BridgeEvent> events = [
    for (final String line in sampleLines) parseBridgeEvent(jsonDecode(line)),
  ];

  test('parses every sample line of the bridge', () {
    expect(events, hasLength(sampleLines.length));
    expect(events, isNotEmpty);
  });

  test('parses the scan with its candidates and notes', () {
    final ScannedEvent scanned = events.whereType<ScannedEvent>().single;
    expect(scanned.summaryText, 'Found 4 items, 15.0 MiB in total');
    expect(
      scanned.candidates.map((CandidateView candidate) => candidate.risk),
      [Risk.safe, Risk.review, Risk.careful, Risk.never],
    );
    expect(scanned.candidates.first.sizeText, '6.0 MiB');
    expect(scanned.notesLines, isNotEmpty);
  });

  test('parses the plan, the answers, and both failures', () {
    final PlannedEvent planned = events.whereType<PlannedEvent>().single;
    expect(planned.planId, 1);
    expect(
      planned.warningLines.last,
      'Type DELETE to delete them permanently.',
    );
    expect(events.whereType<ProgressEvent>().single.message, isNotEmpty);
    expect(events.whereType<NothingApprovedEvent>().single.lines, isNotEmpty);
    expect(events.whereType<DeletedEvent>().single.lines, hasLength(3));
    expect(
      events.whereType<CancelledEvent>().single.message,
      'Cancelled. Nothing was deleted.',
    );
    expect(
      events.whereType<FailedEvent>().map(
        (FailedEvent failed) => failed.isScanDropped,
      ),
      [false, true],
    );
  });

  test('throws a FormatException on a shape it does not know', () {
    expect(
      () => parseBridgeEvent({'kind': 'planned', 'planId': '1'}),
      throwsFormatException,
    );
    expect(() => parseBridgeEvent('scanned'), throwsFormatException);
    expect(
      () => parseBridgeEvent({
        'kind': 'scanned',
        'summaryText': '',
        'candidates': [
          {
            'number': 1,
            'title': 'Cache',
            'path': '/tmp/cache',
            'risk': 'harmless',
            'explanation': '',
            'regeneration': '',
            'sizeText': '1 B',
          },
        ],
        'notesLines': <Object?>[],
      }),
      throwsFormatException,
    );
  });
}
