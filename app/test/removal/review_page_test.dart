import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge.dart';
import 'package:magic_free_disk_space/cleaner/cleaner.dart';
import 'package:magic_free_disk_space/design/design.dart';
import 'package:magic_free_disk_space/removal/review_page.dart';

import '../support/fake_cleaner_bridge.dart';
import '../support/fake_url_opener.dart';
import '../support/sample_events.dart';
import '../support/semantics_labels.dart';
import '../support/stage_controls.dart';
import 'support/removal_harness.dart';

/// The item of the sample scan numbered [number], as a plan lists it.
PlannedItemView _planSampleItem(int number) {
  final ItemView item = loadSampleEvent<ScannedEvent>().selectableItems.singleWhere(
    (ItemView item) => item.number == number,
  );
  return PlannedItemView(
    number: item.number,
    key: item.key,
    title: item.title,
    sectionKey: item.sectionKey,
    risk: item.risk,
    removal: item.removal,
    allocatedBytes: item.allocatedBytes,
  );
}

/// The closest glass card around [heading], which holds its section.
Finder _findSectionCard(Finder heading) {
  return find.ancestor(of: heading, matching: find.byType(GlassCard)).first;
}

void main() {
  late FakeCleanerBridge bridge;

  setUp(() {
    bridge = FakeCleanerBridge(scanAnswer: loadSampleEvent<ScannedEvent>())
      ..deleteAnswer = sampleDeleted;
  });

  Future<CleanerController> pumpReview(
    WidgetTester tester, {
    PlannedEvent? plan,
    List<int>? selectedNumbers,
    MotionState motion = MotionState.reduced,
  }) async {
    final CleanerController controller = await createConfirmingController(
      bridge,
      plan: plan ?? samplePlan,
      selectedNumbers: selectedNumbers,
    );
    await pumpRemovalFlow(
      tester,
      controller: controller,
      urlOpener: FakeUrlOpener(isOpening: true),
      motion: motion,
    );
    // With motion on, the ambient glow never settles.
    if (!motion.isReduced) {
      await tester.pump(const Duration(seconds: 2));
    }
    return controller;
  }

  testWidgets('lists each item under its section with the total, and labels every control', (
    WidgetTester tester,
  ) async {
    await pumpReview(tester);

    expect(find.text('Caches'), findsOneWidget);
    expect(find.text('iCloud Drive'), findsOneWidget);
    expect(find.text('15 MB'), findsWidgets);
    expect(find.bySemanticsLabel('Tool cache, 6.0 MB, Safe to remove'), findsOneWidget);
    expect(find.bySemanticsLabel('App cache, 4.0 MB, Review first'), findsOneWidget);
    for (final PlannedItemView item in samplePlan.items) {
      expect(find.byTooltip('Keep ${item.title}'), findsOneWidget);
    }
    expect(findButtonLabelled('Delete 15 MB'), findsOneWidget);
    expect(find.textContaining('type DELETE'), findsNothing);
    expectEveryTappableNodeLabelled();
  });

  testWidgets('groups a plan across sections under the heading of each, in the order of the sections', (
    WidgetTester tester,
  ) async {
    final PlannedItemView icloudFolder = _planSampleItem(7);
    final PlannedItemView removedAppData = _planSampleItem(4);
    final PlannedItemView toolCache = _planSampleItem(1);
    final List<PlannedItemView> items = [icloudFolder, removedAppData, toolCache];
    final PlannedEvent threeSectionPlan = PlannedEvent(
      planId: 5,
      lines: const [],
      warningLines: const [],
      items: items,
      totalBytes: items.fold(0, (int sum, PlannedItemView item) => sum + item.allocatedBytes),
      holdsCareful: true,
    );

    await pumpReview(tester, plan: threeSectionPlan, selectedNumbers: [7, 4, 1]);

    final Map<String, PlannedItemView> itemsByHeading = {
      'Caches': toolCache,
      'Apps': removedAppData,
      'iCloud Drive': icloudFolder,
    };
    for (final MapEntry<String, PlannedItemView> section in itemsByHeading.entries) {
      final Finder card = _findSectionCard(find.text(section.key));
      expect(card, findsOneWidget);
      for (final PlannedItemView item in items) {
        expect(
          find.descendant(of: card, matching: find.text(item.title)),
          item == section.value ? findsOneWidget : findsNothing,
          reason: '${item.title} on the card of ${section.key}',
        );
      }
    }
    final List<double> cardTops = [
      for (final String heading in itemsByHeading.keys)
        tester.getTopLeft(_findSectionCard(find.text(heading))).dy,
    ];
    expect(cardTops, orderedEquals([...cardTops]..sort()));
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
    bridge.planAnswer = planWithoutAppCache;

    await tapAndSettle(tester, find.byTooltip('Keep App cache'));

    expect(bridge.plannedNumbers, listPlannedNumbers(planWithoutAppCache));
    expect(find.text('App cache'), findsNothing);
    expect(findButtonLabelled('Delete 11 MB'), findsOneWidget);
    expect((controller.state as ConfirmingState).plan, same(planWithoutAppCache));
    expectEveryTappableNodeLabelled();
  });

  testWidgets('a new plan that approves nothing leaves the flow with its lines as the notice', (
    WidgetTester tester,
  ) async {
    final NothingApprovedEvent nothingApproved = loadSampleEvent<NothingApprovedEvent>();
    final CleanerController controller = await pumpReview(tester);
    bridge.planAnswer = nothingApproved;

    await tapAndSettle(tester, find.byTooltip('Keep App cache'));

    expect(find.byType(ReviewPage), findsNothing);
    final ScannedState state = controller.state as ScannedState;
    expect(state.notice, nothingApproved.lines.join('\n'));
    expect(state.selectedNumbers, listPlannedNumbers(planWithoutAppCache).toSet());
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

    await tapAndSettle(tester, findButtonLabelled('Delete 15 MB'));

    expect(find.text('Delete 15 MB for good?'), findsOneWidget);
    expect(findButtonLabelled('Show list'), findsNothing);
    expectEveryTappableNodeLabelled();
  });

  testWidgets('Cancel on the alert closes it alone and keeps the plan on Review', (
    WidgetTester tester,
  ) async {
    final CleanerController controller = await pumpReview(tester);
    final CleanerState before = controller.state;
    await tapAndSettle(tester, findButtonLabelled('Delete 15 MB'));

    await tapAndSettle(tester, findButtonLabelled('Cancel'));

    expect(find.byType(Dialog), findsNothing);
    expect(find.byType(ReviewPage), findsOneWidget);
    expect(controller.state, same(before));
    expect(bridge.deleteRequest, isNull);
  });

  testWidgets('Back keeps the selection and sends nothing', (WidgetTester tester) async {
    final CleanerController controller = await pumpReview(tester);

    await tapAndSettle(tester, findButtonLabelled('Back'));

    expect(
      (controller.state as ScannedState).selectedNumbers,
      listPlannedNumbers(samplePlan).toSet(),
    );
    expect(find.byType(ReviewPage), findsNothing);
    expect(bridge.deleteRequest, isNull);
  });

  testWidgets('with motion on, the total counts down to the new plan', (WidgetTester tester) async {
    await pumpReview(tester, motion: MotionState.allowed);
    bridge.planAnswer = planWithoutAppCache;

    await tester.tap(find.byTooltip('Keep App cache'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    final Finder total = find.descendant(
      of: find.byType(CountUp),
      matching: find.byType(Text),
    );
    final String? countingText = tester.widget<Text>(total).data;
    expect(countingText, isNot(anyOf('15 MB', '11 MB')));
    await tester.pump(const Duration(seconds: 2));
    expect(tester.widget<Text>(total).data, '11 MB');
    expectEveryTappableNodeLabelled();
  });
}
