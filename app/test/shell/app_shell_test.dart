import 'dart:async';

import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_event.dart';
import 'package:magic_free_disk_space/bridge/openable_url.dart';
import 'package:magic_free_disk_space/cleaner/cleaner_bridge.dart';
import 'package:magic_free_disk_space/cleaner/cleaner_controller.dart';
import 'package:magic_free_disk_space/handled_elsewhere/handled_elsewhere_page.dart';
import 'package:magic_free_disk_space/overview/overview_page.dart';
import 'package:magic_free_disk_space/overview/section_card.dart';
import 'package:magic_free_disk_space/removal/deleted_page.dart';
import 'package:magic_free_disk_space/removal/deleting_view.dart';
import 'package:magic_free_disk_space/removal/review_page.dart';
import 'package:magic_free_disk_space/section/item_row.dart';
import 'package:magic_free_disk_space/section/section_page.dart';
import 'package:magic_free_disk_space/settings/settings_page.dart';
import 'package:magic_free_disk_space/shell/app_destination.dart';
import 'package:magic_free_disk_space/shell/navigation_controller.dart';
import 'package:magic_free_disk_space/shell/sidebar.dart';
import 'package:magic_free_disk_space/shell/stage_button.dart';
import 'package:magic_free_disk_space/shell/stage_check_mark.dart';
import 'package:magic_free_disk_space/shell/window_frame.dart';

import '../support/fake_cleaner_bridge.dart';
import '../support/fake_url_opener.dart';
import '../support/semantics_labels.dart';
import 'support/stage_harness.dart';

typedef _ShellParts = ({
  CleanerController controller,
  NavigationController navigation,
  FakeUrlOpener urlOpener,
});

Future<_ShellParts> _pumpShell(
  WidgetTester tester, {
  required CleanerBridge bridge,
  FakeUrlOpener? urlOpener,
}) async {
  final CleanerController controller = startScanningCleaner(bridge);
  final NavigationController navigation = createNavigation();
  final FakeUrlOpener shownUrlOpener = urlOpener ?? FakeUrlOpener(isOpening: true);
  await pumpAppShell(
    tester,
    cleanerController: controller,
    updateController: createQuietUpdateController(),
    navigation: navigation,
    urlOpener: shownUrlOpener,
  );
  return (controller: controller, navigation: navigation, urlOpener: shownUrlOpener);
}

FakeCleanerBridge _createSampleBridge({ScannedEvent? scan}) {
  return FakeCleanerBridge(scanAnswer: scan ?? loadSampleScan())
    ..planAnswer = loadFirstSampleEvent<PlannedEvent>();
}

Finder _findSidebarEntry(AppDestination destination) {
  return find.byKey(SidebarEntryKey(destination));
}

VoidCallback? _readButtonPress(WidgetTester tester, String label) {
  return tester
      .widget<StageButton>(
        find.ancestor(of: find.text(label), matching: find.byType(StageButton)),
      )
      .onPressed;
}

bool? _readRowMark(WidgetTester tester, int number) {
  return tester
      .widget<StageCheckMark>(
        find.descendant(
          of: find.byKey(ItemRowKey(number)),
          matching: find.byType(StageCheckMark),
        ),
      )
      .value;
}

/// The rect of [node] in the window, through the transforms of its
/// ancestors.
Rect _findWindowRect(SemanticsNode node) {
  Rect rect = node.rect;
  for (SemanticsNode? current = node; current != null; current = current.parent) {
    final Matrix4? transform = current.transform;
    if (transform != null) {
      rect = MatrixUtils.transformRect(transform, rect);
    }
  }
  return rect;
}

