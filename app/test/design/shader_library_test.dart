import 'dart:typed_data';
import 'dart:ui';
import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/design/cinematic_stage.dart';
import 'package:magic_free_disk_space/design/disk_ring/disk_ring.dart';
import 'package:magic_free_disk_space/design/disk_ring/disk_ring_arcs.dart';
import 'package:magic_free_disk_space/design/disk_ring/disk_ring_painter.dart';
import 'package:magic_free_disk_space/design/motion.dart';
import 'package:magic_free_disk_space/design/shaders/backdrop_painter.dart';
import 'package:magic_free_disk_space/design/shaders/shader_library.dart';
import 'package:magic_free_disk_space/design/tokens.dart';

import 'support/design_harness.dart';

const Color accent = Color(0xFF38E1FF);
const DiskRingReading volume = DiskRingVolumeReading(
  capacityBytes: 1000000000000,
  availableBytes: 300000000000,
  freeableBytes: 120000000000,
);

Widget buildStageAndRing({required ValueNotifier<MotionState> windowMotion, required ShaderLibrary library}) {
  return buildDesignHarness(
    windowMotion: windowMotion,
    library: library,
    child: const SizedBox(
      width: 600,
      height: 400,
      child: Stack(
        fit: StackFit.expand,
        children: <Widget>[
          CinematicBackdrop(accent: accent),
          Center(
            child: SizedBox.square(
              dimension: 240,
              child: DiskRing(reading: volume, accent: accent, isScanning: false, semanticsLabel: 'Disk'),
            ),
          ),
        ],
      ),
    ),
  );
}

bool isDrawWithFragmentShader(Symbol method, List<dynamic> arguments) {
  if (method != #drawRect) {
    return false;
  }

  final Object? paint = arguments.last;
  return paint is Paint && paint.shader is FragmentShader;
}

bool hasNoShaderNorGlow(Symbol method, List<dynamic> arguments) {
  final Object? paint = arguments.isEmpty ? null : arguments.last;
  if (paint is! Paint) {
    return true;
  }

  return paint.shader is! FragmentShader && paint.maskFilter == null;
}

typedef Pixel = ({int red, int green, int blue, int alpha});

/// Runs [painter] on a real canvas and reads back its pixels.
Future<ByteData> rasterizePainter(CustomPainter painter, Size size) async {
  final PictureRecorder recorder = PictureRecorder();
  painter.paint(Canvas(recorder), size);
  final Picture picture = recorder.endRecording();
  final ui.Image image = await picture.toImage(size.width.toInt(), size.height.toInt());
  final ByteData? pixels = await image.toByteData(format: ImageByteFormat.rawStraightRgba);
  image.dispose();
  picture.dispose();
  return pixels!;
}

Pixel readPixel(ByteData pixels, {required int width, required int x, required int y}) {
  final int offset = (y * width + x) * 4;
  return (
    red: pixels.getUint8(offset),
    green: pixels.getUint8(offset + 1),
    blue: pixels.getUint8(offset + 2),
    alpha: pixels.getUint8(offset + 3),
  );
}

RenderObject findBackdropRender(WidgetTester tester) => tester.renderObject(find.byType(CinematicBackdrop));

RenderObject findRingRender(WidgetTester tester) {
  return tester.renderObject(find.descendant(of: find.byType(DiskRing), matching: find.byType(CustomPaint)).first);
}

void main() {
  testWidgets('loads both fragment programs from the bundled assets and paints them through Paint.shader', (
    WidgetTester tester,
  ) async {
    final ShaderLibrary? library = await tester.runAsync(ShaderLibrary.load);

    expect(library?.backdrop, isNotNull);
    expect(library?.ringGlow, isNotNull);

    final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.reduced);
    await tester.pumpWidget(buildStageAndRing(windowMotion: windowMotion, library: library!));

    expect(findBackdropRender(tester), paints..something(isDrawWithFragmentShader));
    expect(findRingRender(tester), paints..something(isDrawWithFragmentShader));

    final ValueNotifier<double> stillTime = ValueNotifier<double>(0);
    addTearDown(stillTime.dispose);
    final FragmentShader backdropShader = library.backdrop!.fragmentShader();
    addTearDown(backdropShader.dispose);
    final FragmentShader ringShader = library.ringGlow!.fragmentShader();
    addTearDown(ringShader.dispose);
    final BackdropPainter backdropPainter = BackdropPainter(shader: backdropShader, ambientTime: stillTime, accent: accent);
    final DiskRingPainter ringPainter = DiskRingPainter(
      arcs: const DiskRingArcs(keptEnd: 0.4, freeableEnd: 0.6),
      accent: accent,
      shader: ringShader,
      ambientTime: stillTime,
      isSweeping: false,
    );
    final ByteData? backdrop = await tester.runAsync(() => rasterizePainter(backdropPainter, const Size(64, 40)));
    final ByteData? ring = await tester.runAsync(() => rasterizePainter(ringPainter, const Size.square(120)));

    final Pixel stage = readPixel(backdrop!, width: 64, x: 32, y: 20);
    expect(stage.alpha, 255);
    expect(<int>[stage.red, stage.green, stage.blue], everyElement(lessThan(96)));

    // The lit share runs from 0.4 to 0.6 of a turn, so it crosses the bottom of the ring.
    final double radius = DiskRingGeometry.fit(const Size.square(120)).radius;
    final Pixel lit = readPixel(ring!, width: 120, x: 60, y: (60 + radius).round());
    expect(lit.alpha, greaterThan(240));
    expect(lit.blue, greaterThan(200));
    expect(lit.green, greaterThan(150));
    final Pixel nearCenter = readPixel(ring, width: 120, x: 60, y: 50);
    expect(nearCenter.alpha, lessThan(8));
  });

  group('without shaders', () {
    testWidgets('the backdrop paints a static gradient with no glow', (WidgetTester tester) async {
      final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.allowed);
      await tester.pumpWidget(buildStageAndRing(windowMotion: windowMotion, library: ShaderLibrary.empty));

      expect(
        findBackdropRender(tester),
        paints
          ..rect(rect: const Rect.fromLTWH(0, 0, 600, 400))
          ..rect(rect: const Rect.fromLTWH(0, 0, 600, 400))
          ..rect(rect: const Rect.fromLTWH(0, 0, 600, 400)),
      );
      expect(findBackdropRender(tester), paints..everything(hasNoShaderNorGlow));
    });

    testWidgets('the ring paints plain arcs with no glow', (WidgetTester tester) async {
      final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.reduced);
      await tester.pumpWidget(buildStageAndRing(windowMotion: windowMotion, library: ShaderLibrary.empty));

      expect(
        findRingRender(tester),
        paints
          ..arc(color: StageColors.diskAvailable)
          ..arc(color: StageColors.diskUsed)
          ..arc(color: accent),
      );
      expect(findRingRender(tester), paints..everything(hasNoShaderNorGlow));
    });

    testWidgets('nothing ticks, whatever motion allows', (WidgetTester tester) async {
      final ValueNotifier<MotionState> windowMotion = createWindowMotion(MotionState.allowed);
      await tester.pumpWidget(buildStageAndRing(windowMotion: windowMotion, library: ShaderLibrary.empty));
      await tester.pumpAndSettle();

      expect(tester.hasRunningAnimations, isFalse);
    });
  });

  testWidgets('a program that fails to load is null', (WidgetTester tester) async {
    final FragmentProgram? program = await tester.runAsync<FragmentProgram?>(
      () => loadFragmentProgramOrNull('shaders/missing.frag'),
    );

    expect(program, isNull);
  });
}
