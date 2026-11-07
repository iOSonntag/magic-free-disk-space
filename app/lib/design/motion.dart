import 'package:flutter/foundation.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import 'tokens.dart';

/// Whether the app may move: Reduce Motion, and whether the window can be
/// seen at all.
@immutable
class MotionState {
  const MotionState({required this.isReduced, required this.isWindowVisible});

  /// Motion allowed in a visible window: the state while no platform says otherwise.
  static const MotionState allowed = MotionState(isReduced: false, isWindowVisible: true);
  static const MotionState reduced = MotionState(isReduced: true, isWindowVisible: true);

  /// Reduce Motion is on: counts jump, and the sweep, the dissolve, the
  /// hero flight and shader time are off.
  final bool isReduced;
  final bool isWindowVisible;

  /// Shader time, glows and particles run only while this holds.
  bool get runsAmbientEffects => !isReduced && isWindowVisible;

  /// [MotionTokens.plainFade], or no time at all while motion is reduced.
  Duration get plainFadeDuration => isReduced ? Duration.zero : MotionTokens.plainFade;

  @override
  bool operator ==(Object other) =>
      other is MotionState && other.isReduced == isReduced && other.isWindowVisible == isWindowVisible;

  @override
  int get hashCode => Object.hash(isReduced, isWindowVisible);

  @override
  String toString() => 'MotionState(isReduced: $isReduced, isWindowVisible: $isWindowVisible)';
}

const String windowMotionChannelName = 'magic_free_disk_space/window_motion';

/// Parses the state `MainFlutterWindow.swift` sends, or returns `null` for
/// any other shape.
MotionState? parseWindowMotionState(Object? arguments) {
  if (arguments is! Map) {
    return null;
  }

  final Object? reducesMotion = arguments['reducesMotion'];
  final Object? isWindowVisible = arguments['isWindowVisible'];
  if (reducesMotion is! bool || isWindowVisible is! bool) {
    return null;
  }

  return MotionState(isReduced: reducesMotion, isWindowVisible: isWindowVisible);
}

/// The macOS window's word on motion: it loads the state once and takes each
/// change the runner sends; until then, motion is allowed in a visible window.
class WindowMotionChannel implements ValueListenable<MotionState> {
  WindowMotionChannel();

  final MethodChannel _channel = const MethodChannel(windowMotionChannelName);
  final ValueNotifier<MotionState> _state = ValueNotifier<MotionState>(MotionState.allowed);
  bool _hasReceivedChange = false;

  @override
  MotionState get value => _state.value;

  @override
  void addListener(VoidCallback listener) => _state.addListener(listener);

  @override
  void removeListener(VoidCallback listener) => _state.removeListener(listener);

  /// Starts listening and loads the current state. Never throws: a missing
  /// runner channel keeps motion allowed.
  Future<void> connect() async {
    _channel.setMethodCallHandler(_receiveMotionStateChange);
    final Object? answer;
    try {
      answer = await _channel.invokeMethod<Object?>('loadMotionState');
    } on MissingPluginException {
      return;
    }

    final MotionState? loaded = parseWindowMotionState(answer);
    // A change the runner sent while the load was on its way is newer.
    if (loaded != null && !_hasReceivedChange) {
      _state.value = loaded;
    }
  }

  void dispose() {
    _channel.setMethodCallHandler(null);
    _state.dispose();
  }

  Future<void> _receiveMotionStateChange(MethodCall call) async {
    if (call.method != 'motionStateChanged') {
      throw MissingPluginException('No method ${call.method} on $windowMotionChannelName');
    }

    final MotionState? changed = parseWindowMotionState(call.arguments);
    if (changed == null) {
      return;
    }

    _hasReceivedChange = true;
    _state.value = changed;
  }
}

/// Seconds of ambient time for shaders, glows and particles. Its ticker
/// runs only while it has listeners and running is allowed, and the time
/// resumes where it stood still.
class AmbientClock extends ChangeNotifier implements ValueListenable<double> {
  AmbientClock({required TickerProvider vsync}) {
    _ticker = vsync.createTicker(_advance);
  }

  late final Ticker _ticker;
  Duration _elapsedBeforeThisRun = Duration.zero;
  Duration _elapsedInThisRun = Duration.zero;
  bool _isRunningAllowed = false;

  @override
  double get value => (_elapsedBeforeThisRun + _elapsedInThisRun).inMicroseconds / Duration.microsecondsPerSecond;

  bool get isTicking => _ticker.isActive;

