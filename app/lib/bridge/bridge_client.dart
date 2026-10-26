import 'dart:async';
import 'dart:convert';
import 'dart:io';

import '../cleaner/cleaner_controller.dart';
import 'bridge_event.dart';
import 'bridge_request.dart';

const String bridgeExecutableName = 'magic-free-disk-space-bridge';
const int _stderrTailLength = 5;

final class _PendingRequest {
  _PendingRequest({required this.onProgress});

  final void Function(String message) onProgress;
  final Completer<BridgeEvent> completer = Completer<BridgeEvent>();
}

/// The bridge in the app's `Contents/MacOS` folder, beside the app's own
/// executable.
String buildBundledBridgePath() {
  return '${File(Platform.resolvedExecutable).parent.path}/$bridgeExecutableName';
}

/// Talks to the bridge executable, starting it on the first request and again
/// after it exited.
class ProcessBridgeClient implements CleanerBridge {
  ProcessBridgeClient({required this.executablePath});

  final String executablePath;
  Process? _process;
  _PendingRequest? _pending;
  final List<String> _stderrTail = [];

  @override
  Future<BridgeEvent> scan({
    required void Function(String message) onProgress,
  }) {
    return _send(buildScanRequest(), onProgress: onProgress);
  }

  @override
  Future<BridgeEvent> plan(List<int> numbers) {
    return _send(buildPlanRequest(numbers));
  }

  @override
  Future<BridgeEvent> delete({
    required int planId,
    required String confirmation,
  }) {
    return _send(
      buildDeleteRequest(planId: planId, confirmation: confirmation),
    );
  }

  void dispose() {
    _process?.kill();
    _process = null;
  }

  Future<BridgeEvent> _send(
    Map<String, Object> request, {
    void Function(String message)? onProgress,
  }) async {
    if (_pending != null) {
      throw StateError('A request to the bridge is still pending.');
    }
    final _PendingRequest pending = _PendingRequest(
      onProgress: onProgress ?? (String _) {},
    );
    _pending = pending;
    try {
      final Process process = _process ?? await _start();
      process.stdin.writeln(jsonEncode(request));
    } on Object {
      _pending = null;
      rethrow;
    }
    return pending.completer.future;
  }

  Future<Process> _start() async {
    final Process process = await Process.start(executablePath, const []);
    _process = process;
    _stderrTail.clear();
    process.stdin.done.ignore();
    final Future<void> stdoutDone = process.stdout
        .transform(utf8.decoder)
        .transform(const LineSplitter())
        .listen(_handleLine)
        .asFuture<void>();
    final Future<void> stderrDone = process.stderr
        .transform(utf8.decoder)
        .transform(const LineSplitter())
        .listen(_keepStderrLine)
        .asFuture<void>();
    unawaited(_watchExit(process, stdoutDone, stderrDone));
    return process;
  }

  void _handleLine(String line) {
    final _PendingRequest? pending = _pending;
    if (pending == null) {
      return;
    }
    final BridgeEvent event;
    try {
      event = parseBridgeEvent(jsonDecode(line));
    } catch (error, stackTrace) {
      _pending = null;
      pending.completer.completeError(error, stackTrace);
      return;
    }
    if (event is ProgressEvent) {
      pending.onProgress(event.message);
      return;
    }
    _pending = null;
    pending.completer.complete(event);
  }

  void _keepStderrLine(String line) {
    _stderrTail.add(line);
    if (_stderrTail.length > _stderrTailLength) {
      _stderrTail.removeAt(0);
    }
  }

  Future<void> _watchExit(
    Process process,
    Future<void> stdoutDone,
    Future<void> stderrDone,
  ) async {
    try {
      await Future.wait([stdoutDone, stderrDone]);
    } catch (_) {
      // A broken pipe ends the streams early; the exit code below still tells.
    }
    final int exitCode = await process.exitCode;
    if (!identical(_process, process)) {
      return;
    }
    _process = null;
    final _PendingRequest? pending = _pending;
    if (pending == null) {
      return;
    }
    _pending = null;
    final String stderrText = _stderrTail.isEmpty
        ? 'It wrote nothing to stderr.'
        : _stderrTail.join('\n');
    pending.completer.complete(
      FailedEvent(
        message: 'The bridge stopped with exit code $exitCode.\n$stderrText',
        isScanDropped: true,
      ),
    );
  }
}
