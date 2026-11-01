import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_event.dart';

const String fullDiskAccessSettingsUrl =
    'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles';

List<ItemDetailLineKind> getDetailLineKinds(List<ItemDetailLine> lines) {
  return [for (final ItemDetailLine line in lines) line.kind];
}

List<int> getItemNumbers(List<ItemView> items) {
  return [for (final ItemView item in items) item.number];
}

/// The map at [path] in [json], each step a key of a map or an index of a
/// list.
Map<String, Object?> getMapAt(Object? json, List<Object> path) {
  Object? node = json;
  for (final Object step in path) {
    node = switch (step) {
      final int index => (node as List<Object?>)[index],
      final String key => (node as Map<String, Object?>)[key],
      _ => throw ArgumentError.value(step, 'path'),
    };
  }
  return node as Map<String, Object?>;
}

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

  /// A fresh copy of the sample line of [kind], to change one value of.
  Map<String, Object?> decodeSample(String kind) {
    for (final String line in sampleLines) {
      final Map<String, Object?> json =
          jsonDecode(line) as Map<String, Object?>;
      if (json['kind'] == kind) {
        return json;
      }
    }
    throw StateError('No sample line has the kind $kind.');
  }

  test('parses every sample line of the bridge', () {
    expect(events, hasLength(sampleLines.length));
    expect(events, isNotEmpty);
  });

  group('the scan', () {
    final ScannedEvent scanned = events.whereType<ScannedEvent>().single;

    test('parses the summary', () {
      expect(
        scanned.summary.titleText,
        'Found 5 items, at least 18.0 MiB in total',
      );
      expect(scanned.summary.lines, hasLength(3));
    });

    test('parses the sections with their safe items and check groups', () {
      expect(
        [for (final SectionView section in scanned.sections) section.titleText],
        ['Caches', 'Apps', 'Large files'],
      );
      expect(
        [
          for (final SectionView section in scanned.sections)
            section.isInitiallyExpanded,
        ],
        [true, false, false],
      );
      expect(
        [
          for (final SectionView section in scanned.sections)
            getItemNumbers(section.items),
        ],
        [
          [1],
          <int>[],
          <int>[],
        ],
      );
      expect(
        [
          for (final SectionView section in scanned.sections)
            getItemNumbers(section.checkGroup!.items),
        ],
        [
          [2],
          [3],
          [4],
        ],
      );
      expect(
        scanned.sections.first.checkGroup!.titleText,
        'Check before deleting',
      );
      expect(scanned.sections.first.sizeText, 'at least 10.0 MiB');

      final ItemView toolCache = scanned.sections.first.items.single;
      expect(toolCache.risk, Risk.safe);
      expect(toolCache.riskText, 'safe');
      expect(toolCache.sizeText, '6.0 MiB');
      expect(getDetailLineKinds(toolCache.detailLines), [
        ItemDetailLineKind.path,
        ItemDetailLineKind.explanation,
        ItemDetailLineKind.regeneration,
      ]);
      expect(scanned.sections[1].checkGroup!.items.single.risk, Risk.never);
    });

    test('parses Explore with its items and its advice group', () {
      final ExploreView explore = scanned.explore!;
      expect(explore.titleText, 'Explore');
      expect(explore.introText, isNotEmpty);
      expect(getItemNumbers(explore.items), [5]);
      expect(getDetailLineKinds(explore.items.single.detailLines), [
        ItemDetailLineKind.path,
        ItemDetailLineKind.explanation,
        ItemDetailLineKind.regeneration,
        ItemDetailLineKind.evidence,
        ItemDetailLineKind.command,
      ]);
      expect(
        explore.items.single.detailLines.last.text,
        'xcrun simctl delete 0A1B2C3D',
      );

      final AdviceGroupView adviceGroup = explore.adviceGroup!;
      expect(
        adviceGroup.titleText,
        'Handle these yourself; this tool never deletes them',
      );
      final AdviceItemView toolStore = adviceGroup.items.single;
      expect(toolStore.title, 'Tool store');
      expect(toolStore.riskText, 'review');
      expect(getDetailLineKinds(toolStore.detailLines), [
        ItemDetailLineKind.path,
        ItemDetailLineKind.explanation,
        ItemDetailLineKind.advice,
      ]);
    });

    test('parses the safe numbers and the skipped block', () {
      expect(scanned.safeNumbers, [1]);
      expect(scanned.skipped!.titleText, 'Skipped 12 items');
      expect(scanned.skipped!.lines, hasLength(2));
    });

    test('parses the notices, one with a settings link and one without', () {
      expect(
        [for (final NoticeView notice in scanned.notices) notice.titleText],
        ['Could not read 2 places', 'Could not ask 1 tool'],
      );
      final SettingsLinkView link = scanned.notices.first.settingsLink!;
      expect(link.labelText, 'Open System Settings');
      expect(link.url.scheme, 'x-apple.systempreferences');
      expect(link.url.toString(), fullDiskAccessSettingsUrl);
      expect(link.failedText, startsWith('System Settings did not open.'));
      expect(scanned.notices.last.settingsLink, isNull);
    });

    test(
      'parses a scan without Explore, skipped, a check group, or advice',
      () {
        final Map<String, Object?> json = decodeSample('scanned')
          ..['explore'] = null
          ..['skipped'] = null;
        getMapAt(json, ['sections', 0])['checkGroup'] = null;

        final ScannedEvent scan = parseBridgeEvent(json) as ScannedEvent;

        expect(scan.explore, isNull);
        expect(scan.skipped, isNull);
        expect(scan.sections.first.checkGroup, isNull);

        final Map<String, Object?> withoutAdvice = decodeSample('scanned');
        getMapAt(withoutAdvice, ['explore'])['adviceGroup'] = null;

        expect(
          (parseBridgeEvent(
            withoutAdvice,
          ) as ScannedEvent).explore!.adviceGroup,
          isNull,
        );
      },
    );
  });

  test('parses the status with the notice of its banner', () {
    final StatusEvent status = events.whereType<StatusEvent>().single;

    expect(status.fullDiskAccess, FullDiskAccess.denied);
    final NoticeView notice = status.notices.single;
    expect(notice.titleText, 'Full Disk Access is off');
    expect(notice.lines, hasLength(2));
    expect(notice.settingsLink!.url.toString(), fullDiskAccessSettingsUrl);
  });

  test('parses the plan, the answers, and both failures', () {
    final PlannedEvent planned = events.whereType<PlannedEvent>().single;
    expect(planned.planId, 1);
    expect(
      planned.warningLines,
      contains('Type DELETE to delete them permanently.'),
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

  group('throws a FormatException', () {
    test('on an event it does not know', () {
      expect(
        () => parseBridgeEvent({'kind': 'planned', 'planId': '1'}),
        throwsFormatException,
      );
      expect(() => parseBridgeEvent('scanned'), throwsFormatException);
      expect(
        () => parseBridgeEvent({'kind': 'rescanned'}),
        throwsFormatException,
      );
    });

    test('on an unknown risk', () {
      final Map<String, Object?> json = decodeSample('scanned');
      getMapAt(json, ['explore', 'adviceGroup', 'items', 0])['risk'] =
          'harmless';

      expect(() => parseBridgeEvent(json), throwsFormatException);
    });

    test('on an unknown kind of a detail line', () {
      final Map<String, Object?> json = decodeSample('scanned');
      getMapAt(json, ['sections', 0, 'items', 0, 'detailLines', 0])['kind'] =
          'hint';

      expect(() => parseBridgeEvent(json), throwsFormatException);
    });

    test('on an unknown state of Full Disk Access', () {
      final Map<String, Object?> json = decodeSample('status')
        ..['fullDiskAccess'] = 'partial';

      expect(() => parseBridgeEvent(json), throwsFormatException);
    });

    for (final String url in [
      'file:///Applications/Calculator.app',
      'https://example.com',
    ]) {
      test('on a settings link to $url', () {
        final Map<String, Object?> scanned = decodeSample('scanned');
        getMapAt(scanned, ['notices', 0, 'settingsLink'])['url'] = url;
        final Map<String, Object?> status = decodeSample('status');
        getMapAt(status, ['notices', 0, 'settingsLink'])['url'] = url;

        expect(() => parseBridgeEvent(scanned), throwsFormatException);
        expect(() => parseBridgeEvent(status), throwsFormatException);
      });
    }

    test('on a missing key', () {
      final Map<String, Object?> withoutSafeNumbers = decodeSample('scanned')
        ..remove('safeNumbers');
      final Map<String, Object?> withoutCheckGroup = decodeSample('scanned');
      getMapAt(withoutCheckGroup, ['sections', 0]).remove('checkGroup');
      final Map<String, Object?> withoutSettingsLink = decodeSample('status');
      getMapAt(withoutSettingsLink, ['notices', 0]).remove('settingsLink');

      expect(() => parseBridgeEvent(withoutSafeNumbers), throwsFormatException);
      expect(() => parseBridgeEvent(withoutCheckGroup), throwsFormatException);
      expect(
        () => parseBridgeEvent(withoutSettingsLink),
        throwsFormatException,
      );
    });

    test('on a value of the wrong type', () {
      final Map<String, Object?> json = decodeSample('scanned')
        ..['safeNumbers'] = ['1'];

      expect(() => parseBridgeEvent(json), throwsFormatException);
    });
  });
}
