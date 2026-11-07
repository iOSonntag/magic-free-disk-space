import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge.dart';
import 'package:magic_free_disk_space/cleaner/cleaner.dart';
import 'package:magic_free_disk_space/overview/overview.dart';
import 'package:magic_free_disk_space/overview/section_card.dart';
import 'package:magic_free_disk_space/removal/removal.dart';
import 'package:magic_free_disk_space/update/update.dart';

import '../support/fake_cleaner_bridge.dart';
import '../support/fake_update_bridge.dart';
import '../support/fake_url_opener.dart';
import '../support/sample_events.dart';
import '../support/semantics_labels.dart';
import '../support/stage_controls.dart';
import '../support/stage_harness.dart';

typedef _OverviewParts = ({
  CleanerController cleanerController,
  List<SectionKey> selectedSections,
});

Future<_OverviewParts> _pumpOverview(
  WidgetTester tester, {
  required FakeCleanerBridge bridge,
  UpdateCheckAnswer updateCheck = quietUpdateCheck,
  FakeUrlOpener? urlOpener,
}) async {
  final CleanerController cleanerController = startScanningCleaner(bridge);
  final UpdateController updateController = createUpdateController(
    FakeUpdateBridge(answerCheck: () async => updateCheck),
  );
  final List<SectionKey> selectedSections = [];
  await pumpOnStage(
    tester,
    Builder(
      builder: (BuildContext context) => OverviewPage(
        cleanerController: cleanerController,
        updateController: updateController,
        onSectionSelected: selectedSections.add,
        onCleanSafeItems: () => cleanSafeItems(context, cleanerController),
        urlOpener: urlOpener ?? FakeUrlOpener(isOpening: true),
      ),
    ),
  );
  return (cleanerController: cleanerController, selectedSections: selectedSections);
}

/// [sectionKeys] in the order their cards stand on the page, row by row.
List<SectionKey> _sortByCardPlace(WidgetTester tester, List<SectionKey> sectionKeys) {
  Offset findCardPlace(SectionKey sectionKey) {
    return tester.getTopLeft(find.byKey(SectionCardKey(sectionKey)));
  }

  return [...sectionKeys]..sort((SectionKey left, SectionKey right) {
    final Offset leftPlace = findCardPlace(left);
    final Offset rightPlace = findCardPlace(right);
    final int byRow = leftPlace.dy.compareTo(rightPlace.dy);
    return byRow != 0 ? byRow : leftPlace.dx.compareTo(rightPlace.dx);
  });
}

bool _isCleanButtonEnabled(WidgetTester tester) {
  return isButtonEnabled(
    tester,
    findButtonAround(find.textContaining('Clean safe items')),
  );
}

