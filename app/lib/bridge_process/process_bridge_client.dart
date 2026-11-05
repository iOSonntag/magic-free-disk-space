import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:io';

import '../bridge/bridge_event.dart';
import '../bridge/bridge_request.dart';
import '../cleaner/cleaner_bridge.dart';
import '../update/update_bridge.dart';

const String bridgeExecutableName = 'magic-free-disk-space-bridge';
const int _stderrTailLength = 5;

/// A request whose answer must be a [TAnswer].
final class _QueuedRequest<TAnswer extends BridgeEvent> {
  _QueuedRequest({required this.request, required this.onProgress}) {
    // A dispose fails a request whose caller may not await it yet, which
    // would count as an uncaught error.
    completer.future.ignore();
  }

  final Map<String, Object> request;
  final void Function(ProgressEvent progress) onProgress;
  final Completer<TAnswer> completer = Completer<TAnswer>();

  /// Completes the request with [event] when it is a [TAnswer]; answers
  /// whether it was.
  bool completeWithAnswer(BridgeEvent event) {
    if (event case final TAnswer answer) {
      completer.complete(answer);
      return true;
    }
    return false;
  }
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

/// The client was disposed while a request waited for its answer.
final class BridgeClientDisposedException implements Exception {
  const BridgeClientDisposedException();

  @override
  String toString() {
    return 'The bridge was stopped while a request waited for its answer.';
  }
}

/// The bridge in the app's `Contents/MacOS` folder, beside the app's own
/// [resolvedExecutable].
String buildBundledBridgePath(String resolvedExecutable) {
  return '${File(resolvedExecutable).parent.path}/$bridgeExecutableName';
}

/// Talks to the bridge executable, starting it on the first request and again
/// after it exited. The protocol carries no request ids, so requests wait in
/// a queue and each is sent after the answer of the one before, in the order
/// they were made. An answer of a kind its request cannot have throws a
/// [FormatException].
class ProcessBridgeClient implements CleanerBridge, UpdateBridge {
  ProcessBridgeClient({required this.executablePath});

  final String executablePath;
  Process? _process;
  _QueuedRequest<BridgeEvent>? _pending;
  final Queue<_QueuedRequest<BridgeEvent>> _waiting = Queue();
  bool _isDisposed = false;
  final List<String> _stderrTail = [];

  @override
  Future<ScanAnswer> scan({
    required void Function(ProgressEvent progress) onProgress,
  }) {
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

  @override
  Future<StatusAnswer> status() {
    return _send<StatusAnswer>(buildStatusRequest());
  }

  @override
  Future<UpdateCheckAnswer> checkUpdate() {
    return _send<UpdateCheckAnswer>(buildCheckUpdateRequest());
  }

  @override
  Future<UpdateCheckSetAnswer> setUpdateCheck(bool isEnabled) {
    return _send<UpdateCheckSetAnswer>(buildSetUpdateCheckRequest(isEnabled));
  }

  /// Stops the bridge for good and fails the pending and every waiting request
  /// with a [BridgeClientDisposedException]; a later request throws a
  /// [StateError].
  void dispose() {
    _isDisposed = true;
    _stopBridge();
    final List<_QueuedRequest<BridgeEvent>> unanswered = [
      ?_pending,
      ..._waiting,
    ];
    _pending = null;
    _waiting.clear();
    for (final _QueuedRequest<BridgeEvent> queued in unanswered) {
      queued.completer.completeError(const BridgeClientDisposedException());
    }
  }

  /// Stops the bridge; its later lines answer no request, and the next
  /// request starts a new one.
  void _stopBridge() {
    _process?.kill();
    _process = null;
  }

  /// Queues [request] before its first `await`, so requests leave in the
  /// order they were made.
  Future<TAnswer> _send<TAnswer extends BridgeEvent>(
    Map<String, Object> request, {
    void Function(ProgressEvent progress)? onProgress,
  }) async {
    if (_isDisposed) {
      throw StateError('The bridge client is disposed.');
    }
    final _QueuedRequest<TAnswer> queued = _QueuedRequest<TAnswer>(
      request: request,
      onProgress: onProgress ?? (ProgressEvent _) {},
    );
    _waiting.add(queued);
    _sendNextRequest();
    return queued.completer.future;
  }

  void _sendNextRequest() {
    if (_pending != null || _waiting.isEmpty) {
      return;
    }
    final _QueuedRequest<BridgeEvent> next = _waiting.removeFirst();
    _pending = next;
    unawaited(_writeRequest(next));
  }

  Future<void> _writeRequest(_QueuedRequest<BridgeEvent> queued) async {
    try {
      final Process process = _process ?? await _start();
      process.stdin.writeln(jsonEncode(queued.request));
    } catch (error, stackTrace) {
      // A dispose meanwhile already failed the request.
      if (identical(_pending, queued)) {
        _failPendingRequest(error, stackTrace);
      }
    }
  }

  void _failPendingRequest(Object error, [StackTrace? stackTrace]) {
    final _QueuedRequest<BridgeEvent>? pending = _pending;
    if (pending == null) {
      return;
    }
    _pending = null;
    pending.completer.completeError(error, stackTrace);
    _sendNextRequest();
  }

  Future<Process> _start() async {
    final Process process = await Process.start(executablePath, const []);
    if (_isDisposed) {
      process.kill();
      throw const BridgeClientDisposedException();
    }
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
        .listen((String line) => _keepStderrLine(process, line))
        .asFuture<void>();
    unawaited(_watchExit(process, stdoutDone, stderrDone));
    return process;
  }

  void _answerPendingRequest(Process process, String line) {
    final _QueuedRequest<BridgeEvent>? pending = _pending;
    if (pending == null || !identical(_process, process)) {
      return;
    }
    final BridgeEvent event;
    try {
      event = parseBridgeEvent(jsonDecode(line));
    } catch (error, stackTrace) {
      // The bridge's next lines may still answer this request, so the next
      // request goes to a new bridge.
      _stopBridge();
      _failPendingRequest(error, stackTrace);
      return;
    }
    if (event is ProgressEvent) {
      pending.onProgress(event);
      return;
    }
    if (event case FailedEvent(effect: FailureEffect.bridgeStopping)) {
      _stopBridge();
    }
    _pending = null;
    if (!pending.completeWithAnswer(event)) {
      // A bridge that answers another request holds a state the app no
      // longer knows, so the next request goes to a new bridge.
      _stopBridge();
      pending.completer.completeError(
        FormatException(
          'The bridge answered the ${pending.request['kind']} request with ${event.runtimeType}.',
        ),
      );
    }
    _sendNextRequest();
  }

  /// Keeps [line] only while [process] is the current bridge, so a stopped
  /// bridge's last lines never reach the tail of the next one.
  void _keepStderrLine(Process process, String line) {
    if (!identical(_process, process)) {
      return;
    }
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
    _failPendingRequest(
      BridgeStoppedException(
        exitCode: exitCode,
        stderrText: _stderrTail.isEmpty
            ? 'It wrote nothing to stderr.'
            : _stderrTail.join('\n'),
      ),
    );
  }
}