/// The sample scan, with the sections of Apps and Large files under two keys
/// this app does not know.
ScannedEvent _buildScanWithUnknownSections() {
  final Map<String, Object?> json = loadSampleScanJson();
  const Map<String, String> unknownKeys = {
    'apps': 'otherFuture',
    'largeFiles': 'futureThings',
  };
  const Map<String, String> unknownTitles = {
    'otherFuture': 'Other future',
    'futureThings': 'Future things',
  };
  final List<Map<String, Object?>> sections = (json['sections']! as List<Object?>)
      .cast<Map<String, Object?>>();
  for (final Map<String, Object?> section in sections) {
    final String? unknownKey = unknownKeys[section['key']];
    if (unknownKey != null) {
      section['key'] = unknownKey;
      section['titleText'] = unknownTitles[unknownKey];
    }
  }
  // The bridge lists Large files after Apps; put its section first, so its
  // title is the one the shell shows.
  sections.sort((Map<String, Object?> first, Map<String, Object?> second) {
    return (first['key'] == 'futureThings' ? 0 : 1) -
        (second['key'] == 'futureThings' ? 0 : 1);
  });
  for (final Map<String, Object?> item in listScanItemJsons(json)) {
    item['sectionKey'] = unknownKeys[item['sectionKey']] ?? item['sectionKey'];
  }
  for (final Object? total in json['sectionTotals']! as List<Object?>) {
    final Map<String, Object?> totalJson = total! as Map<String, Object?>;
    totalJson['sectionKey'] =
        unknownKeys[totalJson['sectionKey']] ?? totalJson['sectionKey'];
  }
  return parseScanJson(json);
}

/// The sample scan, with a Photos library that only Photos can free.
ScannedEvent _buildScanWithOwnAppAdvice() {
  final Map<String, Object?> json = loadSampleScanJson();
  listScanAdviceJsons(json).add({
    'key': 'own-app:photos-library',
    'title': 'Photos library',
    'risk': 'review',
    'riskText': 'review',
    'sizeText': '4.0 MB',
    'detailLines': [
      {'kind': 'explanation', 'text': 'The photos and videos of the Photos app.'},
      {'kind': 'advice', 'text': 'Empty Recently Deleted in Photos.'},
    ],
    'sectionKey': 'ownApp',
    'origin': 'catalog',
    'removal': 'advice',
    'allocatedBytes': 4000000,
    'displayPath': null,
    'revealPath': null,
    'opener': {'kind': 'app', 'app': 'photos'},
  });
  (json['sectionTotals']! as List<Object?>).add({
    'sectionKey': 'ownApp',
    'allocatedBytes': 4000000,
    'itemCount': 0,
    'safeBytes': 0,
    'adviceCount': 1,
  });
  return parseScanJson(json);
}

