import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_event.dart';
import 'package:magic_free_disk_space/bridge/openable_url.dart';
import 'package:magic_free_disk_space/cleaner/cleaner_bridge.dart';
import 'package:magic_free_disk_space/cleaner/cleaner_controller.dart';
import 'package:magic_free_disk_space/overview/overview_page.dart';
import 'package:magic_free_disk_space/overview/section_card.dart';
import 'package:magic_free_disk_space/shell/app_destination.dart';
import 'package:magic_free_disk_space/shell/navigation_controller.dart';
import 'package:magic_free_disk_space/shell/stage_button.dart';
import 'package:magic_free_disk_space/update/update_controller.dart';

import '../shell/support/stage_harness.dart';
import '../support/fake_cleaner_bridge.dart';
import '../support/fake_update_bridge.dart';
import '../support/fake_url_opener.dart';
import '../support/semantics_labels.dart';

typedef _OverviewParts = ({
  CleanerController cleanerController,
  NavigationController navigation,
});

Future<_OverviewParts> _pumpOverview(
  WidgetTester tester, {
  required CleanerBridge bridge,
  UpdateController? updateController,
  FakeUrlOpener? urlOpener,
}) async {
  final CleanerController cleanerController = startScanningCleaner(bridge);
  final NavigationController navigation = createNavigation();
  await pumpOnStage(
    tester,
    OverviewPage(
      cleanerController: cleanerController,
      updateController: updateController ?? createQuietUpdateController(),
      navigation: navigation,
      urlOpener: urlOpener ?? FakeUrlOpener(isOpening: true),
    ),
  );
  return (cleanerController: cleanerController, navigation: navigation);
}

UpdateController _createUpdateController(UpdateCheckAnswer answer) {
  final UpdateController controller = UpdateController(
    bridge: FakeUpdateBridge(answerCheck: () async => answer),
  );
  addTearDown(controller.dispose);
  return controller;
}

VoidCallback? _readCleanButtonPress(WidgetTester tester) {
  return tester
      .widget<StageButton>(
        find.ancestor(
          of: find.textContaining('Clean safe items'),
          matching: find.byType(StageButton),
        ),
      )
      .onPressed;
}

void main() {
  final ScannedEvent sampleScan = loadSampleScan();
  final StatusEvent deniedStatus = loadFirstSampleEvent<StatusEvent>();
  final UpdateCheckedEvent sampleCheck = loadFirstSampleEvent<UpdateCheckedEvent>();

  testWidgets('shows what can be freed on the disk and a card per section', (
    WidgetTester tester,
  ) async {
    final _OverviewParts parts = await _pumpOverview(
      tester,
      bridge: FakeCleanerBridge(scanAnswer: sampleScan),
    );

    expect(find.text('Overview'), findsOneWidget);
    expect(find.text('19 MB can be freed'), findsOneWidget);
    expect(find.text('52 GB available of 500 GB'), findsOneWidget);
    expect(find.text('6.0 MB of it is safe to remove at once'), findsOneWidget);
    expect(find.text('WHERE THE SPACE IS'), findsOneWidget);
    for (final SectionKey sectionKey in [
      SectionKey.caches,
      SectionKey.developerTools,
      SectionKey.apps,
      SectionKey.largeFiles,
    ]) {
      expect(find.byKey(SectionCardKey(sectionKey)), findsOneWidget);
    }
    expect(
      find.descendant(
        of: find.byKey(const SectionCardKey(SectionKey.developerTools)),
        matching: find.text('1 item · 1 to handle yourself'),
      ),
      findsOneWidget,
    );
    expect(_readCleanButtonPress(tester), isNotNull);
    expectEveryTappableNodeLabelled();

    await tapAndSettle(tester, find.byKey(const SectionCardKey(SectionKey.caches)));

    expect(parts.navigation.destination, const SectionDestination(SectionKey.caches));
  });

  testWidgets('Clean safe items plans the safe items and opens the alert on them', (
    WidgetTester tester,
  ) async {
    final FakeCleanerBridge bridge = FakeCleanerBridge(scanAnswer: sampleScan)
      ..planAnswer = loadFirstSampleEvent<PlannedEvent>();
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
    final Map<String, Object?> json = loadSampleScanJson();
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
    expect(_readCleanButtonPress(tester), isNull);
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
      updateController: _createUpdateController(sampleCheck),
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
      updateController: _createUpdateController(sampleCheck),
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
    final HoldingCleanerBridge bridge = HoldingCleanerBridge(
      inner: FakeCleanerBridge(scanAnswer: sampleScan),
      isHoldingScan: true,
      heldProgress: loadFirstSampleEvent<ProgressEvent>(),
    );
    await _pumpOverview(tester, bridge: bridge);

    expect(find.text('found so far'), findsOneWidget);
    expect(find.byKey(const SectionCardKey(SectionKey.caches)), findsOneWidget);
    expect(find.byKey(const SectionCardKey(SectionKey.developerTools)), findsOneWidget);
    expect(find.byKey(const SectionCardKey(SectionKey.apps)), findsNothing);
    expect(find.text('Clean safe items'), findsOneWidget);
    expect(_readCleanButtonPress(tester), isNull);
    expectEveryTappableNodeLabelled();

    bridge.completeHeldScan(sampleScan);
    await tester.pumpAndSettle();

    expect(find.text('19 MB can be freed'), findsOneWidget);
    expect(find.byKey(const SectionCardKey(SectionKey.apps)), findsOneWidget);
  });
}
