import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge.dart';
import 'package:magic_free_disk_space/cleaner/cleaner.dart';
import 'package:magic_free_disk_space/design/design.dart';
import 'package:magic_free_disk_space/scan_view/scan_view.dart';
import 'package:magic_free_disk_space/section/advice_card.dart';
import 'package:magic_free_disk_space/section/item_group_card.dart';
import 'package:magic_free_disk_space/section/section.dart';

import '../support/fake_cleaner_bridge.dart';
import '../support/fake_url_opener.dart';
import '../support/sample_events.dart';
import '../support/semantics_labels.dart';
import '../support/stage_controls.dart';
import '../support/stage_harness.dart';

/// The sample scan, with the evidence, command and advice lines a probe
/// gives added to the App cache (#2).
ScannedEvent _buildScanWithEveryLineKind() {
  final Map<String, Object?> json = loadSampleJson('scanned');
  final Map<String, Object?> appCache = listScanItemJsons(
    json,
  ).singleWhere((Map<String, Object?> item) => item['number'] == 2);
  appCache['detailLines'] = [
    ...appCache['detailLines']! as List<Object?>,
    {'kind': 'evidence', 'text': 'Not opened for 200 days.'},
    {'kind': 'command', 'text': 'tool cache clean'},
    {'kind': 'advice', 'text': 'Quit the app first.'},
  ];
  return parseScanJson(json);
}

Future<CleanerController> _pumpSectionPage(
  WidgetTester tester, {
  required SectionKey sectionKey,
  ScannedEvent? scan,
  FakeUrlOpener? urlOpener,
}) async {
  final CleanerController controller = startScanningCleaner(
    FakeCleanerBridge(scanAnswer: scan ?? loadSampleEvent<ScannedEvent>()),
  );
  await pumpOnStage(
    tester,
    SectionPage(
      sectionKey: sectionKey,
      controller: controller,
      urlOpener: urlOpener ?? FakeUrlOpener(isOpening: true),
    ),
  );
  return controller;
}

Set<int> _readSelectedNumbers(CleanerController controller) {
  return (controller.state as ScannedState).selectedNumbers;
}

