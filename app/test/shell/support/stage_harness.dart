import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_event.dart';
import 'package:magic_free_disk_space/cleaner/cleaner_bridge.dart';
import 'package:magic_free_disk_space/cleaner/cleaner_controller.dart';
import 'package:magic_free_disk_space/design/cinematic_stage.dart';
import 'package:magic_free_disk_space/design/motion.dart';
import 'package:magic_free_disk_space/design/shaders/shader_library.dart';
import 'package:magic_free_disk_space/design/stage_theme.dart';
import 'package:magic_free_disk_space/design/tokens.dart';
import 'package:magic_free_disk_space/link/url_opener.dart';
import 'package:magic_free_disk_space/shell/app_shell.dart';
import 'package:magic_free_disk_space/shell/destination_stage.dart';
import 'package:magic_free_disk_space/shell/navigation_controller.dart';
import 'package:magic_free_disk_space/update/update_controller.dart';

import '../../design/support/design_harness.dart';
import '../../support/fake_cleaner_bridge.dart';
import '../../support/fake_update_bridge.dart';
import '../../support/sample_events.dart';

/// A window tall enough that every page builds all of its cards.
const Size stageWindowSize = Size(1440, 2800);

ScannedEvent loadSampleScan() {
  return loadFirstSampleEvent<ScannedEvent>();
}

/// The first of the sample events of type [TEvent].
TEvent loadFirstSampleEvent<TEvent extends BridgeEvent>() {
  return loadSampleEvents().whereType<TEvent>().first;
}

/// A cleaner on [bridge] that starts its scan at once, as the app's does;
/// disposed at tear-down.
CleanerController startScanningCleaner(CleanerBridge bridge) {
  final CleanerController controller = CleanerController(bridge: bridge);
  addTearDown(controller.dispose);
  unawaited(controller.scan());
  return controller;
}

/// An update controller whose check found no newer release, with the switch
/// on; disposed at tear-down.
UpdateController createQuietUpdateController() {
  final UpdateController controller = UpdateController(
    bridge: FakeUpdateBridge(
      answerCheck: () async =>
          const UpdateCheckedEvent(isUpdateCheckEnabled: true, notice: null),
    ),
  );
  addTearDown(controller.dispose);
  return controller;
}

/// A navigation controller disposed at tear-down.
NavigationController createNavigation() {
  final NavigationController navigation = NavigationController();
  addTearDown(navigation.dispose);
  return navigation;
}

/// The sample scan as its JSON, for a test to change before
/// [parseScanJson].
Map<String, Object?> loadSampleScanJson() {
  for (final String line in loadSampleLines()) {
    final Map<String, Object?> json = jsonDecode(line) as Map<String, Object?>;
    if (json['kind'] == 'scanned') {
      return json;
    }
  }
  throw StateError('The sample events hold no scan.');
}

ScannedEvent parseScanJson(Map<String, Object?> json) {
  return parseBridgeEvent(json) as ScannedEvent;
}

/// The JSON maps of every selectable item of a scan's [json].
List<Map<String, Object?>> listScanItemJsons(Map<String, Object?> json) {
  final List<Map<String, Object?>> items = [];
  for (final Object? section in json['sections']! as List<Object?>) {
    final Map<String, Object?> sectionJson = section! as Map<String, Object?>;
    items.addAll((sectionJson['items']! as List<Object?>).cast());
    final Object? checkGroup = sectionJson['checkGroup'];
    if (checkGroup is Map<String, Object?>) {
      items.addAll((checkGroup['items']! as List<Object?>).cast());
    }
  }
  final Map<String, Object?> explore = json['explore']! as Map<String, Object?>;
  items.addAll((explore['items']! as List<Object?>).cast());
  return items;
}

/// The JSON maps of the advice items of a scan's [json].
List<Map<String, Object?>> listScanAdviceJsons(Map<String, Object?> json) {
  final Map<String, Object?> explore = json['explore']! as Map<String, Object?>;
  final Map<String, Object?> adviceGroup =
      explore['adviceGroup']! as Map<String, Object?>;
  return (adviceGroup['items']! as List<Object?>).cast();
}

/// Sets the scan's window, and resets it at tear-down.
void setStageWindowSize(WidgetTester tester) {
  tester.view.physicalSize = stageWindowSize;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
}

/// Wraps [app] in what main gives it: a [MotionScope] with motion reduced
/// and the empty shader library, so every page draws its fallbacks.
Widget buildStageScopes(Widget app) {
  return MotionScope(
    windowMotion: createWindowMotion(MotionState.reduced),
    child: ShaderLibraryScope(library: ShaderLibrary.empty, child: app),
  );
}

/// Pumps [page] alone on the stage, as the content pane shows it.
Future<void> pumpOnStage(WidgetTester tester, Widget page) async {
  setStageWindowSize(tester);
  await tester.pumpWidget(
    buildStageScopes(
      MaterialApp(
        theme: buildStageTheme(),
        builder: (BuildContext context, Widget? child) {
          return CinematicStage(accent: StageColors.overviewAccent, child: child!);
        },
        home: Scaffold(body: page),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// Pumps the whole shell as the app shows it, and lets the first requests
/// answer.
Future<void> pumpAppShell(
  WidgetTester tester, {
  required CleanerController cleanerController,
  required UpdateController updateController,
  required NavigationController navigation,
  required UrlOpener urlOpener,
}) async {
  setStageWindowSize(tester);
  await tester.pumpWidget(
    buildStageScopes(
      MaterialApp(
        theme: buildStageTheme(),
        builder: (BuildContext context, Widget? child) {
          return DestinationStage(navigation: navigation, child: child!);
        },
        home: AppShell(
          cleanerController: cleanerController,
          updateController: updateController,
          navigation: navigation,
          urlOpener: urlOpener,
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> tapAndSettle(WidgetTester tester, Finder finder) async {
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

/// A cleaner bridge that answers as [inner] does, except that a scan it
/// [isHoldingScan] for reports [heldProgress] and waits for
/// [completeHeldScan], and a delete waits for [completeHeldDelete] while
/// [isHoldingDelete].
final class HoldingCleanerBridge implements CleanerBridge {
  HoldingCleanerBridge({
    required this.inner,
    this.isHoldingScan = false,
    this.heldProgress,
    this.isHoldingDelete = false,
  });

  final FakeCleanerBridge inner;
  bool isHoldingScan;
  ProgressEvent? heldProgress;
  bool isHoldingDelete;
  final Completer<ScanAnswer> _heldScan = Completer<ScanAnswer>();
  final Completer<DeleteAnswer> _heldDelete = Completer<DeleteAnswer>();

  void completeHeldScan(ScanAnswer answer) {
    _heldScan.complete(answer);
  }

  void completeHeldDelete(DeleteAnswer answer) {
    _heldDelete.complete(answer);
  }

  @override
  Future<StatusAnswer> status() {
    return inner.status();
  }

  @override
  Future<ScanAnswer> scan({
    required void Function(ProgressEvent progress) onProgress,
  }) {
    if (!isHoldingScan) {
      return inner.scan(onProgress: onProgress);
    }
    final ProgressEvent? progress = heldProgress;
    if (progress != null) {
      onProgress(progress);
    }
    return _heldScan.future;
  }

  @override
  Future<PlanAnswer> plan(List<int> numbers) {
    return inner.plan(numbers);
  }

  @override
  Future<DeleteAnswer> delete({
    required int planId,
    required String confirmation,
  }) {
    if (!isHoldingDelete) {
      return inner.delete(planId: planId, confirmation: confirmation);
    }
    return _heldDelete.future;
  }
}
