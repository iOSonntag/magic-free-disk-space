// The fake bridge is a `/bin/sh` script made executable with chmod.
@TestOn('!windows')
library;

import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:magic_free_disk_space/bridge/bridge_event.dart';
import 'package:magic_free_disk_space/bridge_process/process_bridge_client.dart';

const String _scannedLine =
    '{"kind":"scanned","summary":{"titleText":"","lines":[],"totalBytes":%d,'
    '"safeBytes":0,"disk":null},"sections":[],"sectionTotals":[],'
    '"explore":null,"safeNumbers":[],"skipped":null,"notices":[]}';

// Each total marks which answer of the fake bridge a scan is.
const int staleTotalBytes = 1;
const int freshTotalBytes = 2;
const int doneTotalBytes = 3;

void ignoreProgress(ProgressEvent _) {}

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

  String buildScannedLine(int totalBytes) {
    return _scannedLine.replaceFirst('%d', '$totalBytes');
  }

  test('a line that is no event fails the request, and its bridge answers no later one', () async {
    client = await createClientOverScript('''
while read -r request; do
  if [ "\$start" = 1 ]; then
    echo 'not json'
    sleep 0.3
    echo '${buildScannedLine(staleTotalBytes)}'
  else
    echo '${buildScannedLine(freshTotalBytes)}'
  fi
done
''');

    await expectLater(
      client.scan(onProgress: ignoreProgress),
      throwsFormatException,
    );
    final ScanAnswer answer = await client.scan(
      onProgress: ignoreProgress,
    );

    expect((answer as ScannedEvent).summary.totalBytes, freshTotalBytes);
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
      client.scan(onProgress: ignoreProgress),
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

  test(
    'the stderr of a stopped bridge stays out of the next bridge\'s failure',
    () async {
      // The stopped bridge writes its line only once the next bridge runs, and
      // the next bridge exits only after that line was written.
      client = await createClientOverScript('''
marker="\$(dirname "\$0")/old-written"
if [ "\$start" = 1 ]; then
  trap 'sleep 0.2; echo old >&2; touch "\$marker"; kill \$! 2>/dev/null; exit 0' TERM
  echo 'not json'
  sleep 5 &
  wait
  exit 0
fi
read -r request
while [ ! -f "\$marker" ]; do sleep 0.05; done
sleep 0.2
exit 1
''');

      final Future<ScanAnswer> scan = client.scan(
        onProgress: ignoreProgress,
      );
      final Future<StatusAnswer> status = client.status();

      await expectLater(scan, throwsFormatException);
      await expectLater(
        status,
        throwsA(
          isA<BridgeStoppedException>()
              .having((error) => error.exitCode, 'exitCode', 1)
              .having(
                (error) => error.stderrText,
                'stderrText',
                'It wrote nothing to stderr.',
              ),
        ),
      );
    },
  );

  test('an answer of another request fails with a FormatException, and the next request goes to a new bridge', () async {
    client = await createClientOverScript('''
while read -r request; do
  if [ "\$start" = 1 ]; then
    echo '{"kind":"cancelled","message":"Cancelled. Nothing was deleted."}'
  else
    echo '${buildScannedLine(freshTotalBytes)}'
  fi
done
''');

    await expectLater(
      client.scan(onProgress: ignoreProgress),
      throwsFormatException,
    );
    final ScanAnswer answer = await client.scan(
      onProgress: ignoreProgress,
    );

    expect((answer as ScannedEvent).summary.totalBytes, freshTotalBytes);
  });

  test('dispose fails the pending request', () async {
    client = await createClientOverScript('''
while read -r request; do
  echo '{"kind":"progress","message":"Measuring apps…","phase":"apps","found":[]}'
  sleep 5
done
''');
    final Completer<void> progressSeen = Completer<void>();
    final Future<ScanAnswer> answer = client.scan(
      onProgress: (ProgressEvent _) => progressSeen.complete(),
    );
    await progressSeen.future;

    client.dispose();

    await expectLater(answer, throwsA(isA<BridgeClientDisposedException>()));
  });

  test(
    'dispose while the bridge starts fails the request and stops the bridge',
    () async {
      client = await createClientOverScript('''
while read -r request; do
  sleep 5
done
''');
      final Future<ScanAnswer> answer = client.scan(
        onProgress: ignoreProgress,
      );

      client.dispose();

      await expectLater(answer, throwsA(isA<BridgeClientDisposedException>()));
      await Future<void>.delayed(const Duration(milliseconds: 300));
      final ProcessResult search = await Process.run('pgrep', [
        '-f',
        '${directory.path}/fake-bridge',
      ]);
      // pgrep exits with 1 when no process matches.
      expect(search.exitCode, 1, reason: 'the bridge still runs');
    },
  );

  test('sends a second request only after the answer of the first, and answers both in order', () async {
    // A line that is already waiting while the first request is answered
    // means the client sent the second request too early.
    client = await createClientOverScript('''
while read -r request; do
  if read -t 1 early_request; then
    echo "\$early_request" >> "\$(dirname "\$0")/early"
  fi
  if [ "\$request" = '{"kind":"status"}' ]; then
    echo '{"kind":"status","fullDiskAccess":"granted","notices":[]}'
  else
    echo '{"kind":"updateChecked","isUpdateCheckEnabled":true,"notice":null}'
  fi
done
''');
    final List<String> answeredKinds = [];

    final Future<StatusAnswer> status = client.status().then((answer) {
      answeredKinds.add('status');
      return answer;
    });
    final Future<UpdateCheckAnswer> check = client.checkUpdate().then((answer) {
      answeredKinds.add('checkUpdate');
      return answer;
    });

    expect(await status, isA<StatusEvent>());
    expect(await check, isA<UpdateCheckedEvent>());
    expect(answeredKinds, ['status', 'checkUpdate']);
    expect(File('${directory.path}/early').existsSync(), isFalse);
  });

  test('a request queued behind one whose answer stops the bridge goes to a new bridge', () async {
    client = await createClientOverScript('''
while read -r request; do
  if [ "\$start" = 1 ]; then
    echo '{"kind":"cancelled","message":"Cancelled. Nothing was deleted."}'
  else
    echo '{"kind":"updateCheckSet","isUpdateCheckEnabled":false}'
  fi
done
''');

    final Future<ScanAnswer> scan = client.scan(
      onProgress: ignoreProgress,
    );
    final Future<UpdateCheckSetAnswer> save = client.setUpdateCheck(false);

    await expectLater(scan, throwsFormatException);
    expect(
      await save,
      isA<UpdateCheckSetEvent>().having(
        (event) => event.isUpdateCheckEnabled,
        'isUpdateCheckEnabled',
        isFalse,
      ),
    );
  });

  test('dispose fails every waiting request', () async {
    client = await createClientOverScript('''
while read -r request; do
  sleep 5
done
''');
    final Future<StatusAnswer> status = client.status();
    final Future<UpdateCheckAnswer> check = client.checkUpdate();

    client.dispose();

    await expectLater(status, throwsA(isA<BridgeClientDisposedException>()));
    await expectLater(check, throwsA(isA<BridgeClientDisposedException>()));
  });

  test('passes the progress on and answers with the final event', () async {
    client = await createClientOverScript('''
while read -r request; do
  echo '{"kind":"progress","message":"Measuring apps…","phase":"apps","found":[]}'
  echo '${buildScannedLine(doneTotalBytes)}'
done
''');
    final List<ProgressEvent> progress = [];

    final ScanAnswer answer = await client.scan(onProgress: progress.add);

    expect(progress.map((ProgressEvent event) => event.message), [
      'Measuring apps…',
    ]);
    expect(progress.single.phase, ScanPhase.apps);
    expect((answer as ScannedEvent).summary.totalBytes, doneTotalBytes);
  });

  test('sends the status request and answers with the status event', () async {
    client = await createClientOverScript('''
while read -r request; do
  if [ "\$request" = '{"kind":"status"}' ]; then
    echo '{"kind":"status","fullDiskAccess":"granted","notices":[]}'
  else
    echo '{"kind":"failed","message":"Unknown request.","effect":"scanKept"}'
  fi
done
''');

    final StatusAnswer answer = await client.status();

    final StatusEvent status = answer as StatusEvent;
    expect(status.fullDiskAccess, FullDiskAccess.granted);
    expect(status.notices, isEmpty);
  });

  /// A bridge that cannot start on its first run and answers every request
  /// with a scan on later runs.
  final String failingFirstStartScript =
      '''
if [ "\$start" = 1 ]; then
  echo '{"kind":"failed","message":"The bridge could not start.","effect":"bridgeStopping"}'
  sleep 0.3
  exit 2
fi
while read -r request; do
  echo '${buildScannedLine(freshTotalBytes)}'
done
''';

  test('a failed status whose bridge stops leads the next request to a new bridge that answers', () async {
    client = await createClientOverScript(failingFirstStartScript);

    final StatusAnswer status = await client.status();
    final ScanAnswer answer = await client.scan(
      onProgress: ignoreProgress,
    );

    expect(
      status,
      isA<FailedEvent>().having(
        (failed) => failed.effect,
        'effect',
        FailureEffect.bridgeStopping,
      ),
    );
    expect((answer as ScannedEvent).summary.totalBytes, freshTotalBytes);
  });

  test('a failed scan whose bridge stops leads the next request to a new bridge that answers', () async {
    client = await createClientOverScript(failingFirstStartScript);

    final ScanAnswer failed = await client.scan(
      onProgress: ignoreProgress,
    );
    final ScanAnswer answer = await client.scan(
      onProgress: ignoreProgress,
    );

    expect(failed, isA<FailedEvent>());
    expect((answer as ScannedEvent).summary.totalBytes, freshTotalBytes);
  });
}
