import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, link, mkdir, realpath, symlink, truncate, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { PackageConfigTracking } from '../../src/tools/decidePackageConfigTracking.js';
import { PACKAGE_CONFIG_CANDIDATES_MAX_COUNT } from '../../src/tools/decidePackageConfigTracking.js';
import { loadPackageConfigTracking } from '../../src/tools/loadPackageConfigTracking.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot, isPresent } from '../support/fixtureRoot.js';
import {
  buildGitIndexBytes,
  buildGitIndexExtensionBytes,
  createGitEntry,
  createGitIndex,
  createUntrackedProjectRepository,
} from '../support/flutterSdkFixtures.js';

const PACKAGE_CONFIG_PATH = '.dart_tool/package_config.json';

let fixtureRoot: FixtureRoot;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

/** Creates `<projectRoot>/.dart_tool` with its package config and returns its real path. */
async function createDartTool(projectRoot: string): Promise<string> {
  const dartToolPath = join(projectRoot, '.dart_tool');

  await Bun.write(join(dartToolPath, 'package_config.json'), '{"configVersion":2}');

  return await realpath(dartToolPath);
}

/** Whether the volume of the fixtures answers a folder for a case variant of its name. */
async function probeVolumeFoldsCase(): Promise<boolean> {
  const probeRoot = await createFixtureRoot();

  try {
    await mkdir(join(probeRoot.rootDir, 'Probe'));

    return await isPresent(join(probeRoot.rootDir, 'probe'));
  } finally {
    await deleteFixtureRoot({ fixtureRoot: probeRoot });
  }
}

const volumeFoldsCase = await probeVolumeFoldsCase();

/**
 * The tracking of the project `<repo>/<projectFolderName>` in a repository `repo` whose index
 * names only `indexedPath`.
 */
async function loadTrackingOfRepository(params: {
  projectFolderName: string;
  indexedPath: string;
}): Promise<PackageConfigTracking> {
  const repoRoot = join(fixtureRoot.rootDir, 'repo');

  await createGitIndex({ gitDir: join(repoRoot, '.git'), version: 2, paths: [params.indexedPath] });
  const dartToolPath = await createDartTool(join(repoRoot, params.projectFolderName));

  return await loadPackageConfigTracking({ dartToolRealPath: dartToolPath });
}

/** Creates the project at `projectRoot` as a git repository whose index names only `pubspec.yaml`. */
async function createUntrackedProject(projectRoot: string): Promise<string> {
  await createUntrackedProjectRepository({ projectRoot: projectRoot });

  return await createDartTool(projectRoot);
}

