import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_event.dart';
import 'package:magic_free_disk_space/cleaner/cleaner_controller.dart';
import 'package:magic_free_disk_space/cleaner/cleaner_page.dart';
import 'package:magic_free_disk_space/cleaner/item_tile.dart';
import 'package:magic_free_disk_space/link/url_opener.dart';

import 'support/fake_cleaner_bridge.dart';
import 'support/fake_url_opener.dart';
import 'support/sample_events.dart';

/// The numbers of the item tiles built, top to bottom; a collapsed tile
/// builds none of its items.
List<int> getBuiltItemNumbers(WidgetTester tester) {
  return [
    for (final ItemTile tile in tester.widgetList<ItemTile>(
      find.byType(ItemTile),
    ))
      tile.item.number,
  ];
}

bool isItemTicked(WidgetTester tester, int number) {
  final Finder checkbox = find.descendant(
    of: find.byWidgetPredicate(
      (Widget widget) => widget is ItemTile && widget.item.number == number,
    ),
    matching: find.byType(Checkbox),
  );
  return tester.widget<Checkbox>(checkbox).value ?? false;
}

double getTopOfText(WidgetTester tester, String text) {
  return tester.getTopLeft(find.text(text)).dy;
}

void main() {
  final List<BridgeEvent> sampleEvents = loadSampleEvents();
  final ScannedEvent sampleScan = sampleEvents.whereType<ScannedEvent>().single;
  final StatusEvent sampleStatus = sampleEvents.whereType<StatusEvent>().single;
  final NothingApprovedEvent sampleNothingApproved = sampleEvents
      .whereType<NothingApprovedEvent>()
      .single;
  final NoticeView bannerNotice = sampleStatus.notices.single;
  final LinkView bannerLink = bannerNotice.settingsLink!;
  final SectionView cachesSection = sampleScan.sections.first;
  final String checkGroupTitleText = cachesSection.checkGroup!.titleText;
  final ExploreView explore = sampleScan.explore!;

  late FakeCleanerBridge bridge;

  setUp(() {
    bridge = FakeCleanerBridge(scanAnswer: sampleScan)
      ..planAnswer = sampleNothingApproved
      ..answerStatus = (() async => sampleStatus);
  });

  /// Pumps the page over [bridge] on a view tall enough to build the whole
  /// scan, and lets the status arrive.
  Future<CleanerController> pumpCleanerPage(
    WidgetTester tester,
    UrlOpener urlOpener,
  ) async {
    tester.view.physicalSize = const Size(1200, 4000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final CleanerController controller = CleanerController(bridge: bridge);
    await tester.pumpWidget(
      MaterialApp(
        home: CleanerPage(controller: controller, urlOpener: urlOpener),
      ),
    );
    await tester.pumpAndSettle();
    return controller;
  }

  Future<void> tapAndSettle(WidgetTester tester, Finder finder) async {
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  Future<void> scanOnPage(WidgetTester tester) async {
    await tapAndSettle(tester, find.widgetWithText(FilledButton, 'Scan'));
  }

  testWidgets(
    'shows the banner over the idle state, and its button opens the link of its notice',
    (WidgetTester tester) async {
      final FakeUrlOpener urlOpener = FakeUrlOpener(isOpening: true);
      await pumpCleanerPage(tester, urlOpener);

      expect(find.text(bannerNotice.titleText), findsOneWidget);
      expect(find.text(bannerNotice.lines.join('\n')), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Scan'), findsOneWidget);

      await tapAndSettle(
        tester,
        find.widgetWithText(OutlinedButton, bannerLink.labelText),
      );

      expect(urlOpener.requestedUrls, [bannerLink.url]);
      expect(find.text(bannerLink.failedText), findsNothing);
    },
  );

  testWidgets(
    'shows the failed text of the link when System Settings did not open',
    (WidgetTester tester) async {
      final FakeUrlOpener urlOpener = FakeUrlOpener(isOpening: false);
      await pumpCleanerPage(tester, urlOpener);

      await tapAndSettle(
        tester,
        find.widgetWithText(OutlinedButton, bannerLink.labelText),
      );

      expect(urlOpener.requestedUrls, [bannerLink.url]);
      expect(find.text(bannerLink.failedText), findsOneWidget);
    },
  );

  testWidgets('a granted status shows no banner', (WidgetTester tester) async {
    bridge.answerStatus = () async => grantedStatus;

    await pumpCleanerPage(tester, FakeUrlOpener(isOpening: true));

    expect(find.text(bannerNotice.titleText), findsNothing);
    expect(find.widgetWithText(FilledButton, 'Scan'), findsOneWidget);
  });

  testWidgets(
    'shows the sections with their safe items open and each check group collapsed, then Explore, skipped, and the notices collapsed',
    (WidgetTester tester) async {
      await pumpCleanerPage(tester, FakeUrlOpener(isOpening: true));

      await scanOnPage(tester);

      expect(find.text(bannerNotice.titleText), findsOneWidget);
      expect(find.text(sampleScan.summary.titleText), findsOneWidget);
      for (final SectionView section in sampleScan.sections) {
        expect(find.text(section.titleText), findsOneWidget);
      }
      expect(getBuiltItemNumbers(tester), [1]);
      expect(find.text(checkGroupTitleText), findsOneWidget);
      expect(find.text(explore.introText), findsNothing);
      expect(find.text(sampleScan.skipped!.lines.join('\n')), findsNothing);

      final double exploreTop = getTopOfText(tester, explore.titleText);
      for (final SectionView section in sampleScan.sections) {
        expect(getTopOfText(tester, section.titleText), lessThan(exploreTop));
      }
      final double skippedTop = getTopOfText(
        tester,
        sampleScan.skipped!.titleText,
      );
      expect(skippedTop, greaterThan(exploreTop));
      for (final NoticeView notice in sampleScan.notices) {
        expect(getTopOfText(tester, notice.titleText), greaterThan(skippedTop));
        expect(find.text(notice.lines.join('\n')), findsNothing);
      }

      await tapAndSettle(tester, find.text(checkGroupTitleText));

      expect(getBuiltItemNumbers(tester), [1, 2]);
    },
  );

  testWidgets(
    'opens Explore with its selectable items and its advice, which has no checkbox',
    (WidgetTester tester) async {
      await pumpCleanerPage(tester, FakeUrlOpener(isOpening: true));
      await scanOnPage(tester);

      await tapAndSettle(tester, find.text(explore.titleText));

      expect(find.text(explore.introText), findsOneWidget);
      expect(getBuiltItemNumbers(tester), [1, 5]);
      expect(find.byType(AdviceTile), findsNothing);

      await tapAndSettle(tester, find.text(explore.adviceGroup!.titleText));

      expect(find.byType(AdviceTile), findsOneWidget);
      expect(
        find.text(explore.adviceGroup!.items.single.title),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: find.byType(AdviceTile),
          matching: find.byType(Checkbox),
        ),
        findsNothing,
      );
    },
  );

  testWidgets('select safe ticks the safe numbers and no other item', (
    WidgetTester tester,
  ) async {
    final CleanerController controller = await pumpCleanerPage(
      tester,
      FakeUrlOpener(isOpening: true),
    );
    await scanOnPage(tester);
    await tapAndSettle(tester, find.text(checkGroupTitleText));
    await tapAndSettle(tester, find.text(explore.titleText));

    await tapAndSettle(
      tester,
      find.widgetWithText(OutlinedButton, 'Select safe'),
    );

    expect(
      (controller.state as ScannedState).selectedNumbers,
      sampleScan.safeNumbers.toSet(),
    );
    expect(getBuiltItemNumbers(tester), [1, 2, 5]);
    expect(isItemTicked(tester, 1), isTrue);
    expect(isItemTicked(tester, 2), isFalse);
    expect(isItemTicked(tester, 5), isFalse);
    expect(
      find.text('${sampleScan.safeNumbers.length} selected'),
      findsOneWidget,
    );
  });

  testWidgets(
    'shows the notices of the scan with the settings button where one has a link',
    (WidgetTester tester) async {
      bridge.answerStatus = () async => grantedStatus;
      final FakeUrlOpener urlOpener = FakeUrlOpener(isOpening: true);
      await pumpCleanerPage(tester, urlOpener);
      await scanOnPage(tester);
      final NoticeView linkedNotice = sampleScan.notices.first;
      final NoticeView plainNotice = sampleScan.notices.last;
      final LinkView link = linkedNotice.settingsLink!;

      expect(find.widgetWithText(OutlinedButton, link.labelText), findsNothing);

      await tapAndSettle(tester, find.text(linkedNotice.titleText));
      await tapAndSettle(tester, find.text(plainNotice.titleText));

      expect(find.text(linkedNotice.lines.join('\n')), findsOneWidget);
      expect(find.text(plainNotice.lines.join('\n')), findsOneWidget);
      expect(
        find.widgetWithText(OutlinedButton, link.labelText),
        findsOneWidget,
      );

      await tapAndSettle(
        tester,
        find.widgetWithText(OutlinedButton, link.labelText),
      );

      expect(urlOpener.requestedUrls, [link.url]);
    },
  );

  testWidgets(
    'an opened check group stays open when a notice comes above the list',
    (WidgetTester tester) async {
      await pumpCleanerPage(tester, FakeUrlOpener(isOpening: true));
      await scanOnPage(tester);
      await tapAndSettle(tester, find.text(checkGroupTitleText));
      await tapAndSettle(tester, find.text('2. App cache'));

      await tapAndSettle(tester, find.widgetWithText(FilledButton, 'Delete…'));

      expect(
        find.textContaining(sampleNothingApproved.lines.first),
        findsOneWidget,
      );
      expect(getBuiltItemNumbers(tester), [1, 2]);
      expect(isItemTicked(tester, 2), isTrue);
    },
  );

  testWidgets(
    'an opened check group stays open through the confirmation and its cancel',
    (WidgetTester tester) async {
      bridge.planAnswer = sampleEvents.whereType<PlannedEvent>().single;
      await pumpCleanerPage(tester, FakeUrlOpener(isOpening: true));
      await scanOnPage(tester);
      await tapAndSettle(tester, find.text(checkGroupTitleText));
      await tapAndSettle(tester, find.text('2. App cache'));
      await tapAndSettle(tester, find.widgetWithText(FilledButton, 'Delete…'));

      expect(find.text(checkGroupTitleText), findsNothing);

      await tapAndSettle(tester, find.widgetWithText(TextButton, 'Cancel'));

      expect(getBuiltItemNumbers(tester), [1, 2]);
      expect(isItemTicked(tester, 2), isTrue);
    },
  );
}
