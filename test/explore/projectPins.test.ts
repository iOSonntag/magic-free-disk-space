import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, realpath, symlink, truncate, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EXPLORE_FILE_MAX_BYTES } from '../../src/explore/limits.js';
import {
  loadProjectPinFiles,
  loadProjectPins,
} from '../../src/explore/projectPins/loadProjectPins.js';
import type { ProjectPinFileKind } from '../../src/explore/projectPins/projectPins.js';
import {
  matchProjectPinFile,
  matchProjectPinFileName,
} from '../../src/explore/projectPins/projectPins.js';
import { buildProjectSearchEvidence } from '../../src/explore/projectPins/projectSearchEvidence.js';
import { selectToolPins } from '../../src/explore/projectPins/selectToolPins.js';
import type { AbsolutePath } from '../../src/path/parseAbsolutePath.js';
import { POSIX_PATH_RULES, WIN32_PATH_RULES } from '../../src/path/pathRules.js';
import { PROJECT_SEARCH_INCOMPLETE_EVIDENCE } from '../../src/platform/darwin/projectSearchEvidence.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureRoot,
  deleteFixtureRoot,
  writeFixtureTextFile,
} from '../support/fixtureRoot.js';
import {
  buildTestAbsolutePath,
  buildTestHostPath,
  hostPathRules,
} from '../support/parsedValueFixtures.js';
import { hostPlatform } from '../support/platformFixtures.js';
import { testOnPosix } from '../support/posixOnly.js';
import {
  buildTestPinFileText,
  buildTestPinFileUnfit,
  buildTestPinFileUnreadable,
  buildTestProjectPins,
} from './projectPinsFixtures.js';

const PRIVACY_DENIAL_CODE = hostPlatform.system.privacyDenialCode;

const NO_SIBLINGS: ReadonlySet<string> = new Set();

const PNPM_LOCK_SIBLINGS: ReadonlySet<string> = new Set(['package.json', 'pnpm-lock.yaml']);

describe('matchProjectPinFile', () => {
  const sharedNameKinds: [string, ProjectPinFileKind][] = [
    ['.tool-versions', 'toolVersions'],
    ['.nvmrc', 'nvmrc'],
    ['build.gradle', 'gradle'],
    ['build.gradle.kts', 'gradle'],
    ['mise.toml', 'miseConfig'],
    ['.mise.toml', 'miseConfig'],
    ['mise.local.toml', 'miseConfig'],
    ['.mise.local.toml', 'miseConfig'],
    ['rust-toolchain.toml', 'rustToolchain'],
    ['rust-toolchain', 'rustToolchain'],
    ['.fvmrc', 'fvmrc'],
    ['local.properties', 'androidLocalProperties'],
  ];

  for (const source of ['walk', 'miseTrackedConfig'] as const) {
    test(`matches every pin file name, found by ${source}`, () => {
      for (const [name, kind] of sharedNameKinds) {
        expect(
          matchProjectPinFile({
            pathRules: POSIX_PATH_RULES,
            name: name,
            siblingNames: NO_SIBLINGS,
            source: source,
          }),
        ).toBe(kind);
      }
    });

    test(`matches a package.json only beside a pnpm-lock.yaml, found by ${source}`, () => {
      expect(
        matchProjectPinFile({
          pathRules: POSIX_PATH_RULES,
          name: 'package.json',
          siblingNames: PNPM_LOCK_SIBLINGS,
          source: source,
        }),
      ).toBe('packageJson');
      expect(
        matchProjectPinFile({
          pathRules: POSIX_PATH_RULES,
          name: 'package.json',
          siblingNames: new Set(['package.json', 'package-lock.json']),
          source: source,
        }),
      ).toBeNull();
    });

    test(`matches no other name, found by ${source}`, () => {
      for (const name of ['.node-version', 'settings.gradle', 'pnpm-lock.yaml', 'tool-versions']) {
        expect(
          matchProjectPinFile({
            pathRules: POSIX_PATH_RULES,
            name: name,
            siblingNames: NO_SIBLINGS,
            source: source,
          }),
        ).toBeNull();
      }
    });
  }

  test('matches any other *.toml only as a tracked config of mise', () => {
    expect(
      matchProjectPinFile({
        pathRules: POSIX_PATH_RULES,
        name: 'config.toml',
        siblingNames: NO_SIBLINGS,
        source: 'miseTrackedConfig',
      }),
    ).toBe('miseConfig');
    expect(
      matchProjectPinFile({
        pathRules: POSIX_PATH_RULES,
        name: 'config.toml',
        siblingNames: NO_SIBLINGS,
        source: 'walk',
      }),
    ).toBeNull();
  });

  test('matches names in another case under the rules of Windows, which ignore case', () => {
    expect(
      matchProjectPinFile({
        pathRules: WIN32_PATH_RULES,
        name: '.NVMRC',
        siblingNames: NO_SIBLINGS,
        source: 'walk',
      }),
    ).toBe('nvmrc');
    expect(
      matchProjectPinFile({
        pathRules: WIN32_PATH_RULES,
        name: 'Package.json',
        siblingNames: new Set(['Package.json', 'PNPM-LOCK.YAML']),
        source: 'walk',
      }),
    ).toBe('packageJson');
    expect(
      matchProjectPinFile({
        pathRules: WIN32_PATH_RULES,
        name: 'Config.TOML',
        siblingNames: NO_SIBLINGS,
        source: 'miseTrackedConfig',
      }),
    ).toBe('miseConfig');
    expect(
      matchProjectPinFileName({
        pathRules: WIN32_PATH_RULES,
        name: 'Build.Gradle',
        source: 'walk',
      }),
    ).toBe('gradle');
  });

  test('matches no name in another case under the rules of POSIX, which match names exactly', () => {
    expect(
      matchProjectPinFile({
        pathRules: POSIX_PATH_RULES,
        name: '.NVMRC',
        siblingNames: NO_SIBLINGS,
        source: 'walk',
      }),
    ).toBeNull();
    expect(
      matchProjectPinFile({
        pathRules: POSIX_PATH_RULES,
        name: 'package.json',
        siblingNames: new Set(['package.json', 'PNPM-LOCK.YAML']),
        source: 'walk',
      }),
    ).toBeNull();
    expect(
      matchProjectPinFile({
        pathRules: POSIX_PATH_RULES,
        name: 'Config.TOML',
        siblingNames: NO_SIBLINGS,
        source: 'miseTrackedConfig',
      }),
    ).toBeNull();
    expect(
      matchProjectPinFileName({
        pathRules: POSIX_PATH_RULES,
        name: 'Build.Gradle',
        source: 'walk',
      }),
    ).toBeNull();
  });
});

