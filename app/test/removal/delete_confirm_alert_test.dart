import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_event.dart';
import 'package:magic_free_disk_space/cleaner/cleaner_controller.dart';
import 'package:magic_free_disk_space/removal/delete_confirm_alert.dart';
import 'package:magic_free_disk_space/removal/review_page.dart';

import '../support/fake_cleaner_bridge.dart';
import '../support/fake_url_opener.dart';
import '../support/semantics_labels.dart';
import 'removal_harness.dart';

void main() {
  late FakeCleanerBridge bridge;

  setUp(() {
    bridge = FakeCleanerBridge(scanAnswer: sampleScan)
      ..deleteAnswer = sampleDeleted;
  });

  /// Pumps the flow over a plan of [plan] and opens the alert over its
  /// Review page, as the Overview's one click does when [canShowList].
  Future<CleanerController> openAlert(
    WidgetTester tester, {
    required PlannedEvent plan,
    required bool canShowList,
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
    await tester.pumpAndSettle();
    showDeleteConfirmAlert(
      context: tester.element(find.byType(ReviewPage)),
      controller: controller,
      state: controller.state as ConfirmingState,
      canShowList: canShowList,
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
        canShowList: true,
      );

      expect(find.text('Delete 10 MB for good?'), findsOneWidget);
      expect(find.text('Tool cache'), findsWidgets);
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
      await openAlert(tester, plan: carefulPlan, canShowList: false);

      expect(find.textContaining("Can't be undone or downloaded again: App cache"), findsOneWidget);
      expect(find.byType(TextField), findsOneWidget);
      expect(isButtonEnabled(tester, 'Delete'), isFalse);
      expectEveryTappableNodeLabelled();

      await tester.enterText(find.byType(TextField), 'delete');
      await tester.pump();
      expect(isButtonEnabled(tester, 'Delete'), isFalse);
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      expect(bridge.deleteRequest, isNull);

      await tester.enterText(find.byType(TextField), 'DELETE');
      await tester.pump();
      expect(isButtonEnabled(tester, 'Delete'), isTrue);

      await tapAndSettle(tester, findButtonLabelled('Delete'));

      expect(bridge.deleteRequest, (planId: 2, confirmation: 'DELETE'));
    },
  );

  testWidgets('Cancel sends nothing and keeps the selection', (WidgetTester tester) async {
    final CleanerController controller = await openAlert(
      tester,
      plan: samplePlan,
      canShowList: true,
    );

    await tapAndSettle(tester, findButtonLabelled('Cancel'));

    expect(bridge.deleteRequest, isNull);
    expect(find.byType(Dialog), findsNothing);
    final ScannedState state = controller.state as ScannedState;
    expect(state.selectedNumbers, {1, 2});
    expect(find.byKey(listKey), findsOneWidget);
  });

  testWidgets('Escape cancels as Cancel does', (WidgetTester tester) async {
    final CleanerController controller = await openAlert(
      tester,
      plan: samplePlan,
      canShowList: true,
    );

    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pumpAndSettle();

    expect(bridge.deleteRequest, isNull);
    expect((controller.state as ScannedState).selectedNumbers, {1, 2});
  });

  testWidgets('Show list closes the alert and leaves the plan on its Review page', (
    WidgetTester tester,
  ) async {
    final CleanerController controller = await openAlert(
      tester,
      plan: samplePlan,
      canShowList: true,
    );
    final CleanerState before = controller.state;

    await tapAndSettle(tester, findButtonLabelled('Show list'));

    expect(find.byType(Dialog), findsNothing);
    expect(controller.state, same(before));
    expect(find.byType(ReviewPage), findsOneWidget);
    expect(bridge.deleteRequest, isNull);
  });

  testWidgets('the alert over the Review page offers no Show list', (WidgetTester tester) async {
    await openAlert(tester, plan: samplePlan, canShowList: false);

    expect(findButtonLabelled('Show list'), findsNothing);
    expectEveryTappableNodeLabelled();
  });
}
