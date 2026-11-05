import 'dart:ui';

import 'package:flutter/widgets.dart';

/// The app's fragment programs, loaded once before `runApp`. A program that
/// failed to load is `null`, and its painter falls back to a static
/// gradient with no glow.
@immutable
class ShaderLibrary {
  const ShaderLibrary({required this.backdrop, required this.ringGlow});

  /// No program at all: what page tests pump, and what a failed load gives.
  static const ShaderLibrary empty = ShaderLibrary(backdrop: null, ringGlow: null);

  static const String backdropAssetKey = 'shaders/backdrop.frag';
  static const String ringGlowAssetKey = 'shaders/ring_glow.frag';

  final FragmentProgram? backdrop;
  final FragmentProgram? ringGlow;

  /// Loads every program. Never throws: each program that fails is `null`.
  static Future<ShaderLibrary> load() async {
    final List<FragmentProgram?> programs = await Future.wait(<Future<FragmentProgram?>>[
      loadFragmentProgramOrNull(backdropAssetKey),
      loadFragmentProgramOrNull(ringGlowAssetKey),
    ]);
    return ShaderLibrary(backdrop: programs[0], ringGlow: programs[1]);
  }

  /// The library of the nearest [ShaderLibraryScope].
  static ShaderLibrary of(BuildContext context) {
    final ShaderLibraryScope? scope = context.dependOnInheritedWidgetOfExactType<ShaderLibraryScope>();
    assert(scope != null, 'No ShaderLibraryScope above this widget.');
    return scope!.library;
  }
}

/// Loads one fragment program, or returns `null` and logs the failure when
/// the asset is missing or does not compile for this renderer.
Future<FragmentProgram?> loadFragmentProgramOrNull(String assetKey) async {
  try {
    return await FragmentProgram.fromAsset(assetKey);
  } catch (error) {
    debugPrint('The shader $assetKey failed to load, so its painter draws the static fallback: $error');
    return null;
  }
}

/// Hands the loaded [ShaderLibrary] to every painter below it.
class ShaderLibraryScope extends InheritedWidget {
  const ShaderLibraryScope({super.key, required this.library, required super.child});

  final ShaderLibrary library;

  @override
  bool updateShouldNotify(ShaderLibraryScope oldWidget) => oldWidget.library != library;
}
