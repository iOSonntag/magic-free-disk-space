import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  decideDartBinaryPath,
  listFlutterWrapperPaths,
} from '../../src/tools/decideDartBinaryPath.js';

// The paths join by the separator of the host, as the decision itself joins them.
const FLUTTER_ROOT = join('/opt', 'example', 'flutter');

const FLUTTER_WRAPPER_PATH = join(FLUTTER_ROOT, 'bin', 'dart');

const FLUTTER_SCRIPT_PATH = join(FLUTTER_ROOT, 'bin', 'flutter');

const FLUTTER_SDK_DART_PATH = join(FLUTTER_ROOT, 'bin', 'cache', 'dart-sdk', 'bin', 'dart');

describe('listFlutterWrapperPaths', () => {
  test('lists the Flutter script and the SDK binary beside a `bin/dart`', () => {
    expect(listFlutterWrapperPaths({ realPath: FLUTTER_WRAPPER_PATH })).toEqual([
      FLUTTER_SCRIPT_PATH,
      FLUTTER_SDK_DART_PATH,
    ]);
  });

  test('lists nothing for a binary that is not a `bin/dart`', () => {
    expect(listFlutterWrapperPaths({ realPath: '/opt/example/libexec/dart' })).toEqual([]);
    expect(listFlutterWrapperPaths({ realPath: '/opt/example/bin/dart2' })).toEqual([]);
  });
});

describe('decideDartBinaryPath', () => {
  test("takes the SDK binary behind Flutter's wrapper", () => {
    expect(
      decideDartBinaryPath({
        realPath: FLUTTER_WRAPPER_PATH,
        presentPaths: [FLUTTER_SCRIPT_PATH, FLUTTER_SDK_DART_PATH],
      }),
    ).toBe(FLUTTER_SDK_DART_PATH);
  });

  test("finds nothing behind Flutter's wrapper while its SDK binary is not there", () => {
    expect(
      decideDartBinaryPath({ realPath: FLUTTER_WRAPPER_PATH, presentPaths: [FLUTTER_SCRIPT_PATH] }),
    ).toBeNull();
  });

  test('keeps the `bin/dart` of a Dart SDK, which has no Flutter script beside it', () => {
    expect(decideDartBinaryPath({ realPath: FLUTTER_WRAPPER_PATH, presentPaths: [] })).toBe(
      FLUTTER_WRAPPER_PATH,
    );
    expect(
      decideDartBinaryPath({
        realPath: FLUTTER_WRAPPER_PATH,
        presentPaths: [FLUTTER_SDK_DART_PATH],
      }),
    ).toBe(FLUTTER_WRAPPER_PATH);
  });

  test('keeps a binary that is not a `bin/dart`', () => {
    expect(decideDartBinaryPath({ realPath: '/opt/example/libexec/dart', presentPaths: [] })).toBe(
      '/opt/example/libexec/dart',
    );
  });
});
