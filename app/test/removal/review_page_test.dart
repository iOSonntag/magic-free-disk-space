import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_event.dart';
import 'package:magic_free_disk_space/cleaner/cleaner_controller.dart';
import 'package:magic_free_disk_space/design/count_up.dart';
import 'package:magic_free_disk_space/design/motion.dart';
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

  Future<CleanerController> pumpReview(
    WidgetTester tester, {
    PlannedEvent? plan,
    MotionState motion = MotionState.reduced,
  }) async {
    final CleanerController controller = await createConfirmingController(
      bridge,
      plan: plan ?? samplePlan,
    );
    await pumpRemovalFlow(
      tester,
      controller: controller,
      urlOpener: FakeUrlOpener(isOpening: true),
      motion: motion,
    );
    // With motion on, the ambient glow never settles.
    if (motion.isReduced) {
      await tester.pumpAndSettle();
    } else {
      await tester.pump(const Duration(seconds: 2));
    }
    return controller;
  }

  testWidgets('lists each item under its section with the total, and labels every control', (
    WidgetTester tester,
  ) async {
    await pumpReview(tester);

    expect(find.text('Caches'), findsOneWidget);
    expect(find.text('10 MB'), findsWidgets);
    expect(find.bySemanticsLabel('Tool cache, 6.0 MB, Safe to remove'), findsOneWidget);
    expect(find.bySemanticsLabel('App cache, 4.0 MB, Review first'), findsOneWidget);
    expect(find.byTooltip('Keep Tool cache'), findsOneWidget);
    expect(find.byTooltip('Keep App cache'), findsOneWidget);
    expect(findButtonLabelled('Delete 10 MB'), findsOneWidget);
    expect(find.textContaining('type DELETE'), findsNothing);
    expectEveryTappableNodeLabelled();
  });

  testWidgets('a plan with a careful item says the next step asks for the typed word', (
    WidgetTester tester,
  ) async {
    await pumpReview(tester, plan: carefulPlan);

    expect(find.bySemanticsLabel("App cache, 4.0 MB, Can't be undone"), findsOneWidget);
    expect(find.textContaining('type DELETE'), findsOneWidget);
    expectEveryTappableNodeLabelled();
  });

  testWidgets('a row taken off plans the rest again and shows the new total', (
    WidgetTester tester,
  ) async {
    final CleanerController controller = await pumpReview(tester);
    bridge.planAnswer = toolCachePlan;

    await tapAndSettle(tester, find.byTooltip('Keep App cache'));

    expect(bridge.plannedNumbers, [1]);
    expect(find.text('App cache'), findsNothing);
    expect(findButtonLabelled('Delete 6.0 MB'), findsOneWidget);
    expect((controller.state as ConfirmingState).plan, same(toolCachePlan));
    expectEveryTappableNodeLabelled();
  });

  testWidgets('a new plan that approves nothing shows its lines on the list', (
    WidgetTester tester,
  ) async {
    await pumpReview(tester);
    bridge.planAnswer = sampleNothingApproved;

    await tapAndSettle(tester, find.byTooltip('Keep App cache'));

    expect(find.byType(ReviewPage), findsNothing);
    final Text list = tester.widget<Text>(find.byKey(listKey));
    expect(list.data, sampleNothingApproved.lines.join('\n'));
  });

  testWidgets('Details unfolds the lines of the plan', (WidgetTester tester) async {
    await pumpReview(tester);
    final Finder planLines = find.byWidgetPredicate(
      (Widget widget) =>
          widget is SelectableText && widget.data == samplePlan.lines.join('\n'),
    );
    expect(planLines, findsNothing);

    await tapAndSettle(tester, findButtonLabelled('Details'));

    expect(planLines, findsOneWidget);
    expectEveryTappableNodeLabelled();
  });

  testWidgets('Delete opens the alert, which offers no Show list over the Review page', (
    WidgetTester tester,
  ) async {
    await pumpReview(tester);

    await tapAndSettle(tester, findButtonLabelled('Delete 10 MB'));

    expect(find.text('Delete 10 MB for good?'), findsOneWidget);
    expect(findButtonLabelled('Show list'), findsNothing);
    expectEveryTappableNodeLabelled();
  });

  testWidgets('Back keeps the selection and sends nothing', (WidgetTester tester) async {
    final CleanerController controller = await pumpReview(tester);

    await tapAndSettle(tester, findButtonLabelled('Back'));

    expect((controller.state as ScannedState).selectedNumbers, {1, 2});
    expect(bridge.deleteRequest, isNull);
  });

  testWidgets('with motion on, the total counts down to the new plan', (WidgetTester tester) async {
    await pumpReview(tester, motion: MotionState.allowed);
    bridge.planAnswer = toolCachePlan;

    await tester.tap(find.byTooltip('Keep App cache'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    final Finder total = find.descendant(
      of: find.byType(CountUp),
      matching: find.byType(Text),
    );
    final String? countingText = tester.widget<Text>(total).data;
    expect(countingText, isNot(anyOf('10 MB', '6.0 MB')));
    await tester.pump(const Duration(seconds: 2));
    expect(tester.widget<Text>(total).data, '6.0 MB');
    expectEveryTappableNodeLabelled();
  });
}
