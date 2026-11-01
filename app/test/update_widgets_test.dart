import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_event.dart';
import 'package:magic_free_disk_space/update/update_banner.dart';
import 'package:magic_free_disk_space/update/update_check_menu.dart';
import 'package:magic_free_disk_space/update/update_controller.dart';

import 'support/fake_update_bridge.dart';
import 'support/fake_url_opener.dart';
import 'support/sample_events.dart';

void main() {
  final UpdateCheckedEvent sampleCheck = loadSampleEvents()
      .whereType<UpdateCheckedEvent>()
      .single;
  final UpdateNoticeView notice = sampleCheck.notice!;
  final LinkView downloadLink = notice.downloadLink;

  late FakeUpdateBridge bridge;

  setUp(() {
    bridge = FakeUpdateBridge(answerCheck: () async => sampleCheck);
  });

  /// Pumps an app bar with the menu over the banner, and lets the check
  /// arrive.
  Future<UpdateController> pumpUpdateWidgets(
    WidgetTester tester,
    FakeUrlOpener urlOpener,
  ) async {
    final UpdateController controller = UpdateController(bridge: bridge);
    addTearDown(controller.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          appBar: AppBar(actions: [UpdateCheckMenu(controller: controller)]),
          body: UpdateBanner(controller: controller, urlOpener: urlOpener),
        ),
      ),
    );
    await tester.pumpAndSettle();
    return controller;
  }

  Future<void> tapAndSettle(WidgetTester tester, Finder finder) async {
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  CheckedPopupMenuItem<bool> findMenuItem(WidgetTester tester) {
    return tester.widget<CheckedPopupMenuItem<bool>>(
      find.byType(CheckedPopupMenuItem<bool>),
    );
  }

  Future<void> openMenu(WidgetTester tester) async {
    await tapAndSettle(tester, find.byTooltip('Settings'));
  }

  group('the banner', () {
    testWidgets('shows the notice, and its button opens the release page', (
      WidgetTester tester,
    ) async {
      final FakeUrlOpener urlOpener = FakeUrlOpener(isOpening: true);
      await pumpUpdateWidgets(tester, urlOpener);

      expect(find.text(notice.titleText), findsOneWidget);
      expect(find.text(notice.lines.join('\n')), findsOneWidget);

      await tapAndSettle(
        tester,
        find.widgetWithText(OutlinedButton, downloadLink.labelText),
      );

      expect(urlOpener.requestedUrls, [downloadLink.url]);
      expect(find.text(downloadLink.failedText), findsNothing);
    });

    testWidgets('shows the failed text when the page did not open', (
      WidgetTester tester,
    ) async {
      final FakeUrlOpener urlOpener = FakeUrlOpener(isOpening: false);
      await pumpUpdateWidgets(tester, urlOpener);

      await tapAndSettle(
        tester,
        find.widgetWithText(OutlinedButton, downloadLink.labelText),
      );

      expect(find.text(downloadLink.failedText), findsOneWidget);
    });

    testWidgets('shows nothing without a notice', (WidgetTester tester) async {
      bridge.answerCheck = () async =>
          const UpdateCheckedEvent(isUpdateCheckEnabled: true, notice: null);

      await pumpUpdateWidgets(tester, FakeUrlOpener(isOpening: true));

      expect(find.text(notice.titleText), findsNothing);
      expect(find.byType(OutlinedButton), findsNothing);
    });
  });

  group('the menu', () {
    testWidgets('shows the stored switch checked, and a tap saves it off', (
      WidgetTester tester,
    ) async {
      final UpdateController controller = await pumpUpdateWidgets(
        tester,
        FakeUrlOpener(isOpening: true),
      );
      await openMenu(tester);

      expect(findMenuItem(tester).checked, isTrue);
      expect(findMenuItem(tester).enabled, isTrue);

      await tapAndSettle(tester, find.text(updateCheckItemText));

      expect(bridge.savedValues, [false]);
      expect(
        controller.updateCheckSwitch,
        isA<UpdateCheckSwitchConfirmed>().having(
          (confirmed) => confirmed.isEnabled,
          'isEnabled',
          isFalse,
        ),
      );
      await openMenu(tester);
      expect(findMenuItem(tester).checked, isFalse);
    });

    testWidgets('disables the item while the save runs', (
      WidgetTester tester,
    ) async {
      final Completer<UpdateCheckSetAnswer> pendingSave =
          Completer<UpdateCheckSetAnswer>();
      bridge.answerSet = (bool _) => pendingSave.future;
      await pumpUpdateWidgets(tester, FakeUrlOpener(isOpening: true));
      await openMenu(tester);
      await tapAndSettle(tester, find.text(updateCheckItemText));

      await openMenu(tester);

      expect(findMenuItem(tester).enabled, isFalse);
      expect(findMenuItem(tester).checked, isFalse);

      pendingSave.complete(
        const UpdateCheckSetEvent(isUpdateCheckEnabled: false),
      );
    });

    testWidgets('disables the item for a bridge older than the update check', (
      WidgetTester tester,
    ) async {
      bridge.answerCheck = () async => const FailedEvent(
        message: 'The bridge does not know the request.',
        effect: FailureEffect.scanKept,
      );
      await pumpUpdateWidgets(tester, FakeUrlOpener(isOpening: true));

      await openMenu(tester);

      expect(findMenuItem(tester).enabled, isFalse);
    });

    testWidgets('shows why a change was not saved', (
      WidgetTester tester,
    ) async {
      bridge.answerSet = (bool _) async => const FailedEvent(
        message: 'The preference could not be saved.',
        effect: FailureEffect.scanKept,
      );
      await pumpUpdateWidgets(tester, FakeUrlOpener(isOpening: true));
      await openMenu(tester);

      await tapAndSettle(tester, find.text(updateCheckItemText));

      expect(find.text('The preference could not be saved.'), findsOneWidget);
      await openMenu(tester);
      expect(findMenuItem(tester).checked, isTrue);
    });
  });
}
