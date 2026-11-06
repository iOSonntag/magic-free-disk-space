import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_event.dart';
import 'package:magic_free_disk_space/cleaner/cleaner_controller.dart';
import 'package:magic_free_disk_space/design/cinematic_stage.dart';
import 'package:magic_free_disk_space/design/motion.dart';
import 'package:magic_free_disk_space/design/shaders/shader_library.dart';
import 'package:magic_free_disk_space/design/stage_theme.dart';
import 'package:magic_free_disk_space/design/tokens.dart';
import 'package:magic_free_disk_space/link/url_opener.dart';
import 'package:magic_free_disk_space/removal/deleted_page.dart';
import 'package:magic_free_disk_space/removal/deleting_view.dart';
import 'package:magic_free_disk_space/removal/review_page.dart';

import '../support/fake_cleaner_bridge.dart';
import '../support/sample_events.dart';

final List<BridgeEvent> sampleEvents = loadSampleEvents();
final ScannedEvent sampleScan = sampleEvents.whereType<ScannedEvent>().single;

/// Items 1 (safe) and 2 (review) of the scan, 10 MB, with no careful item.
final PlannedEvent samplePlan = sampleEvents.whereType<PlannedEvent>().single;
final NothingApprovedEvent sampleNothingApproved = sampleEvents
    .whereType<NothingApprovedEvent>()
    .single;

/// Item 1 removed, item 2 kept because its app runs.
final DeletedEvent sampleDeleted = sampleEvents.whereType<DeletedEvent>().single;

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

/// The key of the text the host shows for the list.
const Key listKey = Key('list');

/// Shows the step of the delete flow the state of [controller] is in, as the
/// shell does; the list and idle show only their notice.
class RemovalFlowHost extends StatelessWidget {
  const RemovalFlowHost({
    super.key,
    required this.controller,
    required this.urlOpener,
  });

  final CleanerController controller;
  final UrlOpener urlOpener;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (BuildContext context, Widget? _) => switch (controller.state) {
        ConfirmingState state => ReviewPage(state: state, controller: controller),
        DeletingState state => DeletingView(state: state),
        DeletedState state => DeletedPage(
          state: state,
          controller: controller,
          urlOpener: urlOpener,
        ),
        ScannedState state => Text(state.notice ?? 'The list', key: listKey),
        IdleState state => Text(state.notice ?? 'Idle'),
        ScanningState _ => const Text('Scanning'),
      },
    );
  }
}

/// Wraps [child] as the app does around a step of the delete flow: a
/// [MotionScope] over [windowMotion], the empty shader library, the stage
/// theme and the cinematic stage.
Widget buildRemovalHarness({
  required ValueListenable<MotionState> windowMotion,
  required Widget child,
}) {
  return MotionScope(
    windowMotion: windowMotion,
    child: ShaderLibraryScope(
      library: ShaderLibrary.empty,
      child: MaterialApp(
        theme: buildStageTheme(),
        home: CinematicStage(accent: StageColors.careful, child: child),
      ),
    ),
  );
}

/// Pumps the flow host over [controller] on a view tall enough for every
/// step, with [motion] as the window's motion.
Future<ValueNotifier<MotionState>> pumpRemovalFlow(
  WidgetTester tester, {
  required CleanerController controller,
  required UrlOpener urlOpener,
  MotionState motion = MotionState.reduced,
}) async {
  tester.view.physicalSize = const Size(1200, 1600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final ValueNotifier<MotionState> windowMotion = ValueNotifier<MotionState>(motion);
  addTearDown(windowMotion.dispose);
  await tester.pumpWidget(
    buildRemovalHarness(
      windowMotion: windowMotion,
      child: RemovalFlowHost(controller: controller, urlOpener: urlOpener),
    ),
  );
  return windowMotion;
}

/// A controller over [bridge] whose state confirms [plan] of items 1 and 2.
Future<CleanerController> createConfirmingController(
  FakeCleanerBridge bridge, {
  required PlannedEvent plan,
}) async {
  bridge.planAnswer = plan;
  final CleanerController controller = CleanerController(bridge: bridge);
  await controller.scan();
  controller
    ..toggleCandidate(1)
    ..toggleCandidate(2);
  await controller.requestPlan();
  return controller;
}

Future<void> tapAndSettle(WidgetTester tester, Finder finder) async {
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

/// The button of an [AccentButton] or a quiet button labelled [label].
Finder findButtonLabelled(String label) {
  return find.ancestor(
    of: find.text(label),
    matching: find.byWidgetPredicate((Widget widget) => widget is ButtonStyleButton),
  );
}

/// Whether the button labelled [label] can be pressed.
bool isButtonEnabled(WidgetTester tester, String label) {
  return tester.widget<ButtonStyleButton>(findButtonLabelled(label)).onPressed != null;
}
