import { basename, dirname, join } from 'node:path';

/** Where a Flutter SDK keeps the binary of its own Dart SDK, relative to the Flutter root. */
export const FLUTTER_SDK_DART_PATH = 'bin/cache/dart-sdk/bin/dart';

// Flutter's root holds this script beside its `bin/dart` wrapper; a Dart SDK's root does not.
const FLUTTER_SCRIPT_PATH = 'bin/flutter';

/** The paths under a root `<root>` whose real path `<root>/bin/dart` may be Flutter's wrapper. */
type FlutterWrapperPaths = { flutterScriptPath: string; sdkDartPath: string };

/**
 * The paths whose presence `decideDartBinaryPath` reads for a `dart` location whose real path is
 * `realPath`: Flutter's script and its SDK binary when `realPath` is `<root>/bin/dart`, else none.
 */
export function listFlutterWrapperPaths(params: { realPath: string }): string[] {
  const wrapperPaths = buildFlutterWrapperPaths({ realPath: params.realPath });

  if (wrapperPaths === null) {
    return [];
  }

  return [wrapperPaths.flutterScriptPath, wrapperPaths.sdkDartPath];
}

/**
 * The binary to check for a `dart` location whose real path is `realPath`, given which of
 * `listFlutterWrapperPaths` are present. For Flutter's `bin/dart` wrapper, which can download an
 * SDK, it is the SDK's own binary, or `null` while that is not there; else `realPath` itself.
 */
export function decideDartBinaryPath(params: {
  realPath: string;
  presentPaths: string[];
}): string | null {
  const wrapperPaths = buildFlutterWrapperPaths({ realPath: params.realPath });

  if (wrapperPaths === null || !params.presentPaths.includes(wrapperPaths.flutterScriptPath)) {
    return params.realPath;
  }

  if (!params.presentPaths.includes(wrapperPaths.sdkDartPath)) {
    return null;
  }

  return wrapperPaths.sdkDartPath;
}

function buildFlutterWrapperPaths(params: { realPath: string }): FlutterWrapperPaths | null {
  const binDir = dirname(params.realPath);

  if (basename(params.realPath) !== 'dart' || basename(binDir) !== 'bin') {
    return null;
  }

  const root = dirname(binDir);

  return {
    flutterScriptPath: join(root, FLUTTER_SCRIPT_PATH),
    sdkDartPath: join(root, FLUTTER_SDK_DART_PATH),
  };
}