void main() {
  final ScannedEvent sampleScan = loadSampleEvent<ScannedEvent>();
  final StatusEvent deniedStatus = loadSampleEvent<StatusEvent>();
  final UpdateCheckedEvent sampleCheck = loadSampleEvent<UpdateCheckedEvent>();

  testWidgets('shows what can be freed on the disk and a card per section', (
    WidgetTester tester,
  ) async {
    final _OverviewParts parts = await _pumpOverview(
      tester,
      bridge: FakeCleanerBridge(scanAnswer: sampleScan),
    );

    expect(find.text('Overview'), findsOneWidget);
    expect(find.text('26 MB can be freed'), findsOneWidget);
    expect(find.text('52 GB available of 500 GB'), findsOneWidget);
    expect(find.text('6.0 MB of it is safe to remove at once'), findsOneWidget);
    expect(find.text('WHERE THE SPACE IS'), findsOneWidget);
    final List<SectionKey> bridgeOrder = [
      for (final SectionTotal total in sampleScan.sectionTotals) total.sectionKey,
    ];
    for (final SectionKey sectionKey in bridgeOrder) {
      expect(find.byKey(SectionCardKey(sectionKey)), findsOneWidget);
    }
    expect(_sortByCardPlace(tester, bridgeOrder), bridgeOrder);
    expect(
      find.descendant(
        of: find.byKey(const SectionCardKey(SectionKey.developerTools)),
        matching: find.text('2 items · 1 to handle yourself'),
      ),
      findsOneWidget,
    );
    expect(_isCleanButtonEnabled(tester), isTrue);
    expectEveryTappableNodeLabelled();

    await tapAndSettle(tester, find.byKey(const SectionCardKey(SectionKey.caches)));

    expect(parts.selectedSections, [SectionKey.caches]);
  });

  testWidgets('Clean safe items plans the safe items and opens the alert on them', (
    WidgetTester tester,
  ) async {
    final FakeCleanerBridge bridge = FakeCleanerBridge(scanAnswer: sampleScan)
      ..planAnswer = loadSampleEvent<PlannedEvent>();
    final _OverviewParts parts = await _pumpOverview(tester, bridge: bridge);

    await tapAndSettle(tester, find.text('Clean safe items · 6.0 MB'));

    expect(bridge.plannedNumbers, sampleScan.safeNumbers);
    expect(parts.cleanerController.state, isA<ConfirmingState>());
    expect(find.text('Show list'), findsOneWidget);
    expectEveryTappableNodeLabelled();
  });

  testWidgets('offers no clean while nothing is safe to remove', (
    WidgetTester tester,
  ) async {
    final Map<String, Object?> json = loadSampleJson('scanned');
    json['safeNumbers'] = <Object?>[];
    (json['summary']! as Map<String, Object?>)['safeBytes'] = 0;
    await _pumpOverview(
      tester,
      bridge: FakeCleanerBridge(scanAnswer: parseScanJson(json)),
    );

    expect(
      find.text('Nothing is safe to remove at once; review each section.'),
      findsOneWidget,
    );
    expect(_isCleanButtonEnabled(tester), isFalse);
  });

  testWidgets('shows the Full Disk Access notice with its settings link', (
    WidgetTester tester,
  ) async {
    final FakeUrlOpener urlOpener = FakeUrlOpener(isOpening: true);
    await _pumpOverview(
      tester,
      bridge: FakeCleanerBridge(scanAnswer: sampleScan)
        ..answerStatus = () async => deniedStatus,
      urlOpener: urlOpener,
    );

    expect(find.text('Full Disk Access is off'), findsOneWidget);

    await tapAndSettle(tester, find.text('Open System Settings').first);

    expect(urlOpener.requestedUrls.single, isA<SystemSettingsUrl>());
    expect(
      urlOpener.requestedUrls.single.text,
      'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles',
    );
  });

  testWidgets('says how to open System Settings when it did not open', (
    WidgetTester tester,
  ) async {
    await _pumpOverview(
      tester,
      bridge: FakeCleanerBridge(scanAnswer: sampleScan)
        ..answerStatus = () async => deniedStatus,
      urlOpener: FakeUrlOpener(isOpening: false),
    );

    await tapAndSettle(tester, find.text('Open System Settings').first);

    expect(
      find.text(
        'System Settings did not open. Open it yourself and go to Privacy & Security > Full Disk Access.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('shows no Full Disk Access notice once it is granted', (
    WidgetTester tester,
  ) async {
    await _pumpOverview(tester, bridge: FakeCleanerBridge(scanAnswer: sampleScan));

    expect(find.text('Full Disk Access is off'), findsNothing);
  });

  testWidgets('shows the update notice and opens its download page', (
    WidgetTester tester,
  ) async {
    final FakeUrlOpener urlOpener = FakeUrlOpener(isOpening: true);
    await _pumpOverview(
      tester,
      bridge: FakeCleanerBridge(scanAnswer: sampleScan),
      updateCheck: sampleCheck,
      urlOpener: urlOpener,
    );

    expect(find.text('Version 1.3.0 is available'), findsOneWidget);
    expect(find.textContaining('You have version 1.2.0.'), findsOneWidget);

    await tapAndSettle(tester, find.text('Open the download page'));

    expect(urlOpener.requestedUrls.single, isA<ReleasePageUrl>());
    expect(
      urlOpener.requestedUrls.single.text,
      'https://github.com/iOSonntag/magic-free-disk-space/releases/tag/v1.3.0',
    );
    expect(find.text(sampleCheck.notice!.downloadLink.failedText), findsNothing);
  });

  testWidgets('names the download page when the browser did not open', (
    WidgetTester tester,
  ) async {
    await _pumpOverview(
      tester,
      bridge: FakeCleanerBridge(scanAnswer: sampleScan),
      updateCheck: sampleCheck,
      urlOpener: FakeUrlOpener(isOpening: false),
    );

    await tapAndSettle(tester, find.text('Open the download page'));

    expect(find.text(sampleCheck.notice!.downloadLink.failedText), findsOneWidget);
  });

  testWidgets('shows no update notice when no newer release exists', (
    WidgetTester tester,
  ) async {
    await _pumpOverview(tester, bridge: FakeCleanerBridge(scanAnswer: sampleScan));

    expect(find.text('Version 1.3.0 is available'), findsNothing);
    expect(find.text('Open the download page'), findsNothing);
  });

  testWidgets('lists the notes on the scan and what it skipped', (
    WidgetTester tester,
  ) async {
    final FakeUrlOpener urlOpener = FakeUrlOpener(isOpening: true);
    await _pumpOverview(
      tester,
      bridge: FakeCleanerBridge(scanAnswer: sampleScan),
      urlOpener: urlOpener,
    );

    expect(find.text('NOTES ON THIS SCAN'), findsOneWidget);
    expect(find.text('Could not read 2 places'), findsOneWidget);
    expect(find.text('Could not ask 1 tool'), findsOneWidget);
    expect(find.text('Some sizes may be larger than the space they free'), findsOneWidget);
    expect(find.text('Skipped 12 items'), findsOneWidget);
    expect(
      find.text('too small to matter: 9\nits app or tool is running: 3'),
      findsOneWidget,
    );

    await tapAndSettle(tester, find.text('Open System Settings'));

    expect(urlOpener.requestedUrls.single, isA<SystemSettingsUrl>());
  });

  testWidgets('lands each section found while the scan runs', (
    WidgetTester tester,
  ) async {
    final FakeCleanerBridge bridge = FakeCleanerBridge(scanAnswer: sampleScan)
      ..scanProgress = loadSampleEvent<ProgressEvent>();
    final Completer<ScanAnswer> heldScan = bridge.holdNextScan();
    await _pumpOverview(tester, bridge: bridge);

    expect(find.text('found so far'), findsOneWidget);
    expect(find.byKey(const SectionCardKey(SectionKey.caches)), findsOneWidget);
    expect(find.byKey(const SectionCardKey(SectionKey.developerTools)), findsOneWidget);
    expect(find.byKey(const SectionCardKey(SectionKey.apps)), findsNothing);
    expect(find.text('Clean safe items'), findsOneWidget);
    expect(_isCleanButtonEnabled(tester), isFalse);
    expectEveryTappableNodeLabelled();

    heldScan.complete(sampleScan);
    await tester.pumpAndSettle();

    expect(find.text('26 MB can be freed'), findsOneWidget);
    expect(find.byKey(const SectionCardKey(SectionKey.apps)), findsOneWidget);
  });
}