  set isRunningAllowed(bool allowed) {
    _isRunningAllowed = allowed;
    _updateTicker();
  }

  @override
  void addListener(VoidCallback listener) {
    super.addListener(listener);
    _updateTicker();
  }

  @override
  void removeListener(VoidCallback listener) {
    super.removeListener(listener);
    _updateTicker();
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  void _updateTicker() {
    final bool shouldTick = _isRunningAllowed && hasListeners;
    if (shouldTick == _ticker.isActive) {
      return;
    }

    if (shouldTick) {
      _ticker.start();
      return;
    }

    _elapsedBeforeThisRun += _elapsedInThisRun;
    _elapsedInThisRun = Duration.zero;
    _ticker.stop();
  }

  void _advance(Duration elapsed) {
    _elapsedInThisRun = elapsed;
    notifyListeners();
  }
}

/// How far [ambientSeconds] of an [AmbientClock] stand into the current turn
/// of a loop of [period], from 0 up to but not 1.
double getAmbientLoopPhase(double ambientSeconds, Duration period) {
  final double periodSeconds = period.inMicroseconds / Duration.microsecondsPerSecond;
  return (ambientSeconds / periodSeconds) % 1;
}

/// The one source of motion for everything below it. It joins the window's
/// state with the engine's `disableAnimations`, pauses every ticker below
/// while the window is hidden, and owns the [AmbientClock] the shaders read.
class MotionScope extends StatefulWidget {
  const MotionScope({super.key, required this.windowMotion, required this.child});

  final ValueListenable<MotionState> windowMotion;
  final Widget child;

  /// The joined state, which rebuilds the caller when it changes. Throws a
  /// [StateError] when no [MotionScope] is above [context].
  static MotionState of(BuildContext context) {
    final _MotionScopeMarker? marker = context.dependOnInheritedWidgetOfExactType<_MotionScopeMarker>();
    if (marker == null) {
      throw StateError('No MotionScope above this widget.');
    }
    return marker.state;
  }

  /// The ambient time in seconds, for a painter's `repaint`. Throws a
  /// [StateError] when no [MotionScope] is above [context].
  static ValueListenable<double> ambientTimeOf(BuildContext context) {
    final _MotionScopeMarker? marker = context.getInheritedWidgetOfExactType<_MotionScopeMarker>();
    if (marker == null) {
      throw StateError('No MotionScope above this widget.');
    }
    return marker.ambientClock;
  }

  @override
  State<MotionScope> createState() => _MotionScopeState();
}

class _MotionScopeState extends State<MotionScope> with SingleTickerProviderStateMixin {
  late final AmbientClock _ambientClock = AmbientClock(vsync: this);
  late MotionState _state;
  bool _engineDisablesAnimations = false;

  @override
  void initState() {
    super.initState();
    widget.windowMotion.addListener(_takeWindowMotion);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _engineDisablesAnimations = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    _state = _joinMotionState();
    _ambientClock.isRunningAllowed = _state.runsAmbientEffects;
  }

  @override
  void didUpdateWidget(MotionScope oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.windowMotion == widget.windowMotion) {
      return;
    }

    oldWidget.windowMotion.removeListener(_takeWindowMotion);
    widget.windowMotion.addListener(_takeWindowMotion);
    _state = _joinMotionState();
    _ambientClock.isRunningAllowed = _state.runsAmbientEffects;
  }

  @override
  void dispose() {
    widget.windowMotion.removeListener(_takeWindowMotion);
    _ambientClock.dispose();
    super.dispose();
  }

  MotionState _joinMotionState() {
    final MotionState window = widget.windowMotion.value;
    return MotionState(
      isReduced: window.isReduced || _engineDisablesAnimations,
      isWindowVisible: window.isWindowVisible,
    );
  }

  void _takeWindowMotion() {
    final MotionState joined = _joinMotionState();
    _ambientClock.isRunningAllowed = joined.runsAmbientEffects;
    if (joined == _state) {
      return;
    }

    setState(() {
      _state = joined;
    });
  }

  @override
  Widget build(BuildContext context) {
    return _MotionScopeMarker(
      state: _state,
      ambientClock: _ambientClock,
      child: TickerMode(enabled: _state.isWindowVisible, child: widget.child),
    );
  }
}

class _MotionScopeMarker extends InheritedWidget {
  const _MotionScopeMarker({required this.state, required this.ambientClock, required super.child});

  final MotionState state;
  final AmbientClock ambientClock;

  @override
  bool updateShouldNotify(_MotionScopeMarker oldWidget) => oldWidget.state != state;
}