/** An example path below `/work`, the same on every host. */
function buildWorkPath(relativePath: string): AbsolutePath {
  return buildTestAbsolutePath({ text: `/work/${relativePath}` });
}

describe('selectToolPins', () => {
  test('keeps the texts of the files of its kinds, each with its kind', () => {
    const selected = selectToolPins({
      pins: [
        buildTestPinFileText({
          path: buildWorkPath('a/package.json'),
          kind: 'packageJson',
          text: '{}',
        }),
        buildTestPinFileText({ path: buildWorkPath('a/.nvmrc'), kind: 'nvmrc', text: '22' }),
        buildTestPinFileText({
          path: buildWorkPath('b/.tool-versions'),
          kind: 'toolVersions',
          text: 'pnpm 9',
        }),
      ],
      kinds: ['packageJson', 'toolVersions'],
    });

    expect(selected).toEqual({
      kind: 'succeeded',
      value: {
        kind: 'texts',
        files: [
          { path: buildWorkPath('a/package.json'), kind: 'packageJson', text: '{}' },
          { path: buildWorkPath('b/.tool-versions'), kind: 'toolVersions', text: 'pnpm 9' },
        ],
      },
    });
  });

  test('gives empty texts when no file is of its kinds', () => {
    expect(selectToolPins({ pins: [], kinds: ['nvmrc'] })).toEqual({
      kind: 'succeeded',
      value: { kind: 'texts', files: [] },
    });
  });

  test('fails with the path of the first unreadable file of its kinds', () => {
    const selected = selectToolPins({
      pins: [
        buildTestPinFileText({ path: buildWorkPath('a/.nvmrc'), kind: 'nvmrc', text: '22' }),
        buildTestPinFileUnfit({ path: buildWorkPath('b/.nvmrc'), kind: 'nvmrc' }),
        buildTestPinFileUnreadable({ path: buildWorkPath('c/.nvmrc'), kind: 'nvmrc' }),
        buildTestPinFileUnreadable({ path: buildWorkPath('d/.nvmrc'), kind: 'nvmrc' }),
      ],
      kinds: ['nvmrc'],
    });

    expect(selected).toEqual({
      kind: 'failed',
      failure: {
        reason: 'fileUnreadable',
        path: '/work/c/.nvmrc',
        failure: { reason: 'permissionDenied', code: 'EACCES' },
      },
    });
  });

  test('pins every version when a file of its kinds is unfit', () => {
    const selected = selectToolPins({
      pins: [
        buildTestPinFileText({
          path: buildWorkPath('a/build.gradle'),
          kind: 'gradle',
          text: 'compileSdk 34',
        }),
        buildTestPinFileUnfit({ path: buildWorkPath('b/build.gradle'), kind: 'gradle' }),
      ],
      kinds: ['gradle'],
    });

    expect(selected).toEqual({ kind: 'succeeded', value: { kind: 'everyVersionPinned' } });
  });

  test('is changed by no unfit or unreadable file of other kinds', () => {
    const selected = selectToolPins({
      pins: [
        buildTestPinFileUnreadable({ path: buildWorkPath('a/build.gradle'), kind: 'gradle' }),
        buildTestPinFileUnfit({ path: buildWorkPath('b/mise.toml'), kind: 'miseConfig' }),
        buildTestPinFileText({ path: buildWorkPath('c/.nvmrc'), kind: 'nvmrc', text: '22' }),
      ],
      kinds: ['nvmrc'],
    });

    expect(selected).toEqual({
      kind: 'succeeded',
      value: {
        kind: 'texts',
        files: [{ path: buildWorkPath('c/.nvmrc'), kind: 'nvmrc', text: '22' }],
      },
    });
  });
});

