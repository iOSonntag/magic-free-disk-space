import { describe, expect, test } from 'bun:test';
import type { PackageConfigTracking } from '../../src/tools/decidePackageConfigTracking.js';
import { decidePackageConfigTracking } from '../../src/tools/decidePackageConfigTracking.js';
import { buildGitIndexBytes, buildGitIndexExtensionBytes } from '../support/flutterSdkFixtures.js';

const PACKAGE_CONFIG_PATH = 'app/.dart_tool/package_config.json';

/** The tracking of `PACKAGE_CONFIG_PATH` in a version 2 index whose entries name `paths`. */
function decideTrackingOfPaths(paths: string[]): PackageConfigTracking {
  return decidePackageConfigTracking({
    indexBytes: buildGitIndexBytes({ version: 2, paths: paths }),
    packageConfigPath: PACKAGE_CONFIG_PATH,
  });
}

describe('decidePackageConfigTracking', () => {
  test('returns tracked for an entry of the exact path, in version 2 or 3', () => {
    const paths = ['README.md', PACKAGE_CONFIG_PATH];

    for (const version of [2, 3] as const) {
      const tracking = decidePackageConfigTracking({
        indexBytes: buildGitIndexBytes({ version: version, paths: paths }),
        packageConfigPath: PACKAGE_CONFIG_PATH,
      });

      expect(tracking).toBe('tracked');
    }
  });

  test('returns tracked for a case variant of the path', () => {
    expect(decideTrackingOfPaths(['App/.Dart_Tool/Package_Config.json'])).toBe('tracked');
  });

  test('returns tracked for an NFD variant of a path with an accent', () => {
    const accentedPath = `caf${String.fromCodePoint(0xe9)}/.dart_tool/package_config.json`;
    const decomposedPath = accentedPath.normalize('NFD');
    const tracking = decidePackageConfigTracking({
      indexBytes: buildGitIndexBytes({ version: 2, paths: [decomposedPath] }),
      packageConfigPath: accentedPath,
    });

    expect(decomposedPath).not.toBe(accentedPath);
    expect(tracking).toBe('tracked');
  });

  test('returns tracked for the path with a zero-width joiner inserted', () => {
    const zeroWidthJoiner = String.fromCodePoint(0x200d);

    expect(decideTrackingOfPaths([`app/.dart_tool/package${zeroWidthJoiner}_config.json`])).toBe(
      'tracked',
    );
  });

  test('returns untracked for a backup of the config', () => {
    expect(decideTrackingOfPaths(['app/.dart_tool/package_config.json.backup'])).toBe('untracked');
  });

  test('returns untracked for the config of a test fixture', () => {
    expect(decideTrackingOfPaths(['test/fixtures/.dart_tool/package_config.json'])).toBe(
      'untracked',
    );
  });

  test('returns untracked for the config of another package of a monorepo', () => {
    expect(
      decideTrackingOfPaths(['app/pubspec.yaml', 'other/.dart_tool/package_config.json']),
    ).toBe('untracked');
  });

  test('returns unknown for each index the parser cannot read', () => {
    const readableBytes = buildGitIndexBytes({ version: 2, paths: [PACKAGE_CONFIG_PATH] });
    const nonNulPaddingBytes = buildGitIndexBytes({ version: 2, paths: ['READ.md'] });
    nonNulPaddingBytes[12 + 62 + 7 + 1] = 0x41;
    const wrongCountBytes = readableBytes.slice();
    new DataView(wrongCountBytes.buffer).setUint32(8, 2);
    const unreadableIndexes = [
      buildGitIndexBytes({ version: 4, paths: [PACKAGE_CONFIG_PATH] }),
      buildGitIndexBytes({
        version: 2,
        paths: [PACKAGE_CONFIG_PATH],
        extensions: [
          buildGitIndexExtensionBytes({ signature: 'link', content: new Uint8Array(20) }),
        ],
      }),
      buildGitIndexBytes({
        version: 2,
        paths: [PACKAGE_CONFIG_PATH],
        extensions: [
          buildGitIndexExtensionBytes({ signature: 'sdir', content: new Uint8Array(0) }),
        ],
      }),
      readableBytes.subarray(0, 12 + 40),
      nonNulPaddingBytes,
      buildGitIndexBytes({
        version: 2,
        paths: [PACKAGE_CONFIG_PATH],
        extendedPaths: [PACKAGE_CONFIG_PATH],
      }),
      wrongCountBytes,
      readableBytes.subarray(0, readableBytes.length - 1),
    ];

    for (const indexBytes of unreadableIndexes) {
      const tracking = decidePackageConfigTracking({
        indexBytes: indexBytes,
        packageConfigPath: PACKAGE_CONFIG_PATH,
      });

      expect(tracking).toBe('unknown');
    }
  });
});
