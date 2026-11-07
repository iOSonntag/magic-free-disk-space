import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';

import 'bridge_process/bridge_process.dart';
import 'cleaner/cleaner.dart';
import 'design/design.dart';
import 'link/link.dart';
import 'link_process/link_process.dart';
import 'shell/shell.dart';
import 'update/update.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  registerBundledFontLicenses();
  final ShaderLibrary shaderLibrary = await ShaderLibrary.load();
  final WindowMotionChannel windowMotion = WindowMotionChannel();
  unawaited(windowMotion.connect());
  final ProcessBridgeClient bridgeClient = ProcessBridgeClient(
    executablePath: buildBundledBridgePath(Platform.resolvedExecutable),
  );
  runApp(
    MotionScope(
      windowMotion: windowMotion,
      child: ShaderLibraryScope(
        library: shaderLibrary,
        child: MagicFreeDiskSpaceApp(
          cleanerBridge: bridgeClient,
          updateBridge: bridgeClient,
          urlOpener: const ProcessUrlOpener(),
        ),
      ),
    ),
  );
}

/// The app: it starts the scan at launch and shows the shell on the stage.
class MagicFreeDiskSpaceApp extends StatefulWidget {
  const MagicFreeDiskSpaceApp({
    super.key,
    required this.cleanerBridge,
    required this.updateBridge,
    required this.urlOpener,
  });

  final CleanerBridge cleanerBridge;
  final UpdateBridge updateBridge;
  final UrlOpener urlOpener;

  @override
  State<MagicFreeDiskSpaceApp> createState() => _MagicFreeDiskSpaceAppState();
}

class _MagicFreeDiskSpaceAppState extends State<MagicFreeDiskSpaceApp> {
  late final CleanerController _cleanerController;
  late final UpdateController _updateController;
  final NavigationController _navigation = NavigationController();
  final ThemeData _theme = buildStageTheme();

  @override
  void initState() {
    super.initState();
    // Each request waits for the one before it, and the update check's fetch
    // may take seconds: the status and the scan queue first.
    _cleanerController = CleanerController(bridge: widget.cleanerBridge);
    unawaited(_cleanerController.scan());
    _updateController = UpdateController(bridge: widget.updateBridge);
  }

  @override
  void dispose() {
    _cleanerController.dispose();
    _updateController.dispose();
    _navigation.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Magic Free Disk Space',
      debugShowCheckedModeBanner: false,
      theme: _theme,
      builder: (BuildContext context, Widget? child) {
        if (child == null) {
          throw StateError('MaterialApp builds its navigator for the home page.');
        }
        return DestinationStage(navigation: _navigation, child: child);
      },
      home: AppShell(
        cleanerController: _cleanerController,
        updateController: _updateController,
        navigation: _navigation,
        urlOpener: widget.urlOpener,
      ),
    );
  }
}
