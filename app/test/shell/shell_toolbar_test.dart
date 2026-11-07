import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_event.dart';
import 'package:magic_free_disk_space/cleaner/cleaner_controller.dart';
import 'package:magic_free_disk_space/shell/shell_toolbar.dart';

import 'support/stage_harness.dart';

void main() {
  testWidgets('shows the message of a phase this app does not know with one ellipsis', (
    WidgetTester tester,
  ) async {
    await pumpOnStage(
      tester,
      ShellToolbar(
        state: const ScanningState(
          progress: ProgressEvent(
            message: 'Weighing the future…',
            phase: ScanPhase.unknown,
            found: [],
          ),
        ),
        onScanAgain: () {},
      ),
    );

    expect(find.text('Weighing the future…'), findsOneWidget);
    expect(find.textContaining('……'), findsNothing);
  });

  testWidgets('adds the ellipsis to a phase the app words itself', (
    WidgetTester tester,
  ) async {
    await pumpOnStage(
      tester,
      ShellToolbar(
        state: const ScanningState(
          progress: ProgressEvent(message: 'Measuring apps…', phase: ScanPhase.apps, found: []),
        ),
        onScanAgain: () {},
      ),
    );

    expect(find.text('Measuring your apps…'), findsOneWidget);
  });
}
