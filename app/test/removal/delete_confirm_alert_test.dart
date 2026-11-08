import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge.dart';
import 'package:magic_free_disk_space/cleaner/cleaner.dart';
import 'package:magic_free_disk_space/removal/delete_confirm_alert.dart';
import 'package:magic_free_disk_space/removal/review_page.dart';

import '../support/fake_cleaner_bridge.dart';
import '../support/fake_url_opener.dart';
import '../support/sample_events.dart';
import '../support/semantics_labels.dart';
import '../support/stage_controls.dart';
import '../support/test_items.dart';
import 'support/removal_harness.dart';

void main() {
  late FakeCleanerBridge bridge;

  setUp(() {
    bridge = FakeCleanerBridge(scanAnswer: loadSampleEvent<ScannedEvent>())
      ..deleteAnswer = sampleDeleted;
  });

  /// Pumps the flow over a plan of [plan] and opens the alert over its
  /// Review page, as [origin] opens it.
  Future<CleanerController> openAlert(
    WidgetTester tester, {
    required PlannedEvent plan,
    required DeleteAlertOrigin origin,
  }) async {
    final CleanerController controller = await createConfirmingController(
      bridge,
      plan: plan,
    );
    await pumpRemovalFlow(
      tester,
      controller: controller,
      urlOpener: FakeUrlOpener(isOpening: true),
    );
    showDeleteConfirmAlert(
      context: tester.element(find.byType(ReviewPage)),
      controller: controller,
      state: controller.state as ConfirmingState,
      origin: origin,
    );
    await tester.pumpAndSettle();
    return controller;
  }

  testWidgets(
    'a plan without a careful item asks for no typed word, and Delete sends its plan id with DELETE',
    (WidgetTester tester) async {
      final CleanerController controller = await openAlert(
        tester,
        plan: samplePlan,
        origin: DeleteAlertOrigin.cleanSafeItems,
      );

      expect(find.text('Delete at least 10 MB for good?'), findsOneWidget);
      expect(
        find.descendant(of: find.byType(Dialog), matching: find.text('Tool cache')),
        findsOneWidget,
      );
      expect(find.byType(TextField), findsNothing);
      expect(findButtonLabelled('Show list'), findsOneWidget);
      expect(findButtonLabelled('Cancel'), findsOneWidget);
      expectEveryTappableNodeLabelled();

      await tapAndSettle(tester, findButtonLabelled('Delete'));

      expect(bridge.deleteRequest, (planId: 1, confirmation: 'DELETE'));
      expect(controller.state, isA<DeletedState>());
    },
  );

  testWidgets(
    'a plan with a careful item keeps Delete disabled until DELETE is typed, and refuses lower case',
    (WidgetTester tester) async {
      await openAlert(tester, plan: carefulPlan, origin: DeleteAlertOrigin.review);

      expect(find.textContaining("Can't be undone or downloaded again: App cache"), findsOneWidget);
      expect(find.byType(TextField), findsOneWidget);
      expect(isButtonEnabled(tester, findButtonLabelled('Delete')), isFalse);
      expectEveryTappableNodeLabelled();

      await tester.enterText(find.byType(TextField), 'delete');
      await tester.pump();
      expect(isButtonEnabled(tester, findButtonLabelled('Delete')), isFalse);
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      expect(bridge.deleteRequest, isNull);

      await tester.enterText(find.byType(TextField), 'DELETE');
      await tester.pump();
      expect(isButtonEnabled(tester, findButtonLabelled('Delete')), isTrue);

      await tapAndSettle(tester, findButtonLabelled('Delete'));

      expect(bridge.deleteRequest, (planId: 2, confirmation: 'DELETE'));
    },
  );

  testWidgets('Cancel after Clean safe items sends nothing, keeps the selection and leaves the flow', (
    WidgetTester tester,
  ) async {
    final CleanerController controller = await openAlert(
      tester,
      plan: samplePlan,
      origin: DeleteAlertOrigin.cleanSafeItems,
    );

    await tapAndSettle(tester, findButtonLabelled('Cancel'));

    expect(bridge.deleteRequest, isNull);
    expect(find.byType(Dialog), findsNothing);
    final ScannedState state = controller.state as ScannedState;
    expect(state.selectedNumbers, getPlannedItemNumbers(samplePlan).toSet());
    expect(find.byType(ReviewPage), findsNothing);
  });

  testWidgets('Escape cancels as Cancel does', (WidgetTester tester) async {
    final CleanerController controller = await openAlert(
      tester,
      plan: samplePlan,
      origin: DeleteAlertOrigin.cleanSafeItems,
    );

    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pumpAndSettle();

    expect(bridge.deleteRequest, isNull);
    expect(
      (controller.state as ScannedState).selectedNumbers,
      getPlannedItemNumbers(samplePlan).toSet(),
    );
  });

  testWidgets('Show list closes the alert and leaves the plan on its Review page', (
    WidgetTester tester,
  ) async {
    final CleanerController controller = await openAlert(
      tester,
      plan: samplePlan,
      origin: DeleteAlertOrigin.cleanSafeItems,
    );
    final CleanerState before = controller.state;

    await tapAndSettle(tester, findButtonLabelled('Show list'));

    expect(find.byType(Dialog), findsNothing);
    expect(controller.state, same(before));
    expect(find.byType(ReviewPage), findsOneWidget);
    expect(bridge.deleteRequest, isNull);
  });

  testWidgets('names no evicted item among those that cannot come back, nor counts it as gone', (
    WidgetTester tester,
  ) async {
    await openAlert(tester, plan: samplePlan, origin: DeleteAlertOrigin.review);

    final Finder alert = find.byType(Dialog);
    expect(
      find.descendant(of: alert, matching: find.text('Delete at least 10 MB for good?')),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: alert,
        matching: find.text('These skip the Trash, so they cannot come back:'),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: alert,
        matching: find.text('5.0 MB stays in iCloud and downloads again when opened.'),
      ),
      findsOneWidget,
    );
    final List<PlannedItemView> evicted = evictOnlyPlan.items;
    expect(evicted, isNotEmpty);
    for (final PlannedItemView item in samplePlan.items) {
      expect(
        find.descendant(of: alert, matching: find.text(item.title)),
        evicted.contains(item) ? findsNothing : findsOneWidget,
        reason: item.title,
      );
    }
  });

  testWidgets('a plan that only evicts asks to remove its bytes from this Mac, never for good', (
    WidgetTester tester,
  ) async {
    await openAlert(tester, plan: evictOnlyPlan, origin: DeleteAlertOrigin.review);

    final Finder alert = find.byType(Dialog);
    expect(
      find.descendant(of: alert, matching: find.text('Remove 5.0 MB from this Mac?')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: alert, matching: find.textContaining('cannot come back')),
      findsNothing,
    );
    expect(
      find.descendant(
        of: alert,
        matching: find.text('5.0 MB stays in iCloud and downloads again when opened.'),
      ),
      findsOneWidget,
    );
  });
}
