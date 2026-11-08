import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
  decideDartBinaryPath,
  listFlutterWrapperPaths,
} from '../../src/tools/decideDartBinaryPath.js';

// The paths join by the separator of the host, as the decision itself joins them.
const flutterRoot = join('/opt', 'example', 'flutter');

const flutterWrapperPath = join(flutterRoot, 'bin', 'dart');

const flutterScriptPath = join(flutterRoot, 'bin', 'flutter');

const flutterSdkDartPath = join(flutterRoot, 'bin', 'cache', 'dart-sdk', 'bin', 'dart');

describe('listFlutterWrapperPaths', () => {
  test('lists the Flutter script and the SDK binary beside a `bin/dart`', () => {
    expect(listFlutterWrapperPaths({ realPath: flutterWrapperPath })).toEqual([
      flutterScriptPath,
      flutterSdkDartPath,
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
        realPath: flutterWrapperPath,
        presentPaths: [flutterScriptPath, flutterSdkDartPath],
      }),
    ).toBe(flutterSdkDartPath);
  });

  test("finds nothing behind Flutter's wrapper while its SDK binary is not there", () => {
    expect(
      decideDartBinaryPath({ realPath: flutterWrapperPath, presentPaths: [flutterScriptPath] }),
    ).toBeNull();
  });

  test('keeps the `bin/dart` of a Dart SDK, which has no Flutter script beside it', () => {
    expect(decideDartBinaryPath({ realPath: flutterWrapperPath, presentPaths: [] })).toBe(
      flutterWrapperPath,
    );
    expect(
      decideDartBinaryPath({
        realPath: flutterWrapperPath,
        presentPaths: [flutterSdkDartPath],
      }),
    ).toBe(flutterWrapperPath);
  });

  test('keeps a binary that is not a `bin/dart`', () => {
    expect(decideDartBinaryPath({ realPath: '/opt/example/libexec/dart', presentPaths: [] })).toBe(
      '/opt/example/libexec/dart',
    );
  });
});
