import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_event.dart';
import 'package:magic_free_disk_space/bridge/openable_url.dart';

import 'support/sample_events.dart';

const String fullDiskAccessSettingsUrl =
    'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles';
const String releasePageUrl =
    'https://github.com/iOSonntag/magic-free-disk-space/releases/tag/v1.3.0';
const String deletionLogPath =
    '/Users/me/Library/Logs/magic-free-disk-space/deletions.jsonl';

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
  final List<String> sampleLines = loadSampleLines();
  final List<BridgeEvent> events = loadSampleEvents();

  test('parses every sample line of the bridge', () {
    expect(events, hasLength(sampleLines.length));
    expect(events, isNotEmpty);
  });

  group('the scan', () {
    final ScannedEvent scanned = loadSampleEvent<ScannedEvent>();

    /// The item of [scanned] numbered [number].
    ItemView getItem(int number) {
      return [
        for (final SectionView section in scanned.sections) ...[
          ...section.items,
          ...?section.checkGroup?.items,
        ],
        ...scanned.explore!.items,
      ].singleWhere((ItemView item) => item.number == number);
    }

    test('parses the summary with its totals and its disk', () {
      expect(scanned.summary.titleText, 'Found 9 items, at least 28 MB in total');
      expect(scanned.summary.lines, hasLength(3));
      expect(scanned.summary.totalBytes, 26000000);
      expect(scanned.summary.safeBytes, 6000000);
      expect(scanned.summary.disk!.capacityBytes, 500000000000);
      expect(scanned.summary.disk!.availableBytes, 52000000000);
    });

    test('parses the sections with their safe items and check groups', () {
      expect(
        [for (final SectionView section in scanned.sections) section.titleText],
        ['Caches', 'Apps', 'Large files'],
      );
      expect(
        [for (final SectionView section in scanned.sections) section.key],
        [SectionKey.caches, SectionKey.apps, SectionKey.largeFiles],
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
          [3, 4, 5],
          [6],
        ],
      );
      expect(
        scanned.sections.first.checkGroup!.titleText,
        'Check before deleting',
      );
      expect(scanned.sections.first.sizeText, 'at least 10 MB');

      final ItemView toolCache = scanned.sections.first.items.single;
      expect(toolCache.risk, Risk.safe);
      expect(toolCache.riskText, 'safe');
      expect(toolCache.sizeText, '6.0 MB');
      expect(getDetailLineKinds(toolCache.detailLines), [
        ItemDetailLineKind.path,
        ItemDetailLineKind.explanation,
        ItemDetailLineKind.regeneration,
      ]);
      expect(scanned.sections[1].checkGroup!.items.first.risk, Risk.never);
    });

    test('parses the facts of an item', () {
      final ItemView toolCache = getItem(1);
      expect(
        toolCache.key,
        'catalog:tool-cache:/Users/me/Library/Caches/ToolCache',
      );
      expect(toolCache.sectionKey, SectionKey.caches);
      expect(toolCache.group, ItemGroup.safe);
      expect(toolCache.origin, ItemOrigin.catalog);
      expect(toolCache.removal, ItemRemoval.delete);
      expect(toolCache.allocatedBytes, 6000000);
      expect(toolCache.isComplete, isTrue);
      expect(toolCache.displayPath, '~/Library/Caches/ToolCache');
      expect(toolCache.revealPath, '/Users/me/Library/Caches/ToolCache');
      expect(toolCache.lastUsedAt, isNull);
      expect(toolCache.downloadedAt, isNull);
      expect(toolCache.appName, isNull);
      expect(toolCache.matchedBy, isNull);

      final ItemView appCache = getItem(2);
      expect(appCache.group, ItemGroup.review);
      expect(appCache.isComplete, isFalse);
      expect(appCache.appName, 'Example');

      final ItemView xcode = getItem(3);
      expect(xcode.origin, ItemOrigin.app);
      expect(xcode.group, ItemGroup.review);
      expect(xcode.displayPath, '/Applications/Xcode.app');
      expect(xcode.lastUsedAt, DateTime.utc(2025, 3, 15));

      final ItemView leftoverByName = getItem(4);
      expect(leftoverByName.origin, ItemOrigin.leftover);
      expect(leftoverByName.group, ItemGroup.careful);
      expect(leftoverByName.matchedBy, LeftoverMatch.name);
      expect(leftoverByName.lastUsedAt, DateTime.utc(2024, 9, 1));

      final ItemView leftoverByBundleId = getItem(5);
      expect(leftoverByBundleId.origin, ItemOrigin.leftover);
      expect(leftoverByBundleId.matchedBy, LeftoverMatch.bundleId);

      final ItemView oldVideo = getItem(6);
      expect(oldVideo.origin, ItemOrigin.largeFile);
      expect(oldVideo.lastUsedAt, DateTime.utc(2025, 6, 1));
      expect(oldVideo.downloadedAt, DateTime.utc(2024, 12, 24));

      final ItemView icloudFolder = getItem(7);
      expect(icloudFolder.origin, ItemOrigin.explore);
      expect(icloudFolder.removal, ItemRemoval.evict);
      expect(icloudFolder.sectionKey, SectionKey.icloud);

      final ItemView simulator = getItem(8);
      expect(simulator.origin, ItemOrigin.explore);
      expect(simulator.removal, ItemRemoval.tool);
      expect(simulator.sectionKey, SectionKey.developerTools);
      expect(simulator.group, ItemGroup.review);

      final ItemView buildCache = getItem(9);
      expect(buildCache.removal, ItemRemoval.engine);
      expect(buildCache.risk, Risk.safe);
      expect(buildCache.group, ItemGroup.review);
      expect(buildCache.revealPath, isNull);
    });

    test('parses Explore with its items and its advice group', () {
      final ExploreView explore = scanned.explore!;
      expect(explore.titleText, 'Explore');
      expect(explore.introText, isNotEmpty);
      expect(getItemNumbers(explore.items), [7, 8, 9]);
      final ItemView simulator = getItem(8);
      expect(getDetailLineKinds(simulator.detailLines), [
        ItemDetailLineKind.path,
        ItemDetailLineKind.explanation,
        ItemDetailLineKind.regeneration,
        ItemDetailLineKind.evidence,
        ItemDetailLineKind.command,
      ]);
      expect(
        simulator.detailLines.last.text,
        'xcrun simctl delete 0A1B2C3D-0000-4000-8000-000000000001',
      );

      final AdviceGroupView adviceGroup = explore.adviceGroup!;
      expect(
        adviceGroup.titleText,
        'Handle these yourself; this tool never deletes them',
      );
      expect(
        [for (final AdviceItemView item in adviceGroup.items) item.title],
        ['Photos library', 'Tool store'],
      );
      final AdviceItemView photos = adviceGroup.items.first;
      expect(photos.sectionKey, SectionKey.largeFiles);
      expect((photos.opener! as AppOpener).app, OpenableApp.photos);

      final AdviceItemView toolStore = adviceGroup.items.last;
      expect(toolStore.title, 'Tool store');
      expect(toolStore.riskText, 'review');
      expect(getDetailLineKinds(toolStore.detailLines), [
        ItemDetailLineKind.path,
        ItemDetailLineKind.explanation,
        ItemDetailLineKind.advice,
      ]);
      expect(toolStore.key, 'catalog:tool-store:/Users/me/Library/ToolStore');
      expect(toolStore.sectionKey, SectionKey.developerTools);
      expect(toolStore.origin, ItemOrigin.catalog);
      expect(toolStore.removal, ItemRemoval.advice);
      expect(toolStore.allocatedBytes, 6000000);
      expect(toolStore.displayPath, '~/Library/ToolStore');
      expect(toolStore.revealPath, '/Users/me/Library/ToolStore');
      expect(toolStore.opener, isNull);
    });

    test('parses the totals of every section, Explore items included', () {
      expect(
        [
          for (final SectionTotal total in scanned.sectionTotals)
            (
              total.sectionKey,
              total.allocatedBytes,
              total.itemCount,
              total.safeBytes,
              total.adviceCount,
            ),
        ],
        [
          (SectionKey.caches, 10000000, 2, 6000000, 0),
          (SectionKey.developerTools, 5000000, 2, 0, 1),
          (SectionKey.apps, 5000000, 3, 0, 0),
          (SectionKey.largeFiles, 3000000, 1, 0, 1),
          (SectionKey.icloud, 5000000, 1, 0, 0),
        ],
      );
    });

    test('lists the paths of the scan that Finder may show', () {
      expect(scanned.revealPaths, {
        '/Users/me/Library/Caches/ToolCache',
        '/Users/me/Library/Caches/com.example.other',
        '/Applications/Xcode.app',
        '/Users/me/Library/Application Support/Example Removed',
        '/Users/me/Library/Containers/com.example.removed',
        '/Users/me/Movies/holiday.mov',
        '/Users/me/Library/Mobile Documents/com~apple~CloudDocs/Projects',
        '/Users/me/Library/Developer/CoreSimulator/Devices/'
            '0A1B2C3D-0000-4000-8000-000000000001',
        '/Users/me/Pictures/Photos Library.photoslibrary',
        '/Users/me/Library/ToolStore',
      });
    });

    test('parses the safe numbers and the skipped block', () {
      expect(scanned.safeNumbers, [1]);
      expect(scanned.skipped!.titleText, 'Skipped 12 items');
      expect(scanned.skipped!.lines, hasLength(2));
    });

    test('parses the notices, one with a settings link and two without', () {
      expect(
        [for (final NoticeView notice in scanned.notices) notice.titleText],
        [
          'Could not read 2 places',
          'Could not ask 1 tool',
          'Some sizes may be larger than the space they free',
        ],
      );
      final LinkView link = scanned.notices.first.settingsLink!;
      expect(link.url, isA<SystemSettingsUrl>());
      expect(link.labelText, 'Open System Settings');
      expect(link.url.text, fullDiskAccessSettingsUrl);
      expect(link.failedText, startsWith('System Settings did not open.'));
      expect(scanned.notices[1].settingsLink, isNull);
      expect(scanned.notices.last.settingsLink, isNull);
    });

    test(
      'parses a scan without Explore, skipped, a check group, advice, or disk',
      () {
        final Map<String, Object?> json = loadSampleJson('scanned')
          ..['explore'] = null
          ..['skipped'] = null;
        getMapAt(json, ['sections', 0])['checkGroup'] = null;
        getMapAt(json, ['summary'])['disk'] = null;

        final ScannedEvent scan = parseBridgeEvent(json) as ScannedEvent;

        expect(scan.explore, isNull);
        expect(scan.skipped, isNull);
        expect(scan.sections.first.checkGroup, isNull);
        expect(scan.summary.disk, isNull);

        final Map<String, Object?> withoutAdvice = loadSampleJson('scanned');
        getMapAt(withoutAdvice, ['explore'])['adviceGroup'] = null;

        expect(
          (parseBridgeEvent(
            withoutAdvice,
          ) as ScannedEvent).explore!.adviceGroup,
          isNull,
        );
      },
    );

    group('parses the opener of an advice item', () {
      /// The opener of the sample's advice item once its JSON is [opener].
      AdviceOpener? parseOpener(Object? opener) {
        final Map<String, Object?> json = loadSampleJson('scanned');
        getMapAt(json, ['explore', 'adviceGroup', 'items', 0])['opener'] =
            opener;

        return (parseBridgeEvent(json) as ScannedEvent)
            .explore!
            .adviceGroup!
            .items
            .first
            .opener;
      }

      test('an app or a pane of System Settings', () {
        expect(
          (parseOpener({'kind': 'app', 'app': 'photos'}) as AppOpener).app,
          OpenableApp.photos,
        );
        expect(
          (parseOpener({'kind': 'settings', 'pane': 'storage'})
                  as SettingsOpener)
              .pane,
          SettingsPane.storage,
        );
      });

      test('an app or a pane of a newer bridge as unknown', () {
        expect(
          (parseOpener({'kind': 'app', 'app': 'aperture'}) as AppOpener).app,
          OpenableApp.unknown,
        );
        expect(
          (parseOpener({'kind': 'settings', 'pane': 'battery'})
                  as SettingsOpener)
              .pane,
          SettingsPane.unknown,
        );
      });

      test('a kind of a newer bridge as no opener', () {
        expect(parseOpener({'kind': 'shortcut', 'name': 'Clean'}), isNull);
      });

      test('throws on an app opener without its app', () {
        expect(() => parseOpener({'kind': 'app'}), throwsFormatException);
        expect(() => parseOpener('photos'), throwsFormatException);
      });
    });

    test('parses every key of a newer bridge as unknown, never throwing', () {
      final Map<String, Object?> json = loadSampleJson('scanned');
      getMapAt(json, ['sections', 0])['key'] = 'pets';
      getMapAt(json, ['sections', 0, 'items', 0])
        ..['sectionKey'] = 'pets'
        ..['group'] = 'later'
        ..['origin'] = 'cloud'
        ..['removal'] = 'shred';
      getMapAt(json, ['sections', 1, 'checkGroup', 'items', 1])['matchedBy'] =
          'guess';
      getMapAt(json, ['explore', 'adviceGroup', 'items', 0])
        ..['sectionKey'] = 'pets'
        ..['origin'] = 'cloud'
        ..['removal'] = 'mail';
      getMapAt(json, ['sectionTotals', 0])['sectionKey'] = 'pets';

      final ScannedEvent scan = parseBridgeEvent(json) as ScannedEvent;
      final ItemView item = scan.sections.first.items.single;
      final AdviceItemView advice = scan.explore!.adviceGroup!.items.first;

      expect(scan.sections.first.key, SectionKey.unknown);
      expect(item.sectionKey, SectionKey.unknown);
      expect(item.group, ItemGroup.unknown);
      expect(item.origin, ItemOrigin.unknown);
      expect(item.removal, ItemRemoval.unknown);
      expect(
        scan.sections[1].checkGroup!.items[1].matchedBy,
        LeftoverMatch.unknown,
      );
      expect(advice.sectionKey, SectionKey.unknown);
      expect(advice.origin, ItemOrigin.unknown);
      expect(advice.removal, ItemRemoval.unknown);
      expect(scan.sectionTotals.first.sectionKey, SectionKey.unknown);
    });
  });

  test('parses the progress with its phase and what it found so far', () {
    final ProgressEvent progress = loadSampleEvent<ProgressEvent>();

    expect(progress.message, 'Measuring apps…');
    expect(progress.phase, ScanPhase.apps);
    expect(
      [for (final SectionTotal total in progress.found) total.sectionKey],
      [SectionKey.caches, SectionKey.developerTools],
    );
    expect(progress.found.first.allocatedBytes, 10000000);

    final Map<String, Object?> json = loadSampleJson('progress')
      ..['phase'] = 'containers';

    expect(
      (parseBridgeEvent(json) as ProgressEvent).phase,
      ScanPhase.unknown,
    );
  });

  test('parses the status with the notice of its banner', () {
    final StatusEvent status = loadSampleEvent<StatusEvent>();

    expect(status.fullDiskAccess, FullDiskAccess.denied);
    final NoticeView notice = status.notices.single;
    expect(notice.titleText, 'Full Disk Access is off');
    expect(notice.lines, hasLength(2));
    expect(notice.settingsLink!.url.text, fullDiskAccessSettingsUrl);
  });

  test('parses the update check with its notice and the saved switch', () {
    final UpdateCheckedEvent checked = loadSampleEvent<UpdateCheckedEvent>();

    expect(checked.isUpdateCheckEnabled, isTrue);
    final UpdateNoticeView notice = checked.notice!;
    expect(notice.titleText, 'Version 1.3.0 is available');
    expect(notice.lines, hasLength(2));
    expect(notice.downloadLink.labelText, 'Open the download page');
    expect(notice.downloadLink.url, isA<ReleasePageUrl>());
    expect(notice.downloadLink.url.text, releasePageUrl);
    expect(notice.downloadLink.failedText, startsWith('The browser did not'));
    expect(
      loadSampleEvent<UpdateCheckSetEvent>().isUpdateCheckEnabled,
      isFalse,
    );
  });

  test('parses an update check without a notice', () {
    final Map<String, Object?> json = loadSampleJson('updateChecked')
      ..['notice'] = null;

    expect((parseBridgeEvent(json) as UpdateCheckedEvent).notice, isNull);
  });

  test('parses the plan, the answers, and the three failures', () {
    final PlannedEvent planned = loadSampleEvent<PlannedEvent>();
    expect(planned.planId, 1);
    expect(
      planned.warningLines,
      contains('Type DELETE to delete them permanently.'),
    );
    expect(loadSampleEvent<NothingApprovedEvent>().lines, isNotEmpty);
    expect(loadSampleEvent<DeletedEvent>().lines, hasLength(9));
    expect(
      loadSampleEvent<CancelledEvent>().message,
      'Cancelled. Nothing was deleted.',
    );
    expect(
      events.whereType<FailedEvent>().map(
        (FailedEvent failed) => failed.effect,
      ),
      [
        FailureEffect.scanKept,
        FailureEffect.scanDropped,
        FailureEffect.bridgeStopping,
      ],
    );
  });

  test('parses the items of the plan, its total, and whether it holds careful', () {
    final PlannedEvent planned = loadSampleEvent<PlannedEvent>();

    expect(
      [
        for (final PlannedItemView item in planned.items)
          (item.number, item.title, item.sectionKey, item.risk, item.removal),
      ],
      [
        (1, 'Tool cache', SectionKey.caches, Risk.safe, ItemRemoval.delete),
        (2, 'App cache', SectionKey.caches, Risk.review, ItemRemoval.delete),
        (
          7,
          'Test iCloud folder /Users/me/Library/Mobile Documents/com~apple~CloudDocs/Projects',
          SectionKey.icloud,
          Risk.review,
          ItemRemoval.evict,
        ),
      ],
    );
    expect(
      planned.items.first.key,
      'catalog:tool-cache:/Users/me/Library/Caches/ToolCache',
    );
    expect(planned.items.first.allocatedBytes, 6000000);
    expect(planned.totalBytes, 15000000);
    expect(planned.holdsCareful, isFalse);
  });

  group('the run', () {
    final DeletedEvent deleted = loadSampleEvent<DeletedEvent>();

    test('parses each outcome with its reason, and what the run freed', () {
      expect(
        [
          for (final DeletedOutcomeView outcome in deleted.outcomes)
            (outcome.number, outcome.outcome, outcome.reasonKey),
        ],
        [
          (1, DeletedOutcome.removed, null),
          (2, DeletedOutcome.kept, DeletedReason.ownerRunning),
          (7, DeletedOutcome.partlyRemoved, DeletedReason.changedSinceScan),
          (6, DeletedOutcome.failed, DeletedReason.permissionDenied),
          (9, DeletedOutcome.removed, null),
        ],
      );
      expect(
        deleted.outcomes.first.key,
        'catalog:tool-cache:/Users/me/Library/Caches/ToolCache',
      );
      expect(
        [for (final DeletedOutcomeView outcome in deleted.outcomes) outcome.freedBytes],
        [6000000, 0, 3000000, 0, 2000000],
      );
      expect(deleted.freedBytes, 9000000);
      expect(deleted.returnsLaterBytes, 2000000);
      expect(deleted.availableBytesAfter, 58000000000);
      expect(deleted.logPath, deletionLogPath);
    });

    test('parses a run whose disk and log are unknown', () {
      final Map<String, Object?> json = loadSampleJson('deleted')
        ..['availableBytesAfter'] = null
        ..['logPath'] = null;

      final DeletedEvent run = parseBridgeEvent(json) as DeletedEvent;

      expect(run.availableBytesAfter, isNull);
      expect(run.logPath, isNull);
    });

    test('parses an outcome or a reason of a newer bridge as unknown', () {
      final Map<String, Object?> json = loadSampleJson('deleted');
      getMapAt(json, ['outcomes', 1])
        ..['outcome'] = 'parked'
        ..['reasonKey'] = 'engineBusy';

      final DeletedOutcomeView outcome =
          (parseBridgeEvent(json) as DeletedEvent).outcomes[1];

      expect(outcome.outcome, DeletedOutcome.unknown);
      expect(outcome.reasonKey, DeletedReason.unknown);
    });
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
      final Map<String, Object?> json = loadSampleJson('scanned');
      getMapAt(json, ['explore', 'adviceGroup', 'items', 0])['risk'] =
          'harmless';

      expect(() => parseBridgeEvent(json), throwsFormatException);
    });

    test('on an unknown risk of a planned item', () {
      final Map<String, Object?> json = loadSampleJson('planned');
      getMapAt(json, ['items', 0])['risk'] = 'harmless';

      expect(() => parseBridgeEvent(json), throwsFormatException);
    });

    test('on an unknown effect of a failure', () {
      final Map<String, Object?> json = loadSampleJson('failed');
      json['effect'] = 'scanLost';

      expect(() => parseBridgeEvent(json), throwsFormatException);
    });

    test('on an unknown kind of a detail line', () {
      final Map<String, Object?> json = loadSampleJson('scanned');
      getMapAt(json, ['sections', 0, 'items', 0, 'detailLines', 0])['kind'] =
          'hint';

      expect(() => parseBridgeEvent(json), throwsFormatException);
    });

    test('on an unknown state of Full Disk Access', () {
      final Map<String, Object?> json = loadSampleJson('status')
        ..['fullDiskAccess'] = 'partial';

      expect(() => parseBridgeEvent(json), throwsFormatException);
    });

    test('on a last use that is not an instant', () {
      final Map<String, Object?> json = loadSampleJson('scanned');
      getMapAt(json, ['sections', 1, 'checkGroup', 'items', 0])['lastUsedAt'] =
          'yesterday';

      expect(() => parseBridgeEvent(json), throwsFormatException);
    });

    for (final String url in [
      'file:///Applications/Calculator.app',
      'https://example.com',
    ]) {
      test('on a settings link to $url', () {
        final Map<String, Object?> scanned = loadSampleJson('scanned');
        getMapAt(scanned, ['notices', 0, 'settingsLink'])['url'] = url;
        final Map<String, Object?> status = loadSampleJson('status');
        getMapAt(status, ['notices', 0, 'settingsLink'])['url'] = url;

        expect(() => parseBridgeEvent(scanned), throwsFormatException);
        expect(() => parseBridgeEvent(status), throwsFormatException);
        expect(() => SystemSettingsUrl.parse(url), throwsFormatException);
      });
    }

    test('on a download link to a pane of System Settings', () {
      final Map<String, Object?> json = loadSampleJson('updateChecked');
      getMapAt(json, ['notice', 'downloadLink'])['url'] =
          fullDiskAccessSettingsUrl;

      expect(() => parseBridgeEvent(json), throwsFormatException);
    });

    test('on a settings link to a release page', () {
      final Map<String, Object?> json = loadSampleJson('status');
      getMapAt(json, ['notices', 0, 'settingsLink'])['url'] = releasePageUrl;

      expect(() => parseBridgeEvent(json), throwsFormatException);
    });

    for (final String url in [
      'http://github.com/iOSonntag/magic-free-disk-space/releases/tag/v1.3.0',
      'https://example.com/iOSonntag/magic-free-disk-space/releases/tag/v1.3.0',
      'https://user@github.com/iOSonntag/magic-free-disk-space/releases/tag/v1.3.0',
      'https://github.com:8443/iOSonntag/magic-free-disk-space/releases/tag/v1.3.0',
      'https://github.com:443/iOSonntag/magic-free-disk-space/releases/tag/v1.3.0',
      'https://GitHub.com/iOSonntag/magic-free-disk-space/releases/tag/v1.3.0',
      'https://github.com/iOSonntag/magic-free-disk-space/releases/tag/v1.3.0?x=1',
      'https://github.com/iOSonntag/magic-free-disk-space/releases/tag/v1.3.0#notes',
      'https://github.com/someone/magic-free-disk-space/releases/tag/v1.3.0',
      'https://github.com/iOSonntag/magic-free-disk-space/releases/latest',
      'https://github.com/iOSonntag/magic-free-disk-space/releases/tag/1.3.0',
      'https://github.com/iOSonntag/magic-free-disk-space/releases/tag/v1.3',
      'https://github.com/iOSonntag/magic-free-disk-space/releases/tag/v1.3.0-beta',
      'https://github.com/iOSonntag/magic-free-disk-space/releases/tag/v1.3.0/',
      'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles',
    ]) {
      test('on a download link to $url', () {
        final Map<String, Object?> json = loadSampleJson('updateChecked');
        getMapAt(json, ['notice', 'downloadLink'])['url'] = url;

        expect(() => parseBridgeEvent(json), throwsFormatException);
        expect(() => ReleasePageUrl.parse(url), throwsFormatException);
      });
    }

    test('on an update check without its switch', () {
      final Map<String, Object?> json = loadSampleJson('updateChecked')
        ..remove('isUpdateCheckEnabled');

      expect(() => parseBridgeEvent(json), throwsFormatException);
    });

    test('on a missing key', () {
      final Map<String, Object?> withoutSafeNumbers = loadSampleJson('scanned')
        ..remove('safeNumbers');
      final Map<String, Object?> withoutCheckGroup = loadSampleJson('scanned');
      getMapAt(withoutCheckGroup, ['sections', 0]).remove('checkGroup');
      final Map<String, Object?> withoutSettingsLink = loadSampleJson('status');
      getMapAt(withoutSettingsLink, ['notices', 0]).remove('settingsLink');
      final Map<String, Object?> withoutRevealPath = loadSampleJson('scanned');
      getMapAt(withoutRevealPath, ['sections', 0, 'items', 0]).remove(
        'revealPath',
      );
      final Map<String, Object?> withoutLogPath = loadSampleJson('deleted')
        ..remove('logPath');
      final Map<String, Object?> withoutPhase = loadSampleJson('progress')
        ..remove('phase');

      for (final Map<String, Object?> json in [
        withoutSafeNumbers,
        withoutCheckGroup,
        withoutSettingsLink,
        withoutRevealPath,
        withoutLogPath,
        withoutPhase,
      ]) {
        expect(() => parseBridgeEvent(json), throwsFormatException);
      }
    });

    test('on a value of the wrong type', () {
      final Map<String, Object?> json = loadSampleJson('scanned')
        ..['safeNumbers'] = ['1'];
      final Map<String, Object?> textBytes = loadSampleJson('planned')
        ..['totalBytes'] = '10 MB';

      expect(() => parseBridgeEvent(json), throwsFormatException);
      expect(() => parseBridgeEvent(textBytes), throwsFormatException);
    });
  });
}
