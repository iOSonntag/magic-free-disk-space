import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/design/disk_ring/disk_ring.dart';
import 'package:magic_free_disk_space/design/disk_ring/disk_ring_arcs.dart';
import 'package:magic_free_disk_space/design/disk_ring/disk_ring_painter.dart';
import 'package:magic_free_disk_space/design/motion.dart';
import 'package:magic_free_disk_space/design/tokens.dart';

import 'support/design_harness.dart';

const DiskRingReading volume = DiskRingVolumeReading(capacityBytes: 1000, availableBytes: 400, freeableBytes: 200);
const DiskRingArcs volumeArcs = DiskRingArcs(keptEnd: 0.4, freeableEnd: 0.6);

Widget buildRing(ValueNotifier<MotionState> windowMotion, DiskRingReading reading, {bool isScanning = false}) {
  return buildDesignHarness(
    windowMotion: windowMotion,
    child: SizedBox.square(
      dimension: 240,
      child: DiskRing(
        reading: reading,
        accent: StageColors.overviewAccent,
        isScanning: isScanning,
        semanticsLabel: 'Disk: 400 B available',
        center: const Text('200 B can be freed'),
      ),
    ),
  );
}

DiskRingPainter readRingPainter(WidgetTester tester) {
  return tester.widget<CustomPaint>(findRingPaint()).painter! as DiskRingPainter;
}

void main() {
  group('buildDiskRingArcs', () {
    test('splits the used space into what stays and what can be freed', () {
      expect(buildDiskRingArcs(volume), volumeArcs);
    });

    test('clamps what can be freed to the used space', () {
      const DiskRingReading reading = DiskRingVolumeReading(capacityBytes: 1000, availableBytes: 400, freeableBytes: 900);

      expect(buildDiskRingArcs(reading), const DiskRingArcs(keptEnd: 0, freeableEnd: 0.6));
    });

    test('clamps the available space to the capacity', () {
      const DiskRingReading reading = DiskRingVolumeReading(capacityBytes: 1000, availableBytes: 1200, freeableBytes: 50);

      expect(buildDiskRingArcs(reading), DiskRingArcs.empty);
    });

    test('shows nothing for a volume of no capacity', () {
      const DiskRingReading reading = DiskRingVolumeReading(capacityBytes: 0, availableBytes: 0, freeableBytes: 0);

      expect(buildDiskRingArcs(reading), DiskRingArcs.empty);
    });

    test('lights the whole ring when only what can be freed is known', () {
      expect(
        buildDiskRingArcs(const DiskRingFreeableReading(freeableBytes: 12)),
        const DiskRingArcs(keptEnd: 0, freeableEnd: 1),
      );
      expect(buildDiskRingArcs(const DiskRingFreeableReading(freeableBytes: 0)), DiskRingArcs.empty);
    });
  });

  testWidgets('shows its reading at once while motion is reduced', (WidgetTester tester) async {
    final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.reduced);
    await tester.pumpWidget(buildRing(windowMotion, volume, isScanning: true));

    expect(readRingPainter(tester).arcs, volumeArcs);
    expect(readRingPainter(tester).isSweeping, isFalse);
    expect(tester.hasRunningAnimations, isFalse);
  });

  testWidgets('fills from empty and eases to a new reading', (WidgetTester tester) async {
    final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.allowed);
    await tester.pumpWidget(buildRing(windowMotion, volume));
    await tester.pump(MotionTokens.ringFill ~/ 2);

    final DiskRingArcs midway = readRingPainter(tester).arcs;
    expect(midway.freeableEnd, inExclusiveRange(0, volumeArcs.freeableEnd));

    await tester.pumpAndSettle();
    expect(readRingPainter(tester).arcs, volumeArcs);

    const DiskRingReading afterDelete = DiskRingVolumeReading(capacityBytes: 1000, availableBytes: 600, freeableBytes: 0);
    await tester.pumpWidget(buildRing(windowMotion, afterDelete));
    await tester.pump(MotionTokens.ringFill ~/ 2);

    expect(readRingPainter(tester).arcs.freeableEnd, inExclusiveRange(0.4, 0.6));

    await tester.pumpAndSettle();
    expect(readRingPainter(tester).arcs, const DiskRingArcs(keptEnd: 0.4, freeableEnd: 0.4));
  });

  testWidgets('sweeps while a scan runs and motion is allowed', (WidgetTester tester) async {
    final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.allowed);
    await tester.pumpWidget(buildRing(windowMotion, volume, isScanning: true));

    expect(readRingPainter(tester).isSweeping, isTrue);

    await tester.pumpAndSettle();
  });

  testWidgets('carries its semantics label and its center', (WidgetTester tester) async {
    final SemanticsHandle semantics = tester.ensureSemantics();
    final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.reduced);
    await tester.pumpWidget(buildRing(windowMotion, volume));

    expect(find.bySemanticsLabel(RegExp('Disk: 400 B available')), findsOneWidget);
    expect(find.text('200 B can be freed'), findsOneWidget);
    semantics.dispose();
  });
}
