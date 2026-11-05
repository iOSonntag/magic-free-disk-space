import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';

import 'bridge_process/process_bridge_client.dart';
import 'cleaner/cleaner_controller.dart';
import 'cleaner/cleaner_page.dart';
import 'design/font_licenses.dart';
import 'design/motion.dart';
import 'design/shaders/shader_library.dart';
import 'link_process/process_url_opener.dart';
import 'update/update_banner.dart';
import 'update/update_check_menu.dart';
import 'update/update_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  registerBundledFontLicenses();
  final ShaderLibrary shaderLibrary = await ShaderLibrary.load();
  final WindowMotionChannel windowMotion = WindowMotionChannel();
  unawaited(windowMotion.connect());
  runApp(
    MotionScope(
      windowMotion: windowMotion,
      child: ShaderLibraryScope(library: shaderLibrary, child: const MagicFreeDiskSpaceApp()),
    ),
  );
}

class MagicFreeDiskSpaceApp extends StatefulWidget {
  const MagicFreeDiskSpaceApp({super.key});

  @override
  State<MagicFreeDiskSpaceApp> createState() => _MagicFreeDiskSpaceAppState();
}

class _MagicFreeDiskSpaceAppState extends State<MagicFreeDiskSpaceApp> {
  final ProcessBridgeClient _bridgeClient = ProcessBridgeClient(
    executablePath: buildBundledBridgePath(Platform.resolvedExecutable),
  );
  late final CleanerController _cleanerController;
  late final UpdateController _updateController;

  @override
  void initState() {
    super.initState();
    // Each controller queues its first request when created, and the status
    // must not wait behind the update check's fetch.
    _cleanerController = CleanerController(bridge: _bridgeClient);
    _updateController = UpdateController(bridge: _bridgeClient);
  }

  @override
  void dispose() {
    _cleanerController.dispose();
    _updateController.dispose();
    _bridgeClient.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const ProcessUrlOpener urlOpener = ProcessUrlOpener();
    return MaterialApp(
      title: 'Magic Free Disk Space',
      theme: ThemeData(colorSchemeSeed: Colors.teal),
      darkTheme: ThemeData(
        colorSchemeSeed: Colors.teal,
        brightness: Brightness.dark,
      ),
      home: CleanerPage(
        controller: _cleanerController,
        urlOpener: urlOpener,
        appBarActions: [UpdateCheckMenu(controller: _updateController)],
        banner: UpdateBanner(
          controller: _updateController,
          urlOpener: urlOpener,
        ),
      ),
    );
  }
}