void main() {
  testWidgets('shows the safe group open and the review group closed', (
    WidgetTester tester,
  ) async {
    await _pumpSectionPage(tester, sectionKey: SectionKey.caches);

    expect(find.text('Caches'), findsOneWidget);
    expect(find.byKey(const ItemGroupCardKey(ShownItemGroup.safe)), findsOneWidget);
    expect(find.byKey(const ItemGroupCardKey(ShownItemGroup.review)), findsOneWidget);
    expect(find.byKey(const ItemGroupCardKey(ShownItemGroup.careful)), findsNothing);
    expect(find.text('Safe to remove'), findsOneWidget);
    expect(find.text('Review first'), findsOneWidget);
    expect(find.text('Tool cache'), findsOneWidget);
    expect(find.text('App cache'), findsNothing);

    await tapAndSettle(tester, find.bySemanticsLabel('Show Review first'));

    expect(find.text('App cache'), findsOneWidget);
    expect(find.bySemanticsLabel('Hide Review first'), findsOneWidget);
    expectEveryTappableNodeLabelled();
  });

  testWidgets('shows the review and careful groups of Apps, both closed', (
    WidgetTester tester,
  ) async {
    await _pumpSectionPage(tester, sectionKey: SectionKey.apps);

    expect(find.byKey(const ItemGroupCardKey(ShownItemGroup.safe)), findsNothing);
    expect(find.text('Review first'), findsOneWidget);
    expect(find.text("Can't be undone"), findsOneWidget);
    expect(find.text('Xcode'), findsNothing);

    await tapAndSettle(tester, find.bySemanticsLabel("Show Can't be undone"));

    expect(
      find.text('Data of an app that is no longer installed (com.example.removed)'),
      findsOneWidget,
    );
    expect(find.text('Xcode'), findsNothing);
  });

  testWidgets('the group toggle selects every item of its group, then clears them', (
    WidgetTester tester,
  ) async {
    final CleanerController controller = await _pumpSectionPage(
      tester,
      sectionKey: SectionKey.caches,
    );

    await tapAndSettle(tester, find.bySemanticsLabel('Select all of Review first'));

    expect(_readSelectedNumbers(controller), {2});

    await tapAndSettle(tester, find.bySemanticsLabel('Select all of Review first'));

    expect(_readSelectedNumbers(controller), isEmpty);
  });

  testWidgets('an item the bridge never plans offers no tick, and the group toggle leaves it out', (
    WidgetTester tester,
  ) async {
    final CleanerController controller = await _pumpSectionPage(
      tester,
      sectionKey: SectionKey.caches,
      scan: loadScanWithNeverItemInCaches(),
    );
    await tapAndSettle(tester, find.bySemanticsLabel('Show Review first'));

    await tapAndSettle(tester, find.bySemanticsLabel('Select all of Review first'));

    expect(_readSelectedNumbers(controller), {2});
    expect(readRowMark(tester, 2), isTrue);
    expect(readRowMark(tester, 3), isFalse);

    await tester.tap(find.byKey(const ItemRowKey(3)), warnIfMissed: false);
    await tester.pumpAndSettle();

    expect(_readSelectedNumbers(controller), {2});
    expect(readRowCheckMark(tester, 3).enabled, isFalse);
    expectEveryTappableNodeLabelled();
  });

  testWidgets('the group toggle of items the bridge never plans is off', (
    WidgetTester tester,
  ) async {
    await _pumpSectionPage(tester, sectionKey: SectionKey.apps);

    final StageCheckbox toggle = tester.widget<StageCheckbox>(
      find.byWidgetPredicate(
        (Widget widget) => widget is StageCheckbox && widget.semanticsLabel == 'Select all of Review first',
      ),
    );
    expect(toggle.onPressed, isNull);
    expect(toggle.value, isFalse);
  });

  testWidgets('marks a leftover matched by its name in its row and its details', (
    WidgetTester tester,
  ) async {
    await _pumpSectionPage(tester, sectionKey: SectionKey.apps);
    await tapAndSettle(tester, find.bySemanticsLabel("Show Can't be undone"));

    final Finder byNameRow = find.byKey(const ItemRowKey(4));
    expect(
      find.descendant(of: byNameRow, matching: find.textContaining(RegExp(r' · Matched by name$'))),
      findsOneWidget,
    );
    expect(
      find.descendant(of: find.byKey(const ItemRowKey(5)), matching: find.textContaining('Matched by name')),
      findsNothing,
    );

    await tapAndSettle(
      tester,
      find.bySemanticsLabel('Details of Data of an app that is no longer installed (Example Removed)'),
    );

    expect(find.textContaining('Matched by its name, not by the app\'s bundle id.'), findsOneWidget);
  });

  testWidgets('a row ticks and unticks its item', (WidgetTester tester) async {
    final CleanerController controller = await _pumpSectionPage(
      tester,
      sectionKey: SectionKey.caches,
    );

    await tapAndSettle(tester, find.byKey(const ItemRowKey(1)));

    expect(_readSelectedNumbers(controller), {1});
    expect(readRowMark(tester, 1), isTrue);

    await tapAndSettle(tester, find.byKey(const ItemRowKey(1)));

    expect(_readSelectedNumbers(controller), isEmpty);
    expect(readRowMark(tester, 1), isFalse);
  });

  testWidgets('select safe ticks only the safe item', (WidgetTester tester) async {
    final CleanerController controller = await _pumpSectionPage(
      tester,
      sectionKey: SectionKey.caches,
    );
    await tapAndSettle(tester, find.bySemanticsLabel('Show Review first'));

    controller.selectSafeCandidates();
    await tester.pumpAndSettle();

    expect(readRowMark(tester, 1), isTrue);
    expect(readRowMark(tester, 2), isFalse);
  });

  testWidgets('the details panel shows every line kind and reveals the item in Finder', (
    WidgetTester tester,
  ) async {
    final FakeUrlOpener urlOpener = FakeUrlOpener(isOpening: true);
    await _pumpSectionPage(
      tester,
      sectionKey: SectionKey.caches,
      scan: _buildScanWithEveryLineKind(),
      urlOpener: urlOpener,
    );
    await tapAndSettle(tester, find.bySemanticsLabel('Show Review first'));

    await tapAndSettle(tester, find.bySemanticsLabel('Details of App cache'));

    expect(find.text('Files an app keeps to work faster.'), findsOneWidget);
    expect(
      find.text('The app builds them again, which can take a while.'),
      findsOneWidget,
    );
    expect(find.text('Not opened for 200 days.'), findsOneWidget);
    expect(find.text('tool cache clean'), findsOneWidget);
    expect(find.text('Quit the app first.'), findsOneWidget);
    expectEveryTappableNodeLabelled();

    await tapAndSettle(tester, find.text('Reveal in Finder'));

    expect(urlOpener.requestedUrls, [
      isA<RevealUrl>().having(
        (RevealUrl url) => url.text,
        'text',
        '/Users/me/Library/Caches/com.example.other',
      ),
    ]);
    expect(find.text('Finder did not open.'), findsNothing);
  });

  testWidgets('says when Finder did not open', (WidgetTester tester) async {
    await _pumpSectionPage(
      tester,
      sectionKey: SectionKey.caches,
      urlOpener: FakeUrlOpener(isOpening: false),
    );
    await tapAndSettle(tester, find.bySemanticsLabel('Details of Tool cache'));

    expect(find.text('Files the tool keeps to work faster.'), findsOneWidget);
    expect(find.text('The tool downloads them again when it needs them.'), findsOneWidget);
    expect(find.text('~/Library/Caches/ToolCache'), findsOneWidget);

    await tapAndSettle(tester, find.text('Reveal in Finder'));

    expect(find.text('Finder did not open.'), findsOneWidget);
  });

  testWidgets('shows advice as a card without a checkbox that reveals its place', (
    WidgetTester tester,
  ) async {
    final FakeUrlOpener urlOpener = FakeUrlOpener(isOpening: true);
    await _pumpSectionPage(
      tester,
      sectionKey: SectionKey.developerTools,
      urlOpener: urlOpener,
    );

    final Finder adviceCard = find.byKey(
      const AdviceCardKey('catalog:tool-store:/Users/me/Library/ToolStore'),
    );
    expect(find.text('TO HANDLE YOURSELF'), findsOneWidget);
    expect(adviceCard, findsOneWidget);
    expect(find.descendant(of: adviceCard, matching: find.text('6.0 MB')), findsOneWidget);
    expect(
      find.descendant(of: adviceCard, matching: find.text('Run the tool prune command.')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: adviceCard, matching: find.byType(StageCheckMark)),
      findsNothing,
    );
    expect(find.text('Review first'), findsOneWidget);

    await tapAndSettle(
      tester,
      find.descendant(of: adviceCard, matching: find.text('Reveal in Finder')),
    );

    expect(urlOpener.requestedUrls.single.text, '/Users/me/Library/ToolStore');
    expectEveryTappableNodeLabelled();
  });

  testWidgets('shows the size of advice measured in part as a lower bound', (
    WidgetTester tester,
  ) async {
    final Map<String, Object?> json = loadSampleJson('scanned');
    listScanAdviceJsons(json).singleWhere((Map<String, Object?> advice) => advice['title'] == 'Tool store')['isComplete'] =
        false;
    await _pumpSectionPage(tester, sectionKey: SectionKey.developerTools, scan: parseScanJson(json));

    final Finder adviceCard = find.byKey(
      const AdviceCardKey('catalog:tool-store:/Users/me/Library/ToolStore'),
    );
    expect(find.descendant(of: adviceCard, matching: find.text('at least 6.0 MB')), findsOneWidget);
  });

  testWidgets('says that a section the scan left empty holds nothing', (
    WidgetTester tester,
  ) async {
    await _pumpSectionPage(tester, sectionKey: SectionKey.trash);

    expect(find.text('Nothing found here yet'), findsOneWidget);
    expect(find.text('Nothing is left in this section.'), findsOneWidget);
  });

  testWidgets('heads a section with the title and the figure the bridge gives', (
    WidgetTester tester,
  ) async {
    final Map<String, Object?> json = loadSampleJson('scanned');
    listSectionTotalJsons(json).singleWhere((Map<String, Object?> total) => total['sectionKey'] == 'caches')['titleText'] =
        'Caches of apps and tools';
    await _pumpSectionPage(tester, sectionKey: SectionKey.caches, scan: parseScanJson(json));

    expect(find.text('Caches of apps and tools'), findsOneWidget);
    expect(find.text('at least 10 MB · 2 items'), findsOneWidget);
  });
}
