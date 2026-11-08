import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { CatalogEntry, CatalogRoot } from '../../src/catalog/catalog.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import type { CatalogTarget } from '../../src/scan/findCatalogTargets.js';
import { findCatalogTargets } from '../../src/scan/findCatalogTargets.js';
import { buildTestCatalogEntry } from '../support/candidateFixtures.js';
import { testOnDarwin } from '../support/darwinOnly.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
} from '../support/fixtureRoot.js';
import { HOST_PLATFORM } from '../support/platformFixtures.js';
import { testOnPosix } from '../support/posixOnly.js';

const TEST_NOW_MS = 1_700_000_000_000;

const PRIVACY_DENIAL_CODE = HOST_PLATFORM.system.privacyDenialCode;

describe('findCatalogTargets', () => {
  let fixtureRoot: FixtureRoot;
  let environment: Environment;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
    environment = await loadTestEnvironment({ fixtureRoot: fixtureRoot, nowMs: TEST_NOW_MS });
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  test('a path entry gives its target only when the path exists', async () => {
    const cacheDir = join(fixtureRoot.homeDir, 'Library/Caches/example');
    await createFixtureDirectory({ path: cacheDir });
    const presentEntry = buildCatalogEntry({
      id: 'present-cache',
      root: 'home',
      path: 'Library/Caches/example',
      selection: 'path',
    });
    const missingEntry = buildCatalogEntry({
      id: 'missing-cache',
      root: 'home',
      path: 'Library/Caches/absent',
      selection: 'path',
    });

    const result = await findCatalogTargets({
      environment: environment,
      entries: [presentEntry, missingEntry],
      privacyDenialCode: PRIVACY_DENIAL_CODE,
    });

    expect(result).toEqual({
      targets: [buildTarget({ entry: presentEntry, path: cacheDir })],
      overlappingTargets: [],
      issues: [],
    });
  });

  test('a children entry gives one target per name in sorted order', async () => {
    const derivedDataDir = join(fixtureRoot.homeDir, 'Library/Developer/Xcode/DerivedData');
    await createFixtureDirectory({ path: join(derivedDataDir, 'Zeta') });
    await createFixtureDirectory({ path: join(derivedDataDir, 'Alpha') });
    await createFixtureFile({
      path: join(derivedDataDir, 'middle.log'),
      sizeBytes: 10,
      modifiedMs: TEST_NOW_MS,
    });
    const entry = buildCatalogEntry({
      id: 'derived-data',
      root: 'home',
      path: 'Library/Developer/Xcode/DerivedData',
      selection: 'children',
    });

    const result = await findCatalogTargets({
      environment: environment,
      entries: [entry],
      privacyDenialCode: PRIVACY_DENIAL_CODE,
    });

    expect(result).toEqual({
      targets: [
        buildTarget({ entry: entry, path: join(derivedDataDir, 'Alpha') }),
        buildTarget({ entry: entry, path: join(derivedDataDir, 'Zeta') }),
        buildTarget({ entry: entry, path: join(derivedDataDir, 'middle.log') }),
      ],
      overlappingTargets: [],
      issues: [],
    });
  });

  test('a children entry adds nothing for a missing folder or a file', async () => {
    await createFixtureFile({
      path: join(fixtureRoot.homeDir, 'plain-file'),
      sizeBytes: 10,
      modifiedMs: TEST_NOW_MS,
    });
    const missingEntry = buildCatalogEntry({
      id: 'missing-folder',
      root: 'home',
      path: 'absent',
      selection: 'children',
    });
    const fileEntry = buildCatalogEntry({
      id: 'file-entry',
      root: 'home',
      path: 'plain-file',
      selection: 'children',
    });

    const result = await findCatalogTargets({
      environment: environment,
      entries: [missingEntry, fileEntry],
      privacyDenialCode: PRIVACY_DENIAL_CODE,
    });

    expect(result).toEqual({ targets: [], overlappingTargets: [], issues: [] });
  });

  test('a temp entry with an empty path is the temp folder itself', async () => {
    const entry = buildCatalogEntry({ id: 'temp-root', root: 'temp', path: '', selection: 'path' });

    const result = await findCatalogTargets({
      environment: environment,
      entries: [entry],
      privacyDenialCode: PRIVACY_DENIAL_CODE,
    });

    expect(result).toEqual({
      targets: [buildTarget({ entry: entry, path: fixtureRoot.tempDir })],
      overlappingTargets: [],
      issues: [],
    });
  });

  // Only macOS has a per-user folder of the system's caches; Windows keeps its caches in AppData.
  testOnDarwin('a user cache entry lies below the user cache folder', async () => {
    const metalDir = join(fixtureRoot.userCacheDir, 'com.example.app', 'com.apple.metal');
    await createFixtureDirectory({ path: metalDir });
    const entry = buildCatalogEntry({
      id: 'metal-cache',
      root: 'userCache',
      path: 'com.example.app/com.apple.metal',
      selection: 'path',
    });

    const result = await findCatalogTargets({
      environment: environment,
      entries: [entry],
      privacyDenialCode: PRIVACY_DENIAL_CODE,
    });

    expect(result).toEqual({
      targets: [buildTarget({ entry: entry, path: metalDir })],
      overlappingTargets: [],
      issues: [],
    });
  });

  test('an absolute entry takes its path as given', async () => {
    const systemLogsDir = join(fixtureRoot.rootDir, 'System/Logs');
    await createFixtureDirectory({ path: systemLogsDir });
    const entry = buildCatalogEntry({
      id: 'system-logs',
      root: 'absolute',
      path: systemLogsDir,
      selection: 'path',
    });

    const result = await findCatalogTargets({
      environment: environment,
      entries: [entry],
      privacyDenialCode: PRIVACY_DENIAL_CODE,
    });

    expect(result).toEqual({
      targets: [buildTarget({ entry: entry, path: systemLogsDir })],
      overlappingTargets: [],
      issues: [],
    });
  });

  test('a later item that equals or holds a read earlier path is overlapping', async () => {
    const cachesDir = join(fixtureRoot.homeDir, 'Library/Caches');
    await createFixtureDirectory({ path: join(cachesDir, 'tool/data') });
    await createFixtureDirectory({ path: join(cachesDir, 'other') });
    const toolEntry = buildCatalogEntry({
      id: 'tool-data',
      root: 'home',
      path: 'Library/Caches/tool/data',
      selection: 'path',
    });
    const cachesEntry = buildCatalogEntry({
      id: 'caches',
      root: 'home',
      path: 'Library/Caches',
      selection: 'children',
    });

    const result = await findCatalogTargets({
      environment: environment,
      entries: [toolEntry, cachesEntry],
      privacyDenialCode: PRIVACY_DENIAL_CODE,
    });

    expect(result).toEqual({
      targets: [
        buildTarget({ entry: toolEntry, path: join(cachesDir, 'tool/data') }),
        buildTarget({ entry: cachesEntry, path: join(cachesDir, 'other') }),
      ],
      overlappingTargets: [buildTarget({ entry: cachesEntry, path: join(cachesDir, 'tool') })],
      issues: [],
    });
  });

  test('a later advice item that holds a read earlier path stays a target', async () => {
    const userDataDir = join(fixtureRoot.homeDir, 'Library/Developer/Example/UserData');
    await createFixtureDirectory({ path: join(userDataDir, 'Previews') });
    const previewsEntry = buildCatalogEntry({
      id: 'previews',
      root: 'home',
      path: 'Library/Developer/Example/UserData/Previews',
      selection: 'path',
    });
    const userDataEntry = buildTestCatalogEntry({
      id: 'user-data',
      root: 'home',
      path: 'Library/Developer/Example/UserData',
      selection: { kind: 'path' },
      removal: { kind: 'advice', advice: 'Tidy it.', carvedPaths: ['Previews'], opener: null },
    });

    const result = await findCatalogTargets({
      environment: environment,
      entries: [previewsEntry, userDataEntry],
      privacyDenialCode: PRIVACY_DENIAL_CODE,
    });

    expect(result).toEqual({
      targets: [
        buildTarget({ entry: previewsEntry, path: join(userDataDir, 'Previews') }),
        buildTarget({ entry: userDataEntry, path: userDataDir }),
      ],
      overlappingTargets: [],
      issues: [],
    });
  });

  test('a later item that holds a missing earlier path stays a target', async () => {
    const userDataDir = join(fixtureRoot.homeDir, 'Library/Developer/Example/UserData');
    await createFixtureDirectory({ path: userDataDir });
    const previewsEntry = buildCatalogEntry({
      id: 'previews',
      root: 'home',
      path: 'Library/Developer/Example/UserData/Previews',
      selection: 'path',
    });
    const userDataEntry = buildCatalogEntry({
      id: 'user-data',
      root: 'home',
      path: 'Library/Developer/Example/UserData',
      selection: 'path',
    });

    const result = await findCatalogTargets({
      environment: environment,
      entries: [previewsEntry, userDataEntry],
      privacyDenialCode: PRIVACY_DENIAL_CODE,
    });

    expect(result).toEqual({
      targets: [buildTarget({ entry: userDataEntry, path: userDataDir })],
      overlappingTargets: [],
      issues: [],
    });
  });

  testOnPosix('an unreadable children folder gives a permissionDenied issue', async () => {
    const lockedDir = join(fixtureRoot.homeDir, 'Locked');
    await createFixtureDirectory({ path: lockedDir });
    await chmod(lockedDir, 0o000);
    const entry = buildCatalogEntry({
      id: 'locked-folder',
      root: 'home',
      path: 'Locked',
      selection: 'children',
    });

    const result = await findCatalogTargets({
      environment: environment,
      entries: [entry],
      privacyDenialCode: PRIVACY_DENIAL_CODE,
    });

    expect(result).toEqual({
      targets: [],
      overlappingTargets: [],
      issues: [{ path: lockedDir, reason: 'permissionDenied', detail: 'EACCES' }],
    });
  });

  testOnPosix(
    'a path entry behind an unreadable folder gives a permissionDenied issue',
    async () => {
      const lockedDir = join(fixtureRoot.homeDir, 'Locked');
      await createFixtureDirectory({ path: lockedDir });
      await chmod(lockedDir, 0o000);
      const entry = buildCatalogEntry({
        id: 'inside-locked',
        root: 'home',
        path: 'Locked/inside',
        selection: 'path',
      });

      const result = await findCatalogTargets({
        environment: environment,
        entries: [entry],
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      });

      expect(result).toEqual({
        targets: [],
        overlappingTargets: [],
        issues: [{ path: join(lockedDir, 'inside'), reason: 'permissionDenied', detail: 'EACCES' }],
      });
    },
  );

  testOnPosix(
    'a path entry behind a symbolic link loop gives an unexpected issue with its code',
    async () => {
      const loopPath = join(fixtureRoot.homeDir, 'Loop');
      await symlink(loopPath, loopPath);
      const entry = buildCatalogEntry({
        id: 'inside-loop',
        root: 'home',
        path: 'Loop/inside',
        selection: 'path',
      });

      const result = await findCatalogTargets({
        environment: environment,
        entries: [entry],
        privacyDenialCode: PRIVACY_DENIAL_CODE,
      });

      expect(result).toEqual({
        targets: [],
        overlappingTargets: [],
        issues: [{ path: join(loopPath, 'inside'), reason: 'unexpected', detail: 'ELOOP' }],
      });
    },
  );
});

function buildCatalogEntry(params: {
  id: string;
  root: CatalogRoot;
  path: string;
  selection: 'path' | 'children';
}): CatalogEntry {
  return buildTestCatalogEntry({
    id: params.id,
    root: params.root,
    path: params.path,
    selection: { kind: params.selection },
  });
}

/** A path or a children selection gives one target per item, which is its item path. */
function buildTarget(params: { entry: CatalogEntry; path: string }): CatalogTarget {
  return { entry: params.entry, path: params.path, targetPaths: [params.path] };
}
