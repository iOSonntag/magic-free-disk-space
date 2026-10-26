import 'package:flutter/material.dart';

import 'bridge/bridge_client.dart';
import 'cleaner/cleaner_controller.dart';
import 'cleaner/cleaner_page.dart';

void main() {
  runApp(const MagicFreeDiskSpaceApp());
}

class MagicFreeDiskSpaceApp extends StatefulWidget {
  const MagicFreeDiskSpaceApp({super.key});

  @override
  State<MagicFreeDiskSpaceApp> createState() => _MagicFreeDiskSpaceAppState();
}

class _MagicFreeDiskSpaceAppState extends State<MagicFreeDiskSpaceApp> {
  final ProcessBridgeClient _bridgeClient = ProcessBridgeClient(
    executablePath: buildBundledBridgePath(),
  );
  late final CleanerController _controller = CleanerController(
    bridge: _bridgeClient,
  );

  @override
  void dispose() {
    _controller.dispose();
    _bridgeClient.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Magic Free Disk Space',
      theme: ThemeData(colorSchemeSeed: Colors.teal),
      darkTheme: ThemeData(
        colorSchemeSeed: Colors.teal,
        brightness: Brightness.dark,
      ),
      home: CleanerPage(controller: _controller),
    );
  }
}
