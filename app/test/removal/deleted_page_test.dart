import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge.dart';
import 'package:magic_free_disk_space/cleaner/cleaner.dart';
import 'package:magic_free_disk_space/design/design.dart';
import 'package:magic_free_disk_space/removal/deleted_page.dart';

import '../support/fake_cleaner_bridge.dart';
import '../support/fake_url_opener.dart';
import '../support/sample_events.dart';
import '../support/semantics_labels.dart';
import '../support/stage_controls.dart';
import 'support/removal_harness.dart';

/// A run that kept, partly removed and failed items, and freed space inside
/// Docker's disk image.
const DeletedEvent mixedRun = DeletedEvent(
  lines: ['Freed about 2.0 MB in 1 item.'],
  isScanKept: false,
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
    bridge = FakeCleanerBridge(scanAnswer: loadSampleEvent<ScannedEvent>());
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
    return controller;
  }

  testWidgets('shows what was freed and kept, why, and the disk after, with every control labelled', (
    WidgetTester tester,
  ) async {
    await pumpResult(tester, run: sampleDeleted);

    expect(find.text('FREED'), findsOneWidget);
    expect(find.text('9.0 MB'), findsOneWidget);
    expect(find.text('2 items removed, 1 item partly removed.'), findsOneWidget);
    expect(find.text('58 GB free on the disk now.'), findsOneWidget);
    expect(find.text('What stayed'), findsOneWidget);
    expect(find.text('App cache'), findsOneWidget);
    expect(
      find.text('Kept. Its app is open, so it was left alone. Quit the app and try again.'),
      findsOneWidget,
    );
    final PlannedItemView evictedFolder = evictOnlyPlan.items.single;
    expect(find.text(evictedFolder.title), findsOneWidget);
    expect(
      find.text('Partly removed, 3.0 MB freed. It changed since the scan, so it was left alone.'),
      findsOneWidget,
    );
    expect(find.text('Not removed. macOS did not allow it to be removed.'), findsOneWidget);
    expect(
      find.text('2.0 MB more comes back within minutes, as the container engine gives it up.'),
      findsOneWidget,
    );
    expect(findButtonLabelled('Show log'), findsOneWidget);
    expect(findButtonLabelled('Done'), findsOneWidget);
    expectEveryTappableNodeLabelled();
  });

  testWidgets('words a partly removed and a failed item, and what comes back later', (
    WidgetTester tester,
  ) async {
    await pumpResult(tester, run: mixedRun);

    expect(find.text('1 item partly removed.'), findsOneWidget);
    expect(find.text('Nothing was removed.'), findsNothing);
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

  testWidgets('words an item kept for a reason this app does not know by its outcome alone', (
    WidgetTester tester,
  ) async {
    final PlannedItemView appCache = planSampleItem(2);
    final DeletedEvent runWithUnknownReason = DeletedEvent(
      lines: const ['Freed nothing.'],
      isScanKept: false,
      outcomes: [
        DeletedOutcomeView(
          number: appCache.number,
          key: appCache.key,
          outcome: DeletedOutcome.kept,
          reasonKey: DeletedReason.unknown,
          freedBytes: 0,
        ),
      ],
      freedBytes: 0,
      returnsLaterBytes: 0,
      availableBytesAfter: null,
      logPath: null,
    );

    await pumpResult(tester, run: runWithUnknownReason);

    expect(find.text('What stayed'), findsOneWidget);
    expect(find.text(appCache.title), findsOneWidget);
    expect(find.text('Kept.'), findsOneWidget);
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

  testWidgets('Done scans again and leaves the flow', (WidgetTester tester) async {
    final CleanerController controller = await pumpResult(tester, run: sampleDeleted);

    await tapAndSettle(tester, findButtonLabelled('Done'));

    expect(bridge.requestKinds, ['status', 'scan', 'plan', 'delete', 'scan']);
    expect(controller.state, isA<ScannedState>());
    expect(find.byType(DeletedPage), findsNothing);
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

    DiskRingVolumeReading readShownReading() {
      return tester.widget<DiskRing>(find.byType(DiskRing)).reading as DiskRingVolumeReading;
    }

    expect(readShownReading().availableBytes, 52000000000);
    expect(readShownReading().freeableBytes, samplePlan.totalBytes);

    await tester.pump(MotionTokens.ringFill - const Duration(milliseconds: 100));
    expect(readShownReading().availableBytes, 52000000000);
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pump();

    expect(readShownReading().availableBytes, 58000000000);
    expect(readShownReading().freeableBytes, 0);
    expectEveryTappableNodeLabelled();
  });
}
