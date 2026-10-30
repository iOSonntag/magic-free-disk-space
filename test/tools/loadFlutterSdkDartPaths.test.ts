import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ACTIVE_ROOT_FILES_MAX_COUNT,
  loadFlutterSdkDartPaths,
  parseActiveRootPackageConfigPath,
  parsePackageConfigFlutterRoot,
} from '../../src/tools/loadFlutterSdkDartPaths.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../support/fixtureRoot.js';
import { buildActiveRootPath, createActiveProject } from '../support/flutterSdkFixtures.js';

let fixtureRoot: FixtureRoot;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

function buildSdkDartPath(flutterRoot: string): string {
  return join(flutterRoot, 'bin', 'cache', 'dart-sdk', 'bin', 'dart');
}

describe('loadFlutterSdkDartPaths', () => {
  test('returns the SDK binary of each distinct Flutter root, in the sorted order of the files', async () => {
    const stableRoot = join(fixtureRoot.rootDir, 'flutter-stable');
    const betaRoot = join(fixtureRoot.rootDir, 'flutter-beta');

    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'b0',
      name: 'b0aaaa',
      flutterRoot: betaRoot,
    });
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0bbbb',
      flutterRoot: stableRoot,
    });
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: stableRoot,
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([buildSdkDartPath(stableRoot), buildSdkDartPath(betaRoot)]);
  });

  test('skips malformed active roots and package configs', async () => {
    const flutterRoot = join(fixtureRoot.rootDir, 'flutter');
    const brokenConfigPath = join(fixtureRoot.homeDir, 'broken', 'package_config.json');

    await Bun.write(
      buildActiveRootPath({ homeDir: fixtureRoot.homeDir, group: 'a0', name: 'a0aaaa' }),
      '{ not json',
    );
    await Bun.write(
      buildActiveRootPath({ homeDir: fixtureRoot.homeDir, group: 'a0', name: 'a0bbbb' }),
      '["file:///x"]',
    );
    await Bun.write(
      buildActiveRootPath({ homeDir: fixtureRoot.homeDir, group: 'a0', name: 'a0cccc' }),
      JSON.stringify({ package_config: 'https://example.com/package_config.json' }),
    );
    await Bun.write(
      buildActiveRootPath({ homeDir: fixtureRoot.homeDir, group: 'a0', name: 'a0dddd' }),
      JSON.stringify({ package_config: pathToFileURL(join(fixtureRoot.homeDir, 'gone')).href }),
    );
    await Bun.write(brokenConfigPath, JSON.stringify({ flutterRoot: 42 }));
    await Bun.write(
      buildActiveRootPath({ homeDir: fixtureRoot.homeDir, group: 'a0', name: 'a0eeee' }),
      JSON.stringify({ package_config: pathToFileURL(brokenConfigPath).href }),
    );
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'b0',
      name: 'b0aaaa',
      flutterRoot: flutterRoot,
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([buildSdkDartPath(flutterRoot)]);
  });

  test(`reads at most ${ACTIVE_ROOT_FILES_MAX_COUNT} active root files`, async () => {
    for (let index = 0; index < ACTIVE_ROOT_FILES_MAX_COUNT; index += 1) {
      const name = `a0${String(index).padStart(3, '0')}`;

      await Bun.write(
        buildActiveRootPath({ homeDir: fixtureRoot.homeDir, group: 'a0', name: name }),
        '{}',
      );
    }

    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'b0',
      name: 'b0aaaa',
      flutterRoot: join(fixtureRoot.rootDir, 'flutter'),
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });

  test('returns nothing without a pub cache', async () => {
    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });
});

describe('parseActiveRootPackageConfigPath', () => {
  test('reads the path of a file URL, and nothing else', () => {
    expect(
      parseActiveRootPackageConfigPath(
        '{"package_config":"file:///p/.dart_tool/package_config.json"}',
      ),
    ).toBe('/p/.dart_tool/package_config.json');
    expect(parseActiveRootPackageConfigPath('{"package_config":"/p/package_config.json"}')).toBe(
      null,
    );
    expect(parseActiveRootPackageConfigPath('null')).toBe(null);
  });
});

describe('parsePackageConfigFlutterRoot', () => {
  test('reads the path of the flutterRoot file URL', () => {
    expect(parsePackageConfigFlutterRoot('{"flutterRoot":"file:///sdk/flutter"}')).toBe(
      '/sdk/flutter',
    );
    expect(parsePackageConfigFlutterRoot('{"configVersion":2}')).toBe(null);
  });
});