void main() {
  final ScannedEvent sampleScan = loadSampleScan();

  testWidgets('the sidebar leads to every destination', (WidgetTester tester) async {
    final _ShellParts parts = await _pumpShell(tester, bridge: _createSampleBridge());

    expect(find.byType(OverviewPage), findsOneWidget);
    for (final SectionKey sectionKey in [
      SectionKey.caches,
      SectionKey.developerTools,
      SectionKey.apps,
      SectionKey.largeFiles,
    ]) {
      expect(_findSidebarEntry(SectionDestination(sectionKey)), findsOneWidget);
    }
    // The barriers of the pages' routes must not hide the sidebar and the
    // toolbar from VoiceOver.
    expect(find.bySemanticsLabel('Caches, 10 MB'), findsOneWidget);
    expect(find.bySemanticsLabel('Scan again'), findsOneWidget);
    expect(_findSidebarEntry(const HandledElsewhereDestination()), findsOneWidget);
    expect(_findSidebarEntry(const SettingsDestination()), findsOneWidget);
    expectEveryTappableNodeLabelled();

    await tapAndSettle(tester, _findSidebarEntry(const SectionDestination(SectionKey.caches)));

    expect(parts.navigation.destination, const SectionDestination(SectionKey.caches));
    expect(find.byType(SectionPage), findsOneWidget);
    expect(find.byType(OverviewPage), findsNothing);
    expect(find.text('Tool cache'), findsOneWidget);
    expectEveryTappableNodeLabelled();

    await tapAndSettle(tester, _findSidebarEntry(const SettingsDestination()));

    expect(find.byType(SettingsPage), findsOneWidget);
    expect(find.byType(SectionPage), findsNothing);
    expectEveryTappableNodeLabelled();

    await tapAndSettle(tester, _findSidebarEntry(const OverviewDestination()));

    expect(parts.navigation.destination, const OverviewDestination());
    expect(find.byType(OverviewPage), findsOneWidget);
    expect(find.byType(SettingsPage), findsNothing);
  });

  testWidgets('a section card on the Overview opens its section', (
    WidgetTester tester,
  ) async {
    await _pumpShell(tester, bridge: _createSampleBridge());

    await tapAndSettle(tester, find.byKey(const SectionCardKey(SectionKey.developerTools)));

    expect(find.byType(SectionPage), findsOneWidget);
    expect(find.text('Developer tools'), findsNWidgets(2));
    expect(find.text('TO HANDLE YOURSELF'), findsOneWidget);
    expectEveryTappableNodeLabelled();
  });

  testWidgets('nothing a tap acts on lies in the strip of the title bar', (
    WidgetTester tester,
  ) async {
    await _pumpShell(tester, bridge: _createSampleBridge());

    final List<SemanticsNode> tappableNodes = find.semantics
        .byAction(SemanticsAction.tap)
        .evaluate()
        .toList();

    expect(tappableNodes, isNotEmpty);
    for (final SemanticsNode node in tappableNodes) {
      expect(
        _findWindowRect(node).top,
        greaterThanOrEqualTo(titleBarHeight),
        reason: '${node.label} lies under the title bar.',
      );
    }
  });

  testWidgets('Scan again scans again, and waits while a scan runs', (
    WidgetTester tester,
  ) async {
    final FakeCleanerBridge inner = _createSampleBridge();
    final HoldingCleanerBridge bridge = HoldingCleanerBridge(
      inner: inner,
      isHoldingScan: true,
    );
    await _pumpShell(tester, bridge: bridge);

    expect(_readButtonPress(tester, 'Scan again'), isNull);

    bridge.completeHeldScan(sampleScan);
    await tester.pumpAndSettle();

    expect(_readButtonPress(tester, 'Scan again'), isNotNull);

    bridge.isHoldingScan = false;
    await tapAndSettle(tester, find.text('Scan again'));

    expect(inner.requestKinds.where((String kind) => kind == 'scan'), hasLength(1));
    expect(find.text('19 MB can be freed'), findsOneWidget);
  });

  testWidgets('Review lies over the pages, and leaves the section as it was', (
    WidgetTester tester,
  ) async {
    final FakeCleanerBridge bridge = _createSampleBridge();
    final _ShellParts parts = await _pumpShell(tester, bridge: bridge);
    await tapAndSettle(tester, _findSidebarEntry(const SectionDestination(SectionKey.caches)));
    await tapAndSettle(tester, find.bySemanticsLabel('Show Review first'));
    await tapAndSettle(tester, find.byKey(const ItemRowKey(2)));

    expect(find.text('1 item selected'), findsOneWidget);
    expectEveryTappableNodeLabelled();

    await tapAndSettle(tester, find.bySemanticsLabel('Review the 1 item selected'));

    expect(bridge.plannedNumbers, [2]);
    expect(find.byType(ReviewPage), findsOneWidget);
    expect(find.byType(SectionPage), findsNothing);
    expectEveryTappableNodeLabelled();

    await tapAndSettle(tester, _findSidebarEntry(const SettingsDestination()));

    expect(parts.navigation.destination, const SectionDestination(SectionKey.caches));

    parts.controller.cancelConfirmation();
    await tester.pumpAndSettle();

    expect(find.byType(ReviewPage), findsNothing);
    expect(find.byType(SectionPage), findsOneWidget);
    expect(find.text('App cache'), findsOneWidget);
    expect(_readRowMark(tester, 2), isTrue);
  });

  testWidgets('shows why the bridge refused a selection over the page that asked', (
    WidgetTester tester,
  ) async {
    final FakeCleanerBridge bridge = _createSampleBridge()
      ..planAnswer = loadFirstSampleEvent<NothingApprovedEvent>();
    await _pumpShell(tester, bridge: bridge);
    await tapAndSettle(tester, _findSidebarEntry(const SectionDestination(SectionKey.caches)));
    await tapAndSettle(tester, find.bySemanticsLabel('Show Review first'));
    await tapAndSettle(tester, find.byKey(const ItemRowKey(2)));

    await tapAndSettle(tester, find.bySemanticsLabel('Review the 1 item selected'));

    expect(find.textContaining('Nothing of the selection can be deleted.'), findsOneWidget);
    expect(find.byType(SectionPage), findsOneWidget);
    expect(find.text('App cache'), findsOneWidget);
    expect(_readRowMark(tester, 2), isTrue);
  });

  testWidgets('Clean safe items plans the safe items, and Show list opens Review', (
    WidgetTester tester,
  ) async {
    final FakeCleanerBridge bridge = _createSampleBridge();
    final _ShellParts parts = await _pumpShell(tester, bridge: bridge);

    await tapAndSettle(tester, find.text('Clean safe items · 6.0 MB'));

    expect(bridge.plannedNumbers, sampleScan.safeNumbers);
    expect(parts.controller.state, isA<ConfirmingState>());
    expect(find.text('Show list'), findsOneWidget);

    await tapAndSettle(tester, find.text('Show list'));

    expect(find.text('Show list'), findsNothing);
    expect(find.byType(ReviewPage), findsOneWidget);
    expect(parts.controller.state, isA<ConfirmingState>());
  });

  testWidgets('shows the run while it deletes, then its result', (
    WidgetTester tester,
  ) async {
    final FakeCleanerBridge inner = _createSampleBridge()
      ..deleteAnswer = loadFirstSampleEvent<DeletedEvent>();
    final HoldingCleanerBridge bridge = HoldingCleanerBridge(
      inner: inner,
      isHoldingDelete: true,
    );
    final _ShellParts parts = await _pumpShell(tester, bridge: bridge);
    parts.controller.selectSafeCandidates();
    await parts.controller.requestPlan();
    await tester.pumpAndSettle();

    unawaited(parts.controller.confirmDeletion('DELETE'));
    await tester.pumpAndSettle();

    expect(find.byType(DeletingView), findsOneWidget);
    expect(find.byType(OverviewPage), findsNothing);
    expect(_readButtonPress(tester, 'Scan again'), isNull);

    bridge.completeHeldDelete(loadFirstSampleEvent<DeletedEvent>());
    await tester.pumpAndSettle();

    expect(find.byType(DeletedPage), findsOneWidget);
    expect(find.byType(DeletingView), findsNothing);
    expectEveryTappableNodeLabelled();

    await tapAndSettle(tester, find.text('Done'));

    expect(find.byType(DeletedPage), findsNothing);
    expect(find.byType(OverviewPage), findsOneWidget);
    expect(parts.controller.state, isA<ScannedState>());
  });

  testWidgets('shows a section of a key this app does not know by the bridge title', (
    WidgetTester tester,
  ) async {
    await _pumpShell(
      tester,
      bridge: _createSampleBridge(scan: _buildScanWithUnknownSections()),
    );

    expect(find.bySemanticsLabel('Future things, 6.0 MB'), findsOneWidget);
    expect(find.byKey(const SectionCardKey(SectionKey.unknown)), findsOneWidget);
    expectEveryTappableNodeLabelled();

    await tapAndSettle(tester, find.byKey(const SectionCardKey(SectionKey.unknown)));

    expect(find.byType(SectionPage), findsOneWidget);
    expect(find.text('Future things'), findsNWidgets(2));
    expect(find.text('Review first'), findsOneWidget);
    expect(find.text("Can't be undone"), findsOneWidget);
    expectEveryTappableNodeLabelled();
  });

  testWidgets('Handled by its own app opens the app that frees the space', (
    WidgetTester tester,
  ) async {
    final _ShellParts parts = await _pumpShell(
      tester,
      bridge: _createSampleBridge(scan: _buildScanWithOwnAppAdvice()),
    );

    expect(find.bySemanticsLabel('Handled by its own app, 4.0 MB'), findsOneWidget);

    await tapAndSettle(tester, _findSidebarEntry(const HandledElsewhereDestination()));

    expect(find.byType(HandledElsewherePage), findsOneWidget);
    expect(find.text('IN THEIR OWN APPS'), findsOneWidget);
    expect(find.text('Photos library'), findsOneWidget);
    expect(find.text('Empty Recently Deleted in Photos.'), findsOneWidget);
    expect(find.byType(StageCheckMark), findsNothing);
    expect(find.text('Reveal in Finder'), findsNothing);
    expectEveryTappableNodeLabelled();

    await tapAndSettle(tester, find.text('Open Photos'));

    expect(parts.urlOpener.requestedUrls.single, isA<OpenAppUrl>());
    expect(parts.urlOpener.requestedUrls.single.text, 'com.apple.Photos');
    expect(find.text('Photos did not open.'), findsNothing);
  });

  testWidgets('says when the app of an advice did not open', (
    WidgetTester tester,
  ) async {
    await _pumpShell(
      tester,
      bridge: _createSampleBridge(scan: _buildScanWithOwnAppAdvice()),
      urlOpener: FakeUrlOpener(isOpening: false),
    );
    await tapAndSettle(tester, _findSidebarEntry(const HandledElsewhereDestination()));

    await tapAndSettle(tester, find.text('Open Photos'));

    expect(find.text('Photos did not open.'), findsOneWidget);
  });
}
