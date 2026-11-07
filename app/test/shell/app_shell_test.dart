import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge.dart';
import 'package:magic_free_disk_space/cleaner/cleaner.dart';
import 'package:magic_free_disk_space/design/design.dart';
import 'package:magic_free_disk_space/overview/overview.dart';
import 'package:magic_free_disk_space/overview/section_card.dart';
import 'package:magic_free_disk_space/removal/deleted_page.dart';
import 'package:magic_free_disk_space/removal/deleting_view.dart';
import 'package:magic_free_disk_space/removal/review_page.dart';
import 'package:magic_free_disk_space/section/item_row.dart';
import 'package:magic_free_disk_space/section/section.dart';
import 'package:magic_free_disk_space/settings/settings.dart';
import 'package:magic_free_disk_space/shell/app_destination.dart';
import 'package:magic_free_disk_space/shell/shell.dart';
import 'package:magic_free_disk_space/shell/shell_notice_banner.dart';
import 'package:magic_free_disk_space/shell/sidebar.dart';
import 'package:magic_free_disk_space/shell/window_frame.dart';

import '../support/fake_cleaner_bridge.dart';
import '../support/fake_update_bridge.dart';
import '../support/fake_url_opener.dart';
import '../support/sample_events.dart';
import '../support/semantics_labels.dart';
import '../support/stage_controls.dart';
import '../support/stage_harness.dart';

typedef _ShellParts = ({
  CleanerController controller,
  NavigationController navigation,
  FakeUrlOpener urlOpener,
});

/// Pumps the whole shell over [bridge] as the app shows it, in a window of
/// [windowSize], and lets the first requests answer.
Future<_ShellParts> _pumpShell(
  WidgetTester tester, {
  required FakeCleanerBridge bridge,
  FakeUrlOpener? urlOpener,
  Size windowSize = stageWindowSize,
}) async {
  final CleanerController controller = startScanningCleaner(bridge);
  final NavigationController navigation = NavigationController();
  addTearDown(navigation.dispose);
  final FakeUrlOpener shownUrlOpener = urlOpener ?? FakeUrlOpener(isOpening: true);
  final Widget app = MaterialApp(
    theme: buildStageTheme(),
    builder: (BuildContext context, Widget? child) {
      return DestinationStage(navigation: navigation, child: child!);
    },
    home: AppShell(
      cleanerController: controller,
      updateController: createUpdateController(
        FakeUpdateBridge(answerCheck: () async => quietUpdateCheck),
      ),
      navigation: navigation,
      urlOpener: shownUrlOpener,
    ),
  );
  setStageWindowSize(tester, size: windowSize);
  await tester.pumpWidget(buildStageScopes(app));
  await tester.pumpAndSettle();
  return (controller: controller, navigation: navigation, urlOpener: shownUrlOpener);
}

FakeCleanerBridge _createSampleBridge({ScannedEvent? scan}) {
  return FakeCleanerBridge(scanAnswer: scan ?? loadSampleEvent<ScannedEvent>())
    ..planAnswer = loadSampleEvent<PlannedEvent>()
    ..deleteAnswer = loadSampleEvent<DeletedEvent>();
}

Finder _findSidebarEntry(AppDestination destination) {
  return find.byKey(SidebarEntryKey(destination));
}

Finder _findSectionEntry(SectionKey sectionKey) {
  return _findSidebarEntry(buildSectionDestination(sectionKey));
}

/// Scrolls [finder] into the window, then taps it and settles.
Future<void> _showAndTap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tapAndSettle(tester, finder);
}

/// Ticks the careful data of a removed app (#4) on the page of Apps.
Future<void> _tickRemovedAppData(WidgetTester tester) async {
  await tapAndSettle(tester, _findSectionEntry(SectionKey.apps));
  await tapAndSettle(tester, find.bySemanticsLabel("Show Can't be undone"));
  await tapAndSettle(tester, find.byKey(const ItemRowKey(4)));
}

/// The notice of the shell that holds [text].
Finder _findShellNotice(String text) {
  return find.descendant(
    of: find.byType(ShellNoticeBanner),
    matching: find.textContaining(text),
  );
}

