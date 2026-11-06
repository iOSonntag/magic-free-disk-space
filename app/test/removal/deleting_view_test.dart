import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_event.dart';
import 'package:magic_free_disk_space/cleaner/cleaner_controller.dart';
import 'package:magic_free_disk_space/design/dissolve.dart';
import 'package:magic_free_disk_space/design/motion.dart';
import 'package:magic_free_disk_space/removal/deleting_view.dart';

import '../design/support/design_harness.dart';
import '../support/semantics_labels.dart';
import 'removal_harness.dart';

void main() {
  Future<ValueNotifier<MotionState>> pumpDeleting(
    WidgetTester tester, {
    required PlannedEvent plan,
    required MotionState motion,
  }) async {
    final ValueNotifier<MotionState> windowMotion = createWindowMotion(motion);
    await tester.pumpWidget(
      buildRemovalHarness(
        windowMotion: windowMotion,
        child: DeletingView(state: DeletingState(plan: plan)),
      ),
    );
    return windowMotion;
  }

  int countDissolvedRows(WidgetTester tester) {
    return tester
        .widgetList<Dissolve>(find.byType(Dissolve))
        .where((Dissolve dissolve) => dissolve.isDissolved)
        .length;
  }

  testWidgets('under reduced motion, every item of the plan fades at once', (
    WidgetTester tester,
  ) async {
    await pumpDeleting(tester, plan: samplePlan, motion: MotionState.reduced);

    expect(find.text('Deleting 10 MB'), findsOneWidget);
    expect(find.text('Tool cache'), findsOneWidget);
    expect(find.text('App cache'), findsOneWidget);
    expect(countDissolvedRows(tester), 0);
    await tester.pump();
    expect(countDissolvedRows(tester), 2);
    expectEveryTappableNodeLabelled();

    await tester.pumpAndSettle();

    expect(find.text('Tool cache'), findsNothing);
    expect(find.text('Still deleting. This can take a minute.'), findsOneWidget);
  });

  testWidgets(
    'with motion on, the items dissolve one after another, and Reduce Motion ends it at once',
    (WidgetTester tester) async {
      final ValueNotifier<MotionState> windowMotion = await pumpDeleting(
        tester,
        plan: samplePlan,
        motion: MotionState.allowed,
      );

      expect(countDissolvedRows(tester), 0);
      await tester.pump(const Duration(milliseconds: 400));
      expect(countDissolvedRows(tester), 1);
      await tester.pump(const Duration(milliseconds: 200));
      expect(countDissolvedRows(tester), 2);
      expectEveryTappableNodeLabelled();

      windowMotion.value = MotionState.reduced;
      await tester.pumpAndSettle();
      expect(find.text('Still deleting. This can take a minute.'), findsOneWidget);
    },
  );

  testWidgets('Reduce Motion turned on mid-way dissolves the rest and stops the stagger', (
    WidgetTester tester,
  ) async {
    final ValueNotifier<MotionState> windowMotion = await pumpDeleting(
      tester,
      plan: samplePlan,
      motion: MotionState.allowed,
    );
    await tester.pump(const Duration(milliseconds: 100));
    expect(countDissolvedRows(tester), 0);

    windowMotion.value = MotionState.reduced;
    await tester.pump();
    await tester.pump();

    expect(countDissolvedRows(tester), 2);
    await tester.pumpAndSettle();
    expect(find.text('Still deleting. This can take a minute.'), findsOneWidget);
  });

  testWidgets('a long plan shows its six biggest items and the count of the rest', (
    WidgetTester tester,
  ) async {
    final PlannedEvent longPlan = PlannedEvent(
      planId: 4,
      lines: const [],
      warningLines: const [],
      items: [
        for (int number = 1; number <= 8; number++)
          PlannedItemView(
            number: number,
            key: 'catalog:cache-$number',
            title: 'Cache $number',
            sectionKey: SectionKey.caches,
            risk: Risk.safe,
            allocatedBytes: number * 1000000,
          ),
      ],
      totalBytes: 36000000,
      holdsCareful: false,
    );

    await pumpDeleting(tester, plan: longPlan, motion: MotionState.reduced);

    expect(find.text('Cache 8'), findsOneWidget);
    expect(find.text('Cache 3'), findsOneWidget);
    expect(find.text('Cache 2'), findsNothing);
    expect(find.text('and 2 more items'), findsOneWidget);
    await tester.pump();
    expect(countDissolvedRows(tester), 7);
  });
}
