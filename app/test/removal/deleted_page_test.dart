import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_event.dart';
import 'package:magic_free_disk_space/bridge/openable_url.dart';
import 'package:magic_free_disk_space/cleaner/cleaner_controller.dart';
import 'package:magic_free_disk_space/design/disk_ring/disk_ring.dart';
import 'package:magic_free_disk_space/design/disk_ring/disk_ring_arcs.dart';
import 'package:magic_free_disk_space/design/motion.dart';
import 'package:magic_free_disk_space/design/tokens.dart';

import '../support/fake_cleaner_bridge.dart';
import '../support/fake_url_opener.dart';
import '../support/semantics_labels.dart';
import 'removal_harness.dart';

/// A run that kept, partly removed and failed items, and freed space inside
/// Docker's disk image.
const DeletedEvent mixedRun = DeletedEvent(
  lines: ['Freed about 2.0 MB in 1 item.'],
  outcomes: [
    DeletedOutcomeView(
      number: 1,
      key: 'catalog:tool-cache:/Users/me/Library/Caches/ToolCache',
      outcome: DeletedOutcome.partlyRemoved,
      reasonKey: DeletedReason.permissionDenied,
      freedBytes: 2000000,
    ),
    DeletedOutcomeView(
      number: 2,
      key: 'catalog:app-cache:/Users/me/Library/Caches/com.example.other',
      outcome: DeletedOutcome.failed,
      reasonKey: DeletedReason.engineNotRunning,
      freedBytes: 0,
    ),
  ],
  freedBytes: 2000000,
  returnsLaterBytes: 1200000000,
  availableBytesAfter: null,
  logPath: null,
);

void main() {
  late FakeCleanerBridge bridge;

  setUp(() {
    bridge = FakeCleanerBridge(scanAnswer: sampleScan);
  });

  /// Pumps the flow through a deletion of [samplePlan] that answers [run].
  Future<CleanerController> pumpResult(
    WidgetTester tester, {
    required DeletedEvent run,
    FakeUrlOpener? urlOpener,
    MotionState motion = MotionState.reduced,
  }) async {
    bridge.deleteAnswer = run;
    final CleanerController controller = await createConfirmingController(
      bridge,
      plan: samplePlan,
    );
    await controller.confirmDeletion('DELETE');
    await pumpRemovalFlow(
      tester,
      controller: controller,
      urlOpener: urlOpener ?? FakeUrlOpener(isOpening: true),
      motion: motion,
    );
    if (motion.isReduced) {
      await tester.pumpAndSettle();
    }
    return controller;
  }

  testWidgets('shows what was freed and kept, why, and the disk after, with every control labelled', (
    WidgetTester tester,
  ) async {
    await pumpResult(tester, run: sampleDeleted);

    expect(find.text('FREED'), findsOneWidget);
    expect(find.text('6.0 MB'), findsOneWidget);
    expect(find.text('1 item removed.'), findsOneWidget);
    expect(find.text('58 GB free on the disk now.'), findsOneWidget);
    expect(find.text('What stayed'), findsOneWidget);
    expect(find.text('App cache'), findsOneWidget);
    expect(
      find.text('Kept. Its app is open, so it was left alone. Quit the app and try again.'),
      findsOneWidget,
    );
    expect(find.textContaining('more comes back'), findsNothing);
    expect(findButtonLabelled('Show log'), findsOneWidget);
    expect(findButtonLabelled('Done'), findsOneWidget);
    expectEveryTappableNodeLabelled();
  });

  testWidgets('words a partly removed and a failed item, and what comes back later', (
    WidgetTester tester,
  ) async {
    await pumpResult(tester, run: mixedRun);

    expect(find.text('Nothing was removed.'), findsOneWidget);
    expect(
      find.text('Partly removed, 2.0 MB freed. macOS did not allow it to be removed.'),
      findsOneWidget,
    );
    expect(
      find.text(
        'Not removed. Its container engine is not running, so it was left '
        'alone.',
      ),
      findsOneWidget,
    );
    expect(
      find.text('1.2 GB more comes back within minutes, as the container engine gives it up.'),
      findsOneWidget,
    );
    expect(find.textContaining('free on the disk now'), findsNothing);
    expect(find.byType(DiskRing), findsNothing);
    expect(findButtonLabelled('Show log'), findsNothing);
    expectEveryTappableNodeLabelled();
  });

  testWidgets('Details unfolds the lines of the run', (WidgetTester tester) async {
    await pumpResult(tester, run: sampleDeleted);
    final Finder runLines = find.byWidgetPredicate(
      (Widget widget) =>
          widget is SelectableText && widget.data == sampleDeleted.lines.join('\n'),
    );

    await tapAndSettle(tester, findButtonLabelled('Details'));

    expect(runLines, findsOneWidget);
    expectEveryTappableNodeLabelled();
  });

  testWidgets('Show log reveals the log of the run in Finder', (WidgetTester tester) async {
    final FakeUrlOpener urlOpener = FakeUrlOpener(isOpening: true);
    await pumpResult(tester, run: sampleDeleted, urlOpener: urlOpener);

    await tapAndSettle(tester, findButtonLabelled('Show log'));

    final OpenableUrl url = urlOpener.requestedUrls.single;
    expect(url, isA<RevealUrl>());
    expect(url.text, contains(sampleDeleted.logPath));
    expect(find.text('The log could not be shown in Finder.'), findsNothing);
  });

  testWidgets('a log that does not open says so', (WidgetTester tester) async {
    await pumpResult(
      tester,
      run: sampleDeleted,
      urlOpener: FakeUrlOpener(isOpening: false),
    );

    await tapAndSettle(tester, findButtonLabelled('Show log'));

    expect(find.text('The log could not be shown in Finder.'), findsOneWidget);
  });

  testWidgets('Done scans again', (WidgetTester tester) async {
    final CleanerController controller = await pumpResult(tester, run: sampleDeleted);

    await tapAndSettle(tester, findButtonLabelled('Done'));

    expect(bridge.requestKinds.last, 'scan');
    expect(controller.state, isA<ScannedState>());
    expect(find.byKey(listKey), findsOneWidget);
  });

  testWidgets('under reduced motion the ring shows the disk after the run at once', (
    WidgetTester tester,
  ) async {
    await pumpResult(tester, run: sampleDeleted);

    final DiskRing ring = tester.widget<DiskRing>(find.byType(DiskRing));
    expect(
      ring.reading,
      isA<DiskRingVolumeReading>()
          .having((DiskRingVolumeReading reading) => reading.availableBytes, 'availableBytes', 58000000000)
          .having((DiskRingVolumeReading reading) => reading.freeableBytes, 'freeableBytes', 0),
    );
    expect(ring.semanticsLabel, '58 GB free of 500 GB');
  });

  testWidgets('with motion on the ring fills to the disk before the run, then turns to after', (
    WidgetTester tester,
  ) async {
    await pumpResult(tester, run: sampleDeleted, motion: MotionState.allowed);
    await tester.pump();

    DiskRingVolumeReading findShownReading() {
      return tester.widget<DiskRing>(find.byType(DiskRing)).reading as DiskRingVolumeReading;
    }

    expect(findShownReading().availableBytes, 52000000000);
    expect(findShownReading().freeableBytes, samplePlan.totalBytes);

    await tester.pump(MotionTokens.ringFill - const Duration(milliseconds: 100));
    expect(findShownReading().availableBytes, 52000000000);
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pump();

    expect(findShownReading().availableBytes, 58000000000);
    expect(findShownReading().freeableBytes, 0);
    expectEveryTappableNodeLabelled();
  });
}
