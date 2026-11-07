import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge.dart';
import 'package:magic_free_disk_space/cleaner/cleaner.dart';
import 'package:magic_free_disk_space/design/design.dart';
import 'package:magic_free_disk_space/link/link.dart';
import 'package:magic_free_disk_space/removal/removal.dart';

import '../../support/fake_cleaner_bridge.dart';
import '../../support/sample_events.dart';
import '../../support/stage_harness.dart';
import '../../support/test_items.dart';

/// The two caches 1 (safe) and 2 (review) to delete and the iCloud folder 7
/// to evict, with no careful item.
final PlannedEvent samplePlan = loadSampleEvent<PlannedEvent>();

/// A run with one item of each outcome the bridge words, the App cache kept
/// because its app runs.
final DeletedEvent sampleDeleted = loadSampleEvent<DeletedEvent>();

/// [samplePlan] with its App cache careful, measured whole.
final PlannedEvent carefulPlan = buildSamplePlan(
  [
    for (final PlannedItemView item in samplePlan.items)
      if (item.number == 2)
        planItem(
          buildTestItemView(
            number: item.number,
            title: item.title,
            risk: Risk.careful,
            group: ItemGroup.careful,
            sectionKey: item.sectionKey,
            allocatedBytes: item.allocatedBytes,
          ),
        )
      else
        item,
  ],
  planId: 2,
  holdsCareful: true,
);

/// [samplePlan] without its App cache, as the bridge answers once Keep takes
/// item 2 out.
final PlannedEvent planWithoutAppCache = buildSamplePlan(
  [for (final PlannedItemView item in samplePlan.items) if (item.number != 2) item],
  planId: 3,
  holdsCareful: false,
);

/// [samplePlan] with its iCloud folder alone, which only leaves this Mac.
final PlannedEvent evictOnlyPlan = buildSamplePlan(
  [for (final PlannedItemView item in samplePlan.items) if (item.removal == ItemRemoval.evict) item],
  planId: 3,
  holdsCareful: false,
);

/// The item of the sample scan numbered [number], as a plan lists it.
PlannedItemView planSampleItem(int number) {
  return planItem(
    loadSampleEvent<ScannedEvent>().selectableItems.singleWhere((ItemView item) => item.number == number),
  );
}

/// Pumps the step of the delete flow that [controller] is in, as the shell
/// shows it over the pages, with [motion] as the window's motion; nothing
/// shows once the flow has ended. Settles when motion is reduced.
Future<void> pumpRemovalFlow(
  WidgetTester tester, {
  required CleanerController controller,
  required UrlOpener urlOpener,
  MotionState motion = MotionState.reduced,
}) {
  final Widget flowStep = ListenableBuilder(
    listenable: controller,
    builder: (BuildContext context, Widget? _) {
      final CleanerState state = controller.state;
      if (state is! RemovalFlowState) {
        return const SizedBox.shrink();
      }
      return RemovalFlowStep(
        state: state,
        controller: controller,
        urlOpener: urlOpener,
      );
    },
  );
  return pumpOnStage(tester, flowStep, motion: motion);
}

/// The numbers of the items of [plan].
List<int> listPlannedNumbers(PlannedEvent plan) {
  return [for (final PlannedItemView item in plan.items) item.number];
}

/// A controller over [bridge] whose state confirms [plan] of
/// [selectedNumbers], the items of [plan] when not given; disposed at
/// tear-down.
Future<CleanerController> createConfirmingController(
  FakeCleanerBridge bridge, {
  required PlannedEvent plan,
  List<int>? selectedNumbers,
}) async {
  bridge.planAnswer = plan;
  final CleanerController controller = CleanerController(bridge: bridge);
  addTearDown(controller.dispose);
  await controller.scan();
  for (final int number in selectedNumbers ?? listPlannedNumbers(plan)) {
    controller.toggleCandidate(number);
  }
  await controller.requestPlan();
  return controller;
}
