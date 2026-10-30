import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, rename, symlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  ACTIVE_ROOT_FILES_MAX_COUNT,
  isFlutterRootApartFromProject,
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
  createGitIndex,
  writeActiveRoot,
} from '../support/flutterSdkFixtures.js';

const PACKAGE_CONFIG_PATH = '.dart_tool/package_config.json';

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
    await writeActiveRoot({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0dddd',
      packageConfigPath: join(fixtureRoot.homeDir, 'gone'),
    });
    await Bun.write(brokenConfigPath, JSON.stringify({ flutterRoot: 42 }));
    await writeActiveRoot({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0eeee',
      packageConfigPath: brokenConfigPath,
    });
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

  test('skips a sibling submodule as the Flutter root of a project whose repository tracks its package config', async () => {
    const repoRoot = join(fixtureRoot.rootDir, 'repo');

    await createGitIndex({
      gitDir: join(repoRoot, '.git'),
      version: 2,
      paths: ['app/.dart_tool/package_config.json', 'app/pubspec.yaml'],
    });
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: join(repoRoot, 'sdk'),
      flutterRootGitEntry: 'file',
      projectRoot: join(repoRoot, 'app'),
      includeProjectRepository: false,
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });

  test('skips a git dependency clone of the pub cache named by a tracked package config', async () => {
    const projectRoot = buildProjectRoot({ homeDir: fixtureRoot.homeDir, name: 'a0aaaa' });

    await createGitIndex({
      gitDir: join(projectRoot, '.git'),
      version: 3,
      paths: [PACKAGE_CONFIG_PATH],
    });
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: join(fixtureRoot.homeDir, '.pub-cache', 'git', `sdk-${'a'.repeat(40)}`),
      includeProjectRepository: false,
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });

  test('skips a project in a submodule whose git dir tracks its package config', async () => {
    const superRoot = join(fixtureRoot.rootDir, 'super');

    await Bun.write(join(superRoot, 'sub', '.git'), 'gitdir: ../.git/modules/sub\n');
    await createGitIndex({
      gitDir: join(superRoot, '.git', 'modules', 'sub'),
      version: 2,
      paths: [`app/${PACKAGE_CONFIG_PATH}`],
    });
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: join(fixtureRoot.rootDir, 'flutter'),
      projectRoot: join(superRoot, 'sub', 'app'),
      includeProjectRepository: false,
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });

  test('skips a project in a worktree whose git dir tracks its package config', async () => {
    const worktreeRoot = join(fixtureRoot.rootDir, 'wt');
    const gitDir = join(fixtureRoot.rootDir, 'main', '.git', 'worktrees', 'wt');

    await Bun.write(join(worktreeRoot, '.git'), `gitdir: ${gitDir}\n`);
    await createGitIndex({ gitDir: gitDir, version: 2, paths: [PACKAGE_CONFIG_PATH] });
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: join(fixtureRoot.rootDir, 'flutter'),
      projectRoot: worktreeRoot,
      includeProjectRepository: false,
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });

  test('skips a package config that a repository of .dart_tool itself tracks', async () => {
    const projectRoot = buildProjectRoot({ homeDir: fixtureRoot.homeDir, name: 'a0aaaa' });

    await Bun.write(join(projectRoot, '.dart_tool', '.git'), 'gitdir: ../../dart-tool.git\n');
    await createGitIndex({
      gitDir: join(dirname(projectRoot), 'dart-tool.git'),
      version: 2,
      paths: ['package_config.json'],
    });
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: join(fixtureRoot.rootDir, 'flutter'),
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });

  test('skips a package config whose .dart_tool is a link', async () => {
    const targetRoot = join(fixtureRoot.rootDir, 'target');
    const projectRoot = buildProjectRoot({ homeDir: fixtureRoot.homeDir, name: 'a0aaaa' });

    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: join(fixtureRoot.rootDir, 'flutter'),
      projectRoot: targetRoot,
    });
    await mkdir(projectRoot, { recursive: true });
    await symlink(join(targetRoot, '.dart_tool'), join(projectRoot, '.dart_tool'));
    await writeActiveRoot({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      packageConfigPath: join(projectRoot, PACKAGE_CONFIG_PATH),
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });

  test('skips a package config that is a link', async () => {
    const projectRoot = buildProjectRoot({ homeDir: fixtureRoot.homeDir, name: 'a0aaaa' });
    const packageConfigPath = join(projectRoot, PACKAGE_CONFIG_PATH);
    const targetPath = join(fixtureRoot.rootDir, 'package_config.json');

    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: join(fixtureRoot.rootDir, 'flutter'),
    });
    await rename(packageConfigPath, targetPath);
    await symlink(targetPath, packageConfigPath);

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });

  test('skips a project whose git dir holds a split index', async () => {
    const projectRoot = buildProjectRoot({ homeDir: fixtureRoot.homeDir, name: 'a0aaaa' });

    await createGitIndex({ gitDir: join(projectRoot, '.git'), version: 2, paths: ['README.md'] });
    await Bun.write(join(projectRoot, '.git', `sharedindex.${'b'.repeat(40)}`), '');
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: join(fixtureRoot.rootDir, 'flutter'),
      includeProjectRepository: false,
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });

  test('skips a project whose index has version 4', async () => {
    const projectRoot = buildProjectRoot({ homeDir: fixtureRoot.homeDir, name: 'a0aaaa' });

    await createGitIndex({ gitDir: join(projectRoot, '.git'), version: 4, paths: ['README.md'] });
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: join(fixtureRoot.rootDir, 'flutter'),
      includeProjectRepository: false,
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });

  test('skips a project whose repository has no index', async () => {
    const projectRoot = buildProjectRoot({ homeDir: fixtureRoot.homeDir, name: 'a0aaaa' });

    await createGitEntry({ folder: projectRoot, gitEntry: 'folder' });
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: join(fixtureRoot.rootDir, 'flutter'),
      includeProjectRepository: false,
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });

  test('returns a Flutter root outside the repository of the project that does not track its package config', async () => {
    const projectRoot = join(fixtureRoot.rootDir, 'app');
    const flutterRoot = join(fixtureRoot.rootDir, 'flutter');

    await createGitIndex({
      gitDir: join(projectRoot, '.git'),
      version: 2,
      paths: ['README.md', 'lib/main.dart', 'pubspec.yaml'],
    });
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: flutterRoot,
      projectRoot: projectRoot,
      includeProjectRepository: false,
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([buildSdkDartPath(flutterRoot)]);
  });

  test('returns a sibling submodule as the Flutter root when the repository does not track the package config', async () => {
    const repoRoot = join(fixtureRoot.rootDir, 'repo');
    const flutterRoot = join(repoRoot, 'sdk');

    await createGitIndex({
      gitDir: join(repoRoot, '.git'),
      version: 2,
      paths: ['app/pubspec.yaml', 'sdk'],
    });
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: flutterRoot,
      flutterRootGitEntry: 'file',
      projectRoot: join(repoRoot, 'app'),
      includeProjectRepository: false,
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

  test('skips a project with a .jj working copy and no .git above', async () => {
    const projectRoot = buildProjectRoot({ homeDir: fixtureRoot.homeDir, name: 'a0aaaa' });

    await mkdir(join(projectRoot, '.jj'), { recursive: true });
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: join(fixtureRoot.rootDir, 'flutter'),
      includeProjectRepository: false,
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });

  test('skips a project with a .hg working copy inside a git repository that does not track its package config', async () => {
    const repoRoot = join(fixtureRoot.rootDir, 'repo');
    const projectRoot = join(repoRoot, 'app');

    await createGitIndex({
      gitDir: join(repoRoot, '.git'),
      version: 2,
      paths: ['app/pubspec.yaml'],
    });
    await mkdir(join(projectRoot, '.hg'), { recursive: true });
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: join(fixtureRoot.rootDir, 'flutter'),
      projectRoot: projectRoot,
      includeProjectRepository: false,
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });

  test('skips a colocated jj project, with .jj beside a .git that does not track its package config', async () => {
    const projectRoot = buildProjectRoot({ homeDir: fixtureRoot.homeDir, name: 'a0aaaa' });

    await mkdir(join(projectRoot, '.jj'), { recursive: true });
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: join(fixtureRoot.rootDir, 'flutter'),
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });

  test('skips a project whose .git has a .svn working copy two folders above', async () => {
    const svnRoot = join(fixtureRoot.rootDir, 'svn');

    await mkdir(join(svnRoot, '.svn'), { recursive: true });
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: join(fixtureRoot.rootDir, 'flutter'),
      projectRoot: join(svnRoot, 'work', 'app'),
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });

  test('skips a project outside any repository', async () => {
    await createActiveProject({
      homeDir: fixtureRoot.homeDir,
      group: 'a0',
      name: 'a0aaaa',
      flutterRoot: join(fixtureRoot.rootDir, 'flutter'),
      includeProjectRepository: false,
    });

    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });

  test('returns nothing without a pub cache', async () => {
    const paths = await loadFlutterSdkDartPaths({ homeDir: fixtureRoot.homeDir });

    expect(paths).toEqual([]);
  });
});

describe('isFlutterRootApartFromProject', () => {
  test('accepts disjoint paths, a shared name prefix included', () => {
    expect(
      isFlutterRootApartFromProject({ flutterRoot: '/sdk/flutter', projectRoot: '/p/app' }),
    ).toBe(true);
    expect(
      isFlutterRootApartFromProject({ flutterRoot: '/p/app-sdk', projectRoot: '/p/app' }),
    ).toBe(true);
  });

  test('rejects equal paths and a path inside the other', () => {
    expect(isFlutterRootApartFromProject({ flutterRoot: '/p/app', projectRoot: '/p/app' })).toBe(
      false,
    );
    expect(
      isFlutterRootApartFromProject({ flutterRoot: '/p/app/flutter', projectRoot: '/p/app' }),
    ).toBe(false);
    expect(isFlutterRootApartFromProject({ flutterRoot: '/p', projectRoot: '/p/app' })).toBe(false);
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
