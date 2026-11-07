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

/// Items 1 (safe) and 2 (review) of the scan, 10 MB, with no careful item.
final PlannedEvent samplePlan = loadSampleEvent<PlannedEvent>();

/// Item 1 removed, item 2 kept because its app runs.
final DeletedEvent sampleDeleted = loadSampleEvent<DeletedEvent>();

/// [samplePlan] with its second item careful.
final PlannedEvent carefulPlan = PlannedEvent(
  planId: 2,
  lines: samplePlan.lines,
  warningLines: samplePlan.warningLines,
  items: [
    samplePlan.items.first,
    PlannedItemView(
      number: samplePlan.items.last.number,
      key: samplePlan.items.last.key,
      title: samplePlan.items.last.title,
      sectionKey: samplePlan.items.last.sectionKey,
      risk: Risk.careful,
      removal: samplePlan.items.last.removal,
      allocatedBytes: samplePlan.items.last.allocatedBytes,
    ),
  ],
  totalBytes: samplePlan.totalBytes,
  holdsCareful: true,
);

/// The plan of item 1 alone, as the bridge answers once item 2 is taken out.
final PlannedEvent toolCachePlan = PlannedEvent(
  planId: 3,
  lines: [samplePlan.lines[1]],
  warningLines: samplePlan.warningLines,
  items: [samplePlan.items.first],
  totalBytes: samplePlan.items.first.allocatedBytes,
  holdsCareful: false,
);

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

/// A controller over [bridge] whose state confirms [plan] of
/// [selectedNumbers]; disposed at tear-down.
Future<CleanerController> createConfirmingController(
  FakeCleanerBridge bridge, {
  required PlannedEvent plan,
  List<int> selectedNumbers = const [1, 2],
}) async {
  bridge.planAnswer = plan;
  final CleanerController controller = CleanerController(bridge: bridge);
  addTearDown(controller.dispose);
  await controller.scan();
  for (final int number in selectedNumbers) {
    controller.toggleCandidate(number);
  }
  await controller.requestPlan();
  return controller;
}