describe('buildProjectSearchEvidence', () => {
  test('adds the incomplete-search line only when the walk was not complete', () => {
    expect(
      buildProjectSearchEvidence({
        pins: buildTestProjectPins({ files: [], isWalkComplete: false }),
        incompleteEvidence: PROJECT_SEARCH_INCOMPLETE_EVIDENCE,
      }),
    ).toEqual([PROJECT_SEARCH_INCOMPLETE_EVIDENCE]);
    expect(
      buildProjectSearchEvidence({
        pins: buildTestProjectPins({ files: [], isWalkComplete: true }),
        incompleteEvidence: PROJECT_SEARCH_INCOMPLETE_EVIDENCE,
      }),
    ).toEqual([]);
  });
});

describe('loading the pins', () => {
  let fixtureRoot: FixtureRoot;
  let homeRealPath: string;
  let trackedConfigsPath: string;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
    homeRealPath = await realpath(fixtureRoot.homeDir);
    trackedConfigsPath = join(fixtureRoot.homeDir, '.local', 'state', 'mise', 'tracked-configs');
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  async function createTrackedConfigLink(params: {
    trackedConfigsPath: string;
    name: string;
    targetPath: string;
  }): Promise<void> {
    await createFixtureDirectory({ path: params.trackedConfigsPath });
    await symlink(params.targetPath, join(params.trackedConfigsPath, params.name));
  }

  describe('loadProjectPinFiles', () => {
    test('reads each path once with its first kind, and drops a file that is gone', async () => {
      const nvmrcPath = buildTestHostPath({ text: join(fixtureRoot.homeDir, '.nvmrc') });
      await writeFile(nvmrcPath, '22\n');

      const files = await loadProjectPinFiles({
        privacyDenialCode: PRIVACY_DENIAL_CODE,
        files: [
          { path: nvmrcPath, kind: 'nvmrc' },
          { path: nvmrcPath, kind: 'toolVersions' },
          {
            path: buildTestHostPath({ text: join(fixtureRoot.homeDir, 'gone', '.nvmrc') }),
            kind: 'nvmrc',
          },
        ],
      });

      expect(files).toEqual([
        buildTestPinFileText({ path: nvmrcPath, kind: 'nvmrc', text: '22\n' }),
      ]);
    });

    test('keeps a folder and a file over the read limit as unfit', async () => {
      const folderPath = buildTestHostPath({
        text: join(fixtureRoot.homeDir, 'a', '.tool-versions'),
      });
      const largePath = buildTestHostPath({ text: join(fixtureRoot.homeDir, '.tool-versions') });
      await createFixtureDirectory({ path: folderPath });
      await writeFile(largePath, '');
      await truncate(largePath, EXPLORE_FILE_MAX_BYTES + 1);

      const files = await loadProjectPinFiles({
        privacyDenialCode: PRIVACY_DENIAL_CODE,
        files: [
          { path: folderPath, kind: 'toolVersions' },
          { path: largePath, kind: 'toolVersions' },
        ],
      });

      expect(files).toEqual([
        buildTestPinFileUnfit({ path: folderPath, kind: 'toolVersions' }),
        buildTestPinFileUnfit({ path: largePath, kind: 'toolVersions' }),
      ]);
    });

    testOnPosix('keeps a file it cannot read as unreadable', async () => {
      const gradlePath = buildTestHostPath({ text: join(fixtureRoot.homeDir, 'build.gradle') });
      await writeFile(gradlePath, 'android {}\n');
      await chmod(gradlePath, 0o000);

      try {
        const files = await loadProjectPinFiles({
          privacyDenialCode: PRIVACY_DENIAL_CODE,
          files: [{ path: gradlePath, kind: 'gradle' }],
        });

        expect(files).toEqual([buildTestPinFileUnreadable({ path: gradlePath, kind: 'gradle' })]);
      } finally {
        await chmod(gradlePath, 0o600);
      }
    });
  });

  describe('loadProjectPins', () => {
    test('reads only the walked files when mise tracks no configs', async () => {
      const nvmrcPath = buildTestHostPath({ text: join(fixtureRoot.homeDir, '.nvmrc') });
      await writeFile(nvmrcPath, '22\n');

      const pins = await loadProjectPins({
        pathRules: hostPathRules,
        privacyDenialCode: PRIVACY_DENIAL_CODE,
        homeDir: fixtureRoot.homeDir,
        walkedPinFiles: [{ path: nvmrcPath, kind: 'nvmrc' }],
        isWalkComplete: false,
      });

      expect(pins).toEqual({
        kind: 'succeeded',
        value: buildTestProjectPins({
          files: [buildTestPinFileText({ path: nvmrcPath, kind: 'nvmrc', text: '22\n' })],
          isWalkComplete: false,
        }),
      });
    });

    testOnPosix('adds the targets of the tracked configs that have a pin file name', async () => {
      const worktreePath = join(fixtureRoot.homeDir, '.claude', 'worktrees', 'one');
      const globalConfigPath = join(fixtureRoot.homeDir, '.config', 'mise', 'config.toml');
      const pnpmProjectPath = join(fixtureRoot.homeDir, 'web');
      const npmProjectPath = join(fixtureRoot.homeDir, 'tool');
      await writeFixtureTextFile({
        path: join(worktreePath, 'mise.toml'),
        text: '[tools]\nnode = "22"\n',
      });
      await writeFixtureTextFile({ path: globalConfigPath, text: '[tools]\npnpm = "12"\n' });
      await writeFixtureTextFile({ path: join(pnpmProjectPath, 'package.json'), text: '{}' });
      await writeFixtureTextFile({ path: join(pnpmProjectPath, 'pnpm-lock.yaml'), text: '' });
      await writeFixtureTextFile({ path: join(npmProjectPath, 'package.json'), text: '{}' });
      await writeFixtureTextFile({ path: join(npmProjectPath, 'notes.txt'), text: '' });
      await createTrackedConfigLink({
        trackedConfigsPath: trackedConfigsPath,
        name: 'a1',
        targetPath: join(worktreePath, 'mise.toml'),
      });
      await createTrackedConfigLink({
        trackedConfigsPath: trackedConfigsPath,
        name: 'b2',
        targetPath: globalConfigPath,
      });
      await createTrackedConfigLink({
        trackedConfigsPath: trackedConfigsPath,
        name: 'c3',
        targetPath: join(pnpmProjectPath, 'package.json'),
      });
      await createTrackedConfigLink({
        trackedConfigsPath: trackedConfigsPath,
        name: 'd4',
        targetPath: join(npmProjectPath, 'package.json'),
      });
      await createTrackedConfigLink({
        trackedConfigsPath: trackedConfigsPath,
        name: 'e5',
        targetPath: join(npmProjectPath, 'notes.txt'),
      });
      await createTrackedConfigLink({
        trackedConfigsPath: trackedConfigsPath,
        name: 'f6',
        targetPath: join(fixtureRoot.homeDir, 'gone', 'mise.toml'),
      });
      await writeFile(join(trackedConfigsPath, 'not-a-link.toml'), '[tools]\n');

      const pins = await loadProjectPins({
        pathRules: hostPathRules,
        privacyDenialCode: PRIVACY_DENIAL_CODE,
        homeDir: fixtureRoot.homeDir,
        walkedPinFiles: [],
        isWalkComplete: true,
      });

      expect(pins).toEqual({
        kind: 'succeeded',
        value: buildTestProjectPins({
          files: [
            buildTestPinFileText({
              path: buildTestHostPath({
                text: join(homeRealPath, '.claude', 'worktrees', 'one', 'mise.toml'),
              }),
              kind: 'miseConfig',
              text: '[tools]\nnode = "22"\n',
            }),
            buildTestPinFileText({
              path: buildTestHostPath({
                text: join(homeRealPath, '.config', 'mise', 'config.toml'),
              }),
              kind: 'miseConfig',
              text: '[tools]\npnpm = "12"\n',
            }),
            buildTestPinFileText({
              path: buildTestHostPath({ text: join(homeRealPath, 'web', 'package.json') }),
              kind: 'packageJson',
              text: '{}',
            }),
          ],
          isWalkComplete: true,
        }),
      });
    });

    testOnPosix('reads a file both sources found once', async () => {
      const miseConfigPath = buildTestHostPath({ text: join(homeRealPath, 'app', 'mise.toml') });
      await writeFixtureTextFile({ path: miseConfigPath, text: '[tools]\n' });
      await createTrackedConfigLink({
        trackedConfigsPath: trackedConfigsPath,
        name: 'a1',
        targetPath: miseConfigPath,
      });

      const pins = await loadProjectPins({
        pathRules: hostPathRules,
        privacyDenialCode: PRIVACY_DENIAL_CODE,
        homeDir: fixtureRoot.homeDir,
        walkedPinFiles: [{ path: miseConfigPath, kind: 'miseConfig' }],
        isWalkComplete: true,
      });

      expect(pins).toEqual({
        kind: 'succeeded',
        value: buildTestProjectPins({
          files: [
            buildTestPinFileText({ path: miseConfigPath, kind: 'miseConfig', text: '[tools]\n' }),
          ],
        }),
      });
    });

    testOnPosix('fails at the tracked-configs folder when it cannot be listed', async () => {
      await createFixtureDirectory({ path: trackedConfigsPath });
      await chmod(trackedConfigsPath, 0o000);

      try {
        const pins = await loadProjectPins({
          pathRules: hostPathRules,
          privacyDenialCode: PRIVACY_DENIAL_CODE,
          homeDir: fixtureRoot.homeDir,
          walkedPinFiles: [],
          isWalkComplete: true,
        });

        expect(pins).toEqual({
          kind: 'failed',
          failure: {
            reason: 'fileUnreadable',
            path: trackedConfigsPath,
            failure: { reason: 'permissionDenied', code: 'EACCES' },
          },
        });
      } finally {
        await chmod(trackedConfigsPath, 0o700);
      }
    });

    testOnPosix('fails at a link whose target cannot be resolved', async () => {
      const lockedPath = join(fixtureRoot.homeDir, 'locked');
      await writeFixtureTextFile({ path: join(lockedPath, 'app', 'mise.toml'), text: '[tools]\n' });
      await createTrackedConfigLink({
        trackedConfigsPath: trackedConfigsPath,
        name: 'a1',
        targetPath: join(lockedPath, 'app', 'mise.toml'),
      });
      await chmod(lockedPath, 0o000);

      try {
        const pins = await loadProjectPins({
          pathRules: hostPathRules,
          privacyDenialCode: PRIVACY_DENIAL_CODE,
          homeDir: fixtureRoot.homeDir,
          walkedPinFiles: [],
          isWalkComplete: true,
        });

        expect(pins).toEqual({
          kind: 'failed',
          failure: {
            reason: 'fileUnreadable',
            path: join(trackedConfigsPath, 'a1'),
            failure: { reason: 'permissionDenied', code: 'EACCES' },
          },
        });
      } finally {
        await chmod(lockedPath, 0o700);
      }
    });

    testOnPosix('fails at the folder of a target it cannot list', async () => {
      const projectPath = join(fixtureRoot.homeDir, 'app');
      await writeFixtureTextFile({ path: join(projectPath, 'package.json'), text: '{}' });
      await createTrackedConfigLink({
        trackedConfigsPath: trackedConfigsPath,
        name: 'a1',
        targetPath: join(projectPath, 'package.json'),
      });
      // Searchable but not listable: the link resolves, the folder's names cannot be read.
      await chmod(projectPath, 0o100);

      try {
        const pins = await loadProjectPins({
          pathRules: hostPathRules,
          privacyDenialCode: PRIVACY_DENIAL_CODE,
          homeDir: fixtureRoot.homeDir,
          walkedPinFiles: [],
          isWalkComplete: true,
        });

        expect(pins).toEqual({
          kind: 'failed',
          failure: {
            reason: 'fileUnreadable',
            path: join(homeRealPath, 'app'),
            failure: { reason: 'permissionDenied', code: 'EACCES' },
          },
        });
      } finally {
        await chmod(projectPath, 0o700);
      }
    });
  });
});
