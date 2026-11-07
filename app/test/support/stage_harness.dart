import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/design/design.dart';

import '../design/support/design_harness.dart';

/// A window tall enough that every page builds all of its cards.
const Size stageWindowSize = Size(1440, 2800);

/// The smallest window the macOS runner lets the user size it to.
const Size minimumWindowSize = Size(960, 640);

/// Sets the window to [size], and resets it at tear-down.
void setStageWindowSize(WidgetTester tester, {Size size = stageWindowSize}) {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

/// Wraps [app] in what main gives it: a [MotionScope] over [windowMotion],
/// reduced unless given, and the empty shader library, so every page draws
/// its fallbacks.
Widget buildStageScopes(
  Widget app, {
  ValueListenable<MotionState>? windowMotion,
}) {
  return MotionScope(
    windowMotion: windowMotion ?? createWindowMotion(MotionState.reduced),
    child: ShaderLibraryScope(library: ShaderLibrary.empty, child: app),
  );
}

/// [page] alone on the stage, as the content pane shows it, inside
/// [buildStageScopes] over [windowMotion].
Widget buildStagePage(
  Widget page, {
  ValueListenable<MotionState>? windowMotion,
}) {
  final Widget app = MaterialApp(
    theme: buildStageTheme(),
    builder: (BuildContext context, Widget? child) {
      return CinematicStage(accent: StageColors.overviewAccent, child: child!);
    },
    home: Scaffold(body: page),
  );
  return buildStageScopes(app, windowMotion: windowMotion);
}

/// Pumps [page] alone on the stage with [motion] as the window's motion, and
/// settles it when motion is reduced; with motion on, the ambient glow never
/// settles.
Future<void> pumpOnStage(
  WidgetTester tester,
  Widget page, {
  MotionState motion = MotionState.reduced,
}) async {
  setStageWindowSize(tester);
  await tester.pumpWidget(
    buildStagePage(page, windowMotion: createWindowMotion(motion)),
  );
  if (motion.isReduced) {
    await tester.pumpAndSettle();
  }
}
