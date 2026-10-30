import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ACTIVE_ROOT_FILES_MAX_COUNT,
  isFlutterRootApartFromCheckout,
  loadFlutterSdkDartPaths,
  parseActiveRootPackageConfigPath,
  parsePackageConfigFlutterRoot,
} from '../../src/tools/loadFlutterSdkDartPaths.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../support/fixtureRoot.js';
import {
  buildActiveRootPath,
  buildProjectRoot,
  createActiveProject,
  createGitEntry,
} from '../support/flutterSdkFixtures.js';

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

  test('skips a Flutter root inside the project that names it', async () => {
    const projectRoot = buildProjectRoot({ homeDir: fixtureRoot.homeDir, name: 'a0aaaa' });

    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: join(projectRoot, 'vendor', 'flutter'),
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });

  test('skips a Flutter root that holds the project, such as the root of its repository', async () => {
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: dirname(buildProjectRoot({ homeDir: fixtureRoot.homeDir, name: 'a0aaaa' })),
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });

  test('skips a Flutter root without a .git entry', async () => {
    const projectRoot = buildProjectRoot({ homeDir: fixtureRoot.homeDir, name: 'a0aaaa' });
    const flutterRoot = join(dirname(projectRoot), 'a0aaaa-sdk');

    await mkdir(join(flutterRoot, 'bin'), { recursive: true });
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: flutterRoot,
      flutterRootGitEntry: 'none',
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });

  test('returns a Flutter root with a .git folder that a project outside it names', async () => {
    const flutterRoot = join(fixtureRoot.rootDir, 'flutter');

    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: flutterRoot,
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([buildSdkDartPath(flutterRoot)]);
  });

  test('returns a Flutter root whose .git is a file, as in a worktree', async () => {
    const flutterRoot = join(fixtureRoot.rootDir, 'flutter-worktree');

    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: flutterRoot,
      flutterRootGitEntry: 'file',
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([buildSdkDartPath(flutterRoot)]);
  });

  test('skips a sibling submodule of the project as its Flutter root', async () => {
    const repoRoot = join(fixtureRoot.rootDir, 'repo');

    await createGitEntry({ folder: repoRoot, gitEntry: 'folder' });
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: join(repoRoot, 'sdk'),
      flutterRootGitEntry: 'file',
      projectRoot: join(repoRoot, 'app'),
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });

  test('skips a Flutter root in the superproject of the submodule that holds the project', async () => {
    const superRoot = join(fixtureRoot.rootDir, 'super');

    await createGitEntry({ folder: superRoot, gitEntry: 'folder' });
    await createGitEntry({ folder: join(superRoot, 'sub'), gitEntry: 'file' });
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: join(superRoot, 'sdk'),
      flutterRootGitEntry: 'file',
      projectRoot: join(superRoot, 'sub', 'app'),
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });

  test('skips a Flutter root in the worktree that holds the project', async () => {
    const worktreeRoot = join(fixtureRoot.rootDir, 'wt');

    await createGitEntry({ folder: worktreeRoot, gitEntry: 'file' });
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: join(worktreeRoot, 'sdk'),
      flutterRootGitEntry: 'file',
      projectRoot: join(worktreeRoot, 'app'),
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });

  test('returns a Flutter root outside the repository of the project', async () => {
    const projectRoot = join(fixtureRoot.rootDir, 'app');
    const flutterRoot = join(fixtureRoot.rootDir, 'flutter');

    await createGitEntry({ folder: projectRoot, gitEntry: 'folder' });
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: flutterRoot,
      projectRoot: projectRoot,
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([buildSdkDartPath(flutterRoot)]);
  });

  test('skips a Flutter root that only its own workspace names', async () => {
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'flutter',
      flutterRoot: buildProjectRoot({ homeDir: fixtureRoot.homeDir, name: 'flutter' }),
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });

  test('returns nothing without a pub cache', async () => {
    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });
});

describe('isFlutterRootApartFromCheckout', () => {
  test('without a checkout, accepts paths disjoint from the project, a shared prefix included', () => {
    expect(
      isFlutterRootApartFromCheckout({
        flutterRoot: '/sdk/flutter',
        projectRoot: '/p/app',
        checkoutRoot: null,
      }),
    ).toBe(true);
    expect(
      isFlutterRootApartFromCheckout({
        flutterRoot: '/p/app-sdk',
        projectRoot: '/p/app',
        checkoutRoot: null,
      }),
    ).toBe(true);
  });

  test('without a checkout, rejects equal paths and a path inside the other', () => {
    expect(
      isFlutterRootApartFromCheckout({
        flutterRoot: '/p/app',
        projectRoot: '/p/app',
        checkoutRoot: null,
      }),
    ).toBe(false);
    expect(
      isFlutterRootApartFromCheckout({
        flutterRoot: '/p/app/flutter',
        projectRoot: '/p/app',
        checkoutRoot: null,
      }),
    ).toBe(false);
    expect(
      isFlutterRootApartFromCheckout({
        flutterRoot: '/p',
        projectRoot: '/p/app',
        checkoutRoot: null,
      }),
    ).toBe(false);
  });

  test('with a checkout, rejects a root inside it and accepts one outside it', () => {
    expect(
      isFlutterRootApartFromCheckout({
        flutterRoot: '/p/sdk',
        projectRoot: '/p/app',
        checkoutRoot: '/p',
      }),
    ).toBe(false);
    expect(
      isFlutterRootApartFromCheckout({
        flutterRoot: '/p-sdk',
        projectRoot: '/p/app',
        checkoutRoot: '/p',
      }),
    ).toBe(true);
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