/// Whether [notice] lies wholly above [page].
bool _isAbovePage(WidgetTester tester, Finder notice, Finder page) {
  return tester.getRect(notice).bottom <= tester.getRect(page).top;
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
  final Map<String, Object?> json = loadSampleJson('scanned');
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
  for (final Map<String, Object?> item in [
    ...listScanItemJsons(json),
    ...listScanAdviceJsons(json),
  ]) {
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
  final Map<String, Object?> json = loadSampleJson('scanned');
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
  final ScannedEvent sampleScan = loadSampleEvent<ScannedEvent>();

  testWidgets('the sidebar leads to every destination', (WidgetTester tester) async {
    final _ShellParts parts = await _pumpShell(tester, bridge: _createSampleBridge());

    expect(find.byType(OverviewPage), findsOneWidget);
    final List<SectionKey> bridgeOrder = [
      for (final SectionTotal total in sampleScan.sectionTotals) total.sectionKey,
    ];
    for (final SectionKey sectionKey in bridgeOrder) {
      expect(_findSectionEntry(sectionKey), findsOneWidget);
    }
    expect(
      [...bridgeOrder]..sort(
        (SectionKey upper, SectionKey lower) => tester
            .getTopLeft(_findSectionEntry(upper))
            .dy
            .compareTo(tester.getTopLeft(_findSectionEntry(lower)).dy),
      ),
      bridgeOrder,
      reason: 'the sidebar lists the sections in the order the bridge sends',
    );
    // The barriers of the pages' routes must not hide the sidebar and the
    // toolbar from VoiceOver.
    expect(find.bySemanticsLabel('Caches, 10 MB'), findsOneWidget);
    expect(find.bySemanticsLabel('Scan again'), findsOneWidget);
    expect(_findSidebarEntry(const HandledElsewhereDestination()), findsOneWidget);
    expect(_findSidebarEntry(const SettingsDestination()), findsOneWidget);
    expectEveryTappableNodeLabelled();

    await tapAndSettle(tester, _findSectionEntry(SectionKey.caches));

    expect(parts.navigation.destination, buildSectionDestination(SectionKey.caches));
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

  testWidgets('a section the scan holds nothing of gets no sidebar entry and no card', (
    WidgetTester tester,
  ) async {
    await _pumpShell(tester, bridge: _createSampleBridge());

    expect(_findSectionEntry(SectionKey.caches), findsOneWidget);
    expect(find.byKey(const SectionCardKey(SectionKey.caches)), findsOneWidget);
    expect(_findSectionEntry(SectionKey.trash), findsNothing);
    expect(find.byKey(const SectionCardKey(SectionKey.trash)), findsNothing);
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
    final FakeCleanerBridge bridge = _createSampleBridge();
    final Completer<ScanAnswer> heldScan = bridge.holdNextScan();
    await _pumpShell(tester, bridge: bridge);

    expect(isButtonEnabled(tester, findButtonLabelled('Scan again')), isFalse);

    heldScan.complete(sampleScan);
    await tester.pumpAndSettle();

    expect(isButtonEnabled(tester, findButtonLabelled('Scan again')), isTrue);

    await tapAndSettle(tester, find.text('Scan again'));

    expect(bridge.requestKinds, ['status', 'scan', 'scan']);
    expect(find.text('26 MB can be freed'), findsOneWidget);
  });

  testWidgets('one selection holds items of two sections, and Review plans them together', (
    WidgetTester tester,
  ) async {
    final FakeCleanerBridge bridge = _createSampleBridge();
    await _pumpShell(tester, bridge: bridge);
    await tapAndSettle(tester, _findSectionEntry(SectionKey.caches));
    await tapAndSettle(tester, find.byKey(const ItemRowKey(1)));

    await _tickRemovedAppData(tester);

    expect(readRowMark(tester, 4), isTrue);
    expect(find.text('2 items selected'), findsOneWidget);

    await tapAndSettle(tester, find.bySemanticsLabel('Review the 2 items selected'));

    expect(bridge.plannedNumbers, [1, 4]);
    expect(find.byType(ReviewPage), findsOneWidget);
  });

  testWidgets('Review lies over the pages, and leaves the section as it was', (
    WidgetTester tester,
  ) async {
    final FakeCleanerBridge bridge = _createSampleBridge();
    final _ShellParts parts = await _pumpShell(tester, bridge: bridge);
    await tapAndSettle(tester, _findSectionEntry(SectionKey.caches));
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

    expect(parts.navigation.destination, buildSectionDestination(SectionKey.caches));

    parts.controller.cancelConfirmation();
    await tester.pumpAndSettle();

    expect(find.byType(ReviewPage), findsNothing);
    expect(find.byType(SectionPage), findsOneWidget);
    expect(find.text('App cache'), findsOneWidget);
    expect(readRowMark(tester, 2), isTrue);
  });

  testWidgets('shows why the bridge refused a selection over the page that asked', (
    WidgetTester tester,
  ) async {
    final FakeCleanerBridge bridge = _createSampleBridge()
      ..planAnswer = loadSampleEvent<NothingApprovedEvent>();
    await _pumpShell(tester, bridge: bridge);
    await tapAndSettle(tester, _findSectionEntry(SectionKey.caches));
    await tapAndSettle(tester, find.bySemanticsLabel('Show Review first'));
    await tapAndSettle(tester, find.byKey(const ItemRowKey(2)));

    await tapAndSettle(tester, find.bySemanticsLabel('Review the 1 item selected'));

    expect(find.textContaining('Nothing of the selection can be deleted.'), findsOneWidget);
    expect(find.byType(SectionPage), findsOneWidget);
    expect(find.text('App cache'), findsOneWidget);
    expect(readRowMark(tester, 2), isTrue);
  });

  testWidgets('shows a deletion that stopped before its answer over the page', (
    WidgetTester tester,
  ) async {
    final FakeCleanerBridge bridge = _createSampleBridge()
      ..deleteError = const FormatException('The bridge stopped.');
    final _ShellParts parts = await _pumpShell(tester, bridge: bridge);
    await tapAndSettle(tester, find.text('Clean safe items · 6.0 MB'));

    await tapAndSettle(tester, findButtonLabelled('Delete'));

    expect(parts.controller.state, isA<IdleState>());
    final Finder notice = _findShellNotice('The deletion stopped before its answer');
    expect(notice, findsOneWidget);
    expect(_findShellNotice('The bridge stopped.'), findsOneWidget);
    expect(find.byType(Dialog), findsNothing);
    expect(find.byType(OverviewPage), findsOneWidget);
    expect(_isAbovePage(tester, notice, find.byType(OverviewPage)), isTrue);
  });

  testWidgets('shows a failure that dropped the scan over the page that asked', (
    WidgetTester tester,
  ) async {
    const String droppedText = 'The scan is older than an hour; scan again.';
    final FakeCleanerBridge bridge = _createSampleBridge()
      ..deleteAnswer = const FailedEvent(
        message: droppedText,
        effect: FailureEffect.scanDropped,
      );
    final _ShellParts parts = await _pumpShell(tester, bridge: bridge);
    await tapAndSettle(tester, _findSectionEntry(SectionKey.caches));
    await tapAndSettle(tester, find.byKey(const ItemRowKey(1)));
    await tapAndSettle(tester, find.bySemanticsLabel('Review the 1 item selected'));
    await tapAndSettle(tester, findButtonLabelled('Delete 15 MB'));

    await tapAndSettle(tester, findButtonLabelled('Delete'));

    expect((parts.controller.state as IdleState).notice, droppedText);
    final Finder notice = _findShellNotice(droppedText);
    expect(notice, findsOneWidget);
    expect(find.byType(ReviewPage), findsNothing);
    expect(find.byType(SectionPage), findsOneWidget);
    expect(_isAbovePage(tester, notice, find.byType(SectionPage)), isTrue);
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

  testWidgets('Cancel on the alert of Clean safe items shows the Overview with the safe items selected', (
    WidgetTester tester,
  ) async {
    final FakeCleanerBridge bridge = _createSampleBridge();
    await _pumpShell(tester, bridge: bridge);
    await tapAndSettle(tester, find.text('Clean safe items · 6.0 MB'));

    await tapAndSettle(tester, findButtonLabelled('Cancel'));

    expect(find.byType(Dialog), findsNothing);
    expect(find.byType(ReviewPage), findsNothing);
    expect(find.byType(OverviewPage), findsOneWidget);
    expect(find.text('1 item selected'), findsOneWidget);
    expect(bridge.requestKinds, ['status', 'scan', 'plan']);
  });

  testWidgets('Clean safe items plans only the safe items, past a careful tick, and deletes them in one go', (
    WidgetTester tester,
  ) async {
    final FakeCleanerBridge bridge = _createSampleBridge();
    final _ShellParts parts = await _pumpShell(tester, bridge: bridge);
    await _tickRemovedAppData(tester);
    expect(readRowMark(tester, 4), isTrue);
    await tapAndSettle(tester, _findSidebarEntry(const OverviewDestination()));

    await tapAndSettle(tester, find.text('Clean safe items · 6.0 MB'));

    expect(bridge.plannedNumbers, sampleScan.safeNumbers);
    expect(find.byType(TextField), findsNothing);

    final Completer<DeleteAnswer> heldDelete = bridge.holdNextDelete();
    await tapAndSettle(tester, findButtonLabelled('Delete'));

    expect(bridge.deleteRequest?.confirmation, 'DELETE');
    expect(find.byType(Dialog), findsNothing);
    expect(find.byType(DeletingView), findsOneWidget);

    heldDelete.complete(loadSampleEvent<DeletedEvent>());
    await tester.pumpAndSettle();

    expect(find.byType(DeletingView), findsNothing);
    expect(find.byType(DeletedPage), findsOneWidget);
    expect(parts.controller.state, isA<DeletedState>());
  });

  testWidgets('Tab on Review never reaches a section card of the Overview below it', (
    WidgetTester tester,
  ) async {
    final _ShellParts parts = await _pumpShell(tester, bridge: _createSampleBridge());
    parts.controller.selectSafeCandidates();
    await parts.controller.requestPlan();
    await tester.pumpAndSettle();
    expect(find.byType(ReviewPage), findsOneWidget);
    expect(
      find.byType(SectionCard, skipOffstage: false),
      findsWidgets,
      reason: 'the Overview stays built below Review',
    );

    final List<Key?> focusedCardKeys = [];
    for (int i = 0; i < 40; i++) {
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.pump();
      final BuildContext? focused = FocusManager.instance.primaryFocus?.context;
      final SectionCard? card = focused?.findAncestorWidgetOfExactType<SectionCard>();
      if (card != null) {
        focusedCardKeys.add(card.key);
      }
    }

    expect(focusedCardKeys, isEmpty);
  });

  testWidgets('shows the run while it deletes, then its result', (
    WidgetTester tester,
  ) async {
    final FakeCleanerBridge bridge = _createSampleBridge();
    final _ShellParts parts = await _pumpShell(tester, bridge: bridge);
    parts.controller.selectSafeCandidates();
    await parts.controller.requestPlan();
    await tester.pumpAndSettle();
    final Completer<DeleteAnswer> heldDelete = bridge.holdNextDelete();

    unawaited(parts.controller.confirmDeletion('DELETE'));
    await tester.pumpAndSettle();

    expect(find.byType(DeletingView), findsOneWidget);
    expect(find.byType(OverviewPage), findsNothing);
    expect(isButtonEnabled(tester, findButtonLabelled('Scan again')), isFalse);

    heldDelete.complete(loadSampleEvent<DeletedEvent>());
    await tester.pumpAndSettle();

    expect(find.byType(DeletedPage), findsOneWidget);
    expect(find.byType(DeletingView), findsNothing);
    expectEveryTappableNodeLabelled();

    await tapAndSettle(tester, find.text('Done'));

    expect(find.byType(DeletedPage), findsNothing);
    expect(find.byType(OverviewPage), findsOneWidget);
    expect(parts.controller.state, isA<ScannedState>());
    expect(bridge.requestKinds, ['status', 'scan', 'plan', 'delete', 'scan']);
  });

  testWidgets('every page and every step of the delete flow fits the smallest window', (
    WidgetTester tester,
  ) async {
    final FakeCleanerBridge bridge = _createSampleBridge();
    await _pumpShell(tester, bridge: bridge, windowSize: minimumWindowSize);

    void expectNoLayoutError(String place) {
      expect(tester.takeException(), isNull, reason: 'on $place');
    }

    expectNoLayoutError('the Overview');
    for (final SectionTotal total in sampleScan.sectionTotals) {
      final SectionKey sectionKey = total.sectionKey;
      await _showAndTap(tester, _findSectionEntry(sectionKey));
      expect(find.byType(SectionPage), findsOneWidget);
      expectNoLayoutError('the page of ${sectionKey.name}');
    }
    await _showAndTap(tester, _findSidebarEntry(const HandledElsewhereDestination()));
    expect(find.byType(HandledElsewherePage), findsOneWidget);
    expectNoLayoutError('Handled by its own app');
    await _showAndTap(tester, _findSidebarEntry(const SettingsDestination()));
    expect(find.byType(SettingsPage), findsOneWidget);
    expectNoLayoutError('Settings');
    await _showAndTap(tester, _findSidebarEntry(const OverviewDestination()));

    await _showAndTap(tester, find.text('Clean safe items · 6.0 MB'));
    expect(find.byType(Dialog), findsOneWidget);
    expectNoLayoutError('the alert of Clean safe items');
    await _showAndTap(tester, findButtonLabelled('Show list'));
    expect(find.byType(ReviewPage), findsOneWidget);
    expectNoLayoutError('Review');
    await _showAndTap(tester, findButtonLabelled('Delete 15 MB'));
    expectNoLayoutError('the alert over Review');

    final Completer<DeleteAnswer> heldDelete = bridge.holdNextDelete();
    await _showAndTap(tester, findButtonLabelled('Delete'));
    expect(find.byType(DeletingView), findsOneWidget);
    expectNoLayoutError('Deleting');
    heldDelete.complete(loadSampleEvent<DeletedEvent>());
    await tester.pumpAndSettle();
    expect(find.byType(DeletedPage), findsOneWidget);
    expectNoLayoutError('the result');
  });

  testWidgets('shows a section of a key this app does not know by the bridge title', (
    WidgetTester tester,
  ) async {
    await _pumpShell(
      tester,
      bridge: _createSampleBridge(scan: _buildScanWithUnknownSections()),
    );

    expect(find.bySemanticsLabel('Future things, 8.0 MB'), findsOneWidget);
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

  testWidgets('Handled by its own app shows the places of System Settings, each opening its pane', (
    WidgetTester tester,
  ) async {
    final _ShellParts parts = await _pumpShell(tester, bridge: _createSampleBridge());
    await tapAndSettle(tester, _findSidebarEntry(const HandledElsewhereDestination()));

    expect(find.text('No app holds space here that only it can free.'), findsOneWidget);
    expect(find.text('IN SYSTEM SETTINGS'), findsOneWidget);
    expect(find.text('Everything on this Mac, by kind'), findsOneWidget);
    expect(find.text('Keep only recent files on this Mac'), findsOneWidget);
    expect(find.text('Time Machine snapshots'), findsOneWidget);
    expectEveryTappableNodeLabelled();

    final Finder openTimeMachine = find.text('Open Time Machine settings');
    await tester.ensureVisible(openTimeMachine);
    await tapAndSettle(tester, openTimeMachine);

    final OpenableUrl url = parts.urlOpener.requestedUrls.single;
    expect(url, isA<SettingsPaneUrl>());
    expect(url.text, SettingsPaneUrl.forPane(SettingsPane.timeMachine)!.text);
  });
}
