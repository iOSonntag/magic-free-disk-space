import 'dart:async';
import 'dart:convert';
import 'dart:io';

import '../bridge/bridge_event.dart';
import '../bridge/bridge_request.dart';
import '../cleaner/cleaner_controller.dart';

const String bridgeExecutableName = 'magic-free-disk-space-bridge';
const int _stderrTailLength = 5;

final class _PendingRequest {
  _PendingRequest({required this.onProgress});

  final void Function(String message) onProgress;
  final Completer<BridgeEvent> completer = Completer<BridgeEvent>();
}

/// The bridge exited while a request waited for its answer.
final class BridgeStoppedException implements Exception {
  const BridgeStoppedException({
    required this.exitCode,
    required this.stderrText,
  });

  final int exitCode;
  final String stderrText;

  @override
  String toString() {
    return 'The bridge stopped with exit code $exitCode.\n$stderrText';
  }
}

/// The bridge in the app's `Contents/MacOS` folder, beside the app's own
/// [resolvedExecutable].
String buildBundledBridgePath(String resolvedExecutable) {
  return '${File(resolvedExecutable).parent.path}/$bridgeExecutableName';
}

/// Talks to the bridge executable, starting it on the first request and again
/// after it exited. An answer of a kind its request cannot have throws a
/// [FormatException].
class ProcessBridgeClient implements CleanerBridge {
  ProcessBridgeClient({required this.executablePath});

  final String executablePath;
  Process? _process;
  _PendingRequest? _pending;
  final List<String> _stderrTail = [];

  @override
  Future<ScanAnswer> scan({required void Function(String message) onProgress}) {
    return _send<ScanAnswer>(buildScanRequest(), onProgress: onProgress);
  }

  @override
  Future<PlanAnswer> plan(List<int> numbers) {
    return _send<PlanAnswer>(buildPlanRequest(numbers));
  }

  @override
  Future<DeleteAnswer> delete({
    required int planId,
    required String confirmation,
  }) {
    return _send<DeleteAnswer>(
      buildDeleteRequest(planId: planId, confirmation: confirmation),
    );
  }

  /// Stops the bridge; its later lines answer no request.
  void dispose() {
    _process?.kill();
    _process = null;
  }

  Future<TAnswer> _send<TAnswer>(
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
    final BridgeEvent answer = await pending.completer.future;
    if (answer case final TAnswer typedAnswer) {
      return typedAnswer;
    }
    throw FormatException(
      'The bridge answered the ${request['kind']} request with ${answer.runtimeType}.',
    );
  }

  Future<Process> _start() async {
    final Process process = await Process.start(executablePath, const []);
    _process = process;
    _stderrTail.clear();
    process.stdin.done.ignore();
    final Future<void> stdoutDone = process.stdout
        .transform(utf8.decoder)
        .transform(const LineSplitter())
        .listen((String line) => _answerPendingRequest(process, line))
        .asFuture<void>();
    final Future<void> stderrDone = process.stderr
        .transform(utf8.decoder)
        .transform(const LineSplitter())
        .listen(_keepStderrLine)
        .asFuture<void>();
    unawaited(_watchExit(process, stdoutDone, stderrDone));
    return process;
  }

  void _answerPendingRequest(Process process, String line) {
    final _PendingRequest? pending = _pending;
    if (pending == null || !identical(_process, process)) {
      return;
    }
    final BridgeEvent event;
    try {
      event = parseBridgeEvent(jsonDecode(line));
    } catch (error, stackTrace) {
      // The bridge's next lines may still answer this request, so the next
      // request goes to a new bridge.
      dispose();
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
    pending.completer.completeError(
      BridgeStoppedException(
        exitCode: exitCode,
        stderrText: _stderrTail.isEmpty
            ? 'It wrote nothing to stderr.'
            : _stderrTail.join('\n'),
      ),
    );
  }
}
