import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_event.dart';
import 'package:magic_free_disk_space/bridge_process/process_bridge_client.dart';

const String _scannedLine =
    '{"kind":"scanned","summaryText":"%s","candidates":[],"notesLines":[]}';

void main() {
  late Directory directory;
  late ProcessBridgeClient client;

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('bridge_client_test');
  });

  tearDown(() async {
    client.dispose();
    await directory.delete(recursive: true);
  });

  /// A shell script in place of the bridge; `$start` counts its starts.
  Future<ProcessBridgeClient> createClientOverScript(String body) async {
    final File script = File('${directory.path}/fake-bridge');
    await script.writeAsString('''
#!/bin/sh
starts_file="\$(dirname "\$0")/starts"
start=\$(( \$(cat "\$starts_file" 2>/dev/null || echo 0) + 1 ))
echo "\$start" > "\$starts_file"
$body
''');
    await Process.run('chmod', ['+x', script.path]);
    return ProcessBridgeClient(executablePath: script.path);
  }

  String buildScannedLine(String summaryText) {
    return _scannedLine.replaceFirst('%s', summaryText);
  }

  test('a line that is no event fails the request, and its bridge answers no later one', () async {
    client = await createClientOverScript('''
while read -r request; do
  if [ "\$start" = 1 ]; then
    echo 'not json'
    sleep 0.3
    echo '${buildScannedLine('stale')}'
  else
    echo '${buildScannedLine('fresh')}'
  fi
done
''');

    await expectLater(
      client.scan(onProgress: (String _) {}),
      throwsFormatException,
    );
    final ScanAnswer answer = await client.scan(onProgress: (String _) {});

    expect((answer as ScannedEvent).summaryText, 'fresh');
  });

  test('a bridge that exits fails the request with its stderr, and the next request starts it again', () async {
    client = await createClientOverScript('''
while read -r request; do
  if [ "\$start" = 1 ]; then
    echo 'the bridge broke' >&2
    exit 3
  fi
  echo '{"kind":"nothingApproved","lines":[]}'
done
''');

    await expectLater(
      client.scan(onProgress: (String _) {}),
      throwsA(
        isA<BridgeStoppedException>()
            .having((error) => error.exitCode, 'exitCode', 3)
            .having(
              (error) => error.stderrText,
              'stderrText',
              'the bridge broke',
            ),
      ),
    );
    final PlanAnswer answer = await client.plan([1]);

    expect(answer, isA<NothingApprovedEvent>());
  });

  test('an answer of another request fails with a FormatException', () async {
    client = await createClientOverScript('''
while read -r request; do
  echo '{"kind":"cancelled","message":"Cancelled. Nothing was deleted."}'
done
''');

    await expectLater(
      client.scan(onProgress: (String _) {}),
      throwsFormatException,
    );
  });

  test('passes the progress on and answers with the final event', () async {
    client = await createClientOverScript('''
while read -r request; do
  echo '{"kind":"progress","message":"Measuring apps…"}'
  echo '${buildScannedLine('done')}'
done
''');
    final List<String> progress = [];

    final ScanAnswer answer = await client.scan(onProgress: progress.add);

    expect(progress, ['Measuring apps…']);
    expect((answer as ScannedEvent).summaryText, 'done');
  });
}