describe('loadPackageConfigTracking', () => {
  test('returns untracked for a repository whose index does not name the package config', async () => {
    const dartToolPath = await createUntrackedProject(join(fixtureRoot.rootDir, 'app'));

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('untracked');
  });

  test('returns tracked for a repository whose index names the package config', async () => {
    const projectRoot = join(fixtureRoot.rootDir, 'app');

    await createGitIndex({
      gitDir: join(projectRoot, '.git'),
      version: 3,
      paths: [PACKAGE_CONFIG_PATH],
    });
    const dartToolPath = await createDartTool(projectRoot);

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('tracked');
  });

  test('returns tracked for a repository above the project that names its package config', async () => {
    const repoRoot = join(fixtureRoot.rootDir, 'repo');

    await createGitIndex({
      gitDir: join(repoRoot, '.git'),
      version: 2,
      paths: [`app/${PACKAGE_CONFIG_PATH}`, 'app/pubspec.yaml'],
    });
    const dartToolPath = await createDartTool(join(repoRoot, 'app'));

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('tracked');
  });

  test('reads the git dir of a submodule from its relative .git file', async () => {
    const superRoot = join(fixtureRoot.rootDir, 'super');

    await Bun.write(join(superRoot, 'sub', '.git'), 'gitdir: ../.git/modules/sub\n');
    await createGitIndex({
      gitDir: join(superRoot, '.git', 'modules', 'sub'),
      version: 2,
      paths: [`app/${PACKAGE_CONFIG_PATH}`],
    });
    const dartToolPath = await createDartTool(join(superRoot, 'sub', 'app'));

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('tracked');
  });

  test('reads the git dir of a worktree from its absolute .git file', async () => {
    const worktreeRoot = join(fixtureRoot.rootDir, 'wt');
    const gitDir = join(fixtureRoot.rootDir, 'main', '.git', 'worktrees', 'wt');

    await Bun.write(join(worktreeRoot, '.git'), `gitdir: ${gitDir}\n`);
    await createGitIndex({ gitDir: gitDir, version: 2, paths: [PACKAGE_CONFIG_PATH] });
    const dartToolPath = await createDartTool(worktreeRoot);

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('tracked');
  });

  test('reads a repository of .dart_tool itself before the one of the project', async () => {
    const projectRoot = join(fixtureRoot.rootDir, 'app');

    const dartToolPath = await createUntrackedProject(projectRoot);
    await Bun.write(join(dartToolPath, '.git'), 'gitdir: ../../dart-tool.git\n');
    await createGitIndex({
      gitDir: join(fixtureRoot.rootDir, 'dart-tool.git'),
      version: 2,
      paths: ['package_config.json'],
    });

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('tracked');
  });

  test('returns unknown for a .git file that names no git dir', async () => {
    const projectRoot = join(fixtureRoot.rootDir, 'app');

    await Bun.write(join(projectRoot, '.git'), 'not a git dir line\n');
    const dartToolPath = await createDartTool(projectRoot);

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('unknown');
  });

  test('returns unknown for a .git that is a link', async () => {
    const projectRoot = join(fixtureRoot.rootDir, 'app');
    const targetRoot = join(fixtureRoot.rootDir, 'target');

    await createGitIndex({ gitDir: join(targetRoot, '.git'), version: 2, paths: ['README.md'] });
    const dartToolPath = await createDartTool(projectRoot);
    await symlink(join(targetRoot, '.git'), join(projectRoot, '.git'));

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('unknown');
  });

  test('returns untracked for a monorepo that tracks other configs but not the one of the project', async () => {
    const repoRoot = join(fixtureRoot.rootDir, 'repo');

    await createGitIndex({
      gitDir: join(repoRoot, '.git'),
      version: 2,
      paths: [
        'app/pubspec.yaml',
        'docs/package_config.json.backup',
        `other/${PACKAGE_CONFIG_PATH}`,
        `test/fixtures/${PACKAGE_CONFIG_PATH}`,
      ],
    });
    await Bun.write(join(repoRoot, 'docs', 'package_config.json.backup'), '{}');
    await createDartTool(join(repoRoot, 'other'));
    await createDartTool(join(repoRoot, 'test', 'fixtures'));
    const dartToolPath = await createDartTool(join(repoRoot, 'app'));

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('untracked');
  });

  test('returns tracked for an entry that is a hard link to the package config', async () => {
    const repoRoot = join(fixtureRoot.rootDir, 'repo');

    await createGitIndex({
      gitDir: join(repoRoot, '.git'),
      version: 2,
      paths: ['app/pubspec.yaml', 'other/package_config.json'],
    });
    const dartToolPath = await createDartTool(join(repoRoot, 'app'));
    await mkdir(join(repoRoot, 'other'));
    await link(
      join(dartToolPath, 'package_config.json'),
      join(repoRoot, 'other', 'package_config.json'),
    );

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('tracked');
  });

  test('returns tracked for an entry through a tracked folder link to the project', async () => {
    const repoRoot = join(fixtureRoot.rootDir, 'repo');

    await createGitIndex({
      gitDir: join(repoRoot, '.git'),
      version: 2,
      paths: ['app/pubspec.yaml', 'link', `link/${PACKAGE_CONFIG_PATH}`],
    });
    const dartToolPath = await createDartTool(join(repoRoot, 'app'));
    await symlink('app', join(repoRoot, 'link'));

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('tracked');
  });

  test('returns unknown for a candidate entry whose stats are denied', async () => {
    const repoRoot = join(fixtureRoot.rootDir, 'repo');
    const lockedRoot = join(repoRoot, 'locked');

    await createGitIndex({
      gitDir: join(repoRoot, '.git'),
      version: 2,
      paths: ['app/pubspec.yaml', `locked/${PACKAGE_CONFIG_PATH}`],
    });
    await createDartTool(lockedRoot);
    const dartToolPath = await createDartTool(join(repoRoot, 'app'));
    // `deleteFixtureRoot` restores the mode before it deletes the fixture.
    await chmod(lockedRoot, 0o000);

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('unknown');
  });

  test('returns unknown for more candidate entries than the bound', async () => {
    const repoRoot = join(fixtureRoot.rootDir, 'repo');
    const candidatePaths = Array.from(
      { length: PACKAGE_CONFIG_CANDIDATES_MAX_COUNT + 1 },
      (_, index) => `p${index}/${PACKAGE_CONFIG_PATH}`,
    );

    await createGitIndex({ gitDir: join(repoRoot, '.git'), version: 2, paths: candidatePaths });
    const dartToolPath = await createDartTool(join(repoRoot, 'app'));

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('unknown');
  });

  test('returns unknown when the package config itself is missing', async () => {
    const dartToolPath = await createUntrackedProject(join(fixtureRoot.rootDir, 'app'));

    await unlink(join(dartToolPath, 'package_config.json'));

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('unknown');
  });

  // A volume that keeps case apart, such as case-sensitive APFS, has no collision to test.
  describe.skipIf(!volumeFoldsCase)('on a volume that folds case', () => {
    test('returns tracked for an entry that differs from the project only in case', async () => {
      const tracking = await loadTrackingOfRepository({
        projectFolderName: 'app',
        indexedPath: `App/${PACKAGE_CONFIG_PATH}`,
      });

      expect(tracking).toBe('tracked');
    });

    test('returns tracked for an entry with a sigma where the project has a final sigma', async () => {
      const tracking = await loadTrackingOfRepository({
        projectFolderName: `x${String.fromCodePoint(0x3c2)}`,
        indexedPath: `x${String.fromCodePoint(0x3c3)}/${PACKAGE_CONFIG_PATH}`,
      });

      expect(tracking).toBe('tracked');
    });

    test('returns tracked for an entry with a sharp s where the project has ss', async () => {
      const tracking = await loadTrackingOfRepository({
        projectFolderName: 'strasse',
        indexedPath: `stra${String.fromCodePoint(0xdf)}e/${PACKAGE_CONFIG_PATH}`,
      });

      expect(tracking).toBe('tracked');
    });
  });

  test('returns unknown for a split index, with a link extension', async () => {
    const projectRoot = join(fixtureRoot.rootDir, 'app');
    const linkExtension = buildGitIndexExtensionBytes({
      signature: 'link',
      content: new Uint8Array(20),
    });

    await Bun.write(
      join(projectRoot, '.git', 'index'),
      buildGitIndexBytes({ version: 2, paths: ['pubspec.yaml'], extensions: [linkExtension] }),
    );
    const dartToolPath = await createDartTool(projectRoot);

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('unknown');
  });

  test('returns unknown for an index of version 4', async () => {
    const projectRoot = join(fixtureRoot.rootDir, 'app');

    await createGitIndex({ gitDir: join(projectRoot, '.git'), version: 4, paths: ['README.md'] });
    const dartToolPath = await createDartTool(projectRoot);

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('unknown');
  });

  test('returns unknown for an index over 64 MiB', async () => {
    const projectRoot = join(fixtureRoot.rootDir, 'app');

    await createGitIndex({
      gitDir: join(projectRoot, '.git'),
      version: 2,
      paths: [PACKAGE_CONFIG_PATH],
    });
    // A sparse extension, so the fixture allocates no more blocks.
    await truncate(join(projectRoot, '.git', 'index'), 64 * 1024 * 1024 + 1);
    const dartToolPath = await createDartTool(projectRoot);

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('unknown');
  });

  test('returns unknown for a repository with no index', async () => {
    const projectRoot = join(fixtureRoot.rootDir, 'app');

    await createGitEntry({ folder: projectRoot, gitEntry: 'folder' });
    const dartToolPath = await createDartTool(projectRoot);

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('unknown');
  });

  test('returns unknown outside any repository', async () => {
    const dartToolPath = await createDartTool(join(fixtureRoot.rootDir, 'app'));

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('unknown');
  });

  test('returns unknown for a .jj working copy with no .git above', async () => {
    const projectRoot = join(fixtureRoot.rootDir, 'app');

    await mkdir(join(projectRoot, '.jj'), { recursive: true });
    const dartToolPath = await createDartTool(projectRoot);

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('unknown');
  });

  test('returns unknown for a colocated .jj beside a .git that does not name the package config', async () => {
    const projectRoot = join(fixtureRoot.rootDir, 'app');
    const dartToolPath = await createUntrackedProject(projectRoot);

    await mkdir(join(projectRoot, '.jj'));

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('unknown');
  });

  test('returns unknown for a .hg working copy inside a git repository that does not name the package config', async () => {
    const repoRoot = join(fixtureRoot.rootDir, 'repo');
    const projectRoot = join(repoRoot, 'app');

    await createGitIndex({
      gitDir: join(repoRoot, '.git'),
      version: 2,
      paths: ['app/pubspec.yaml'],
    });
    await mkdir(join(projectRoot, '.hg'), { recursive: true });
    const dartToolPath = await createDartTool(projectRoot);

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('unknown');
  });

  test('returns unknown for a .svn working copy two folders above the repository', async () => {
    const svnRoot = join(fixtureRoot.rootDir, 'svn');

    await mkdir(join(svnRoot, '.svn'), { recursive: true });
    const dartToolPath = await createUntrackedProject(join(svnRoot, 'work', 'app'));

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('unknown');
  });

  test('returns unknown for the exact .hg two folders above the repository', async () => {
    const hgRoot = join(fixtureRoot.rootDir, 'hg');

    await mkdir(join(hgRoot, '.hg'), { recursive: true });
    const dartToolPath = await createUntrackedProject(join(hgRoot, 'work', 'app'));

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('unknown');
  });

  test('returns untracked below folders that hold only case variants of markers, CVs and .HG', async () => {
    const outerRoot = join(fixtureRoot.rootDir, 'outer');
    const innerRoot = join(outerRoot, 'inner');

    await mkdir(join(outerRoot, 'CVs'), { recursive: true });
    await mkdir(join(innerRoot, '.HG'), { recursive: true });
    const dartToolPath = await createUntrackedProject(join(innerRoot, 'app'));

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('untracked');
  });

  test('returns untracked with CVS in the project folder but not in .dart_tool', async () => {
    const projectRoot = join(fixtureRoot.rootDir, 'app');
    const dartToolPath = await createUntrackedProject(projectRoot);

    await mkdir(join(projectRoot, 'CVS'));

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('untracked');
  });

  test('returns unknown with CVS in .dart_tool', async () => {
    const dartToolPath = await createUntrackedProject(join(fixtureRoot.rootDir, 'app'));

    await mkdir(join(dartToolPath, 'CVS'));

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('unknown');
  });

  test('returns unknown for a marker in a folder whose listing cannot be read', async () => {
    const lockedRoot = join(fixtureRoot.rootDir, 'locked');

    await mkdir(join(lockedRoot, '.hg'), { recursive: true });
    const dartToolPath = await createUntrackedProject(join(lockedRoot, 'app'));
    await chmod(lockedRoot, 0o311);

    expect(await loadPackageConfigTracking({ dartToolRealPath: dartToolPath })).toBe('unknown');
  });
});
