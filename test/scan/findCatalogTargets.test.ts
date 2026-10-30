import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { CatalogEntry, CatalogRoot } from '../../src/catalog/catalog.js';
import type { Environment } from '../../src/environment/buildEnvironment.js';
import { findCatalogTargets } from '../../src/scan/findCatalogTargets.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
  loadTestEnvironment,
} from '../support/fixtureRoot.js';

const TEST_NOW_MS = 1_700_000_000_000;

describe('findCatalogTargets', () => {
  let fixtureRoot: FixtureRoot;
  let environment: Environment;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
    environment = await loadTestEnvironment({ fixtureRoot, nowMs: TEST_NOW_MS });
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot });
  });

  test('a self entry gives its target only when the path exists', async () => {
    const cacheDir = join(fixtureRoot.homeDir, 'Library/Caches/example');
    await createFixtureDirectory({ path: cacheDir });
    const presentEntry = buildCatalogEntry({
      id: 'present-cache',
      root: 'home',
      path: 'Library/Caches/example',
      scope: 'self',
    });
    const missingEntry = buildCatalogEntry({
      id: 'missing-cache',
      root: 'home',
      path: 'Library/Caches/absent',
      scope: 'self',
    });

    const result = await findCatalogTargets({
      environment,
      entries: [presentEntry, missingEntry],
    });

    expect(result).toEqual({ targets: [{ entry: presentEntry, path: cacheDir }], issues: [] });
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
      scope: 'children',
    });

    const result = await findCatalogTargets({ environment, entries: [entry] });

    expect(result).toEqual({
      targets: [
        { entry, path: join(derivedDataDir, 'Alpha') },
        { entry, path: join(derivedDataDir, 'Zeta') },
        { entry, path: join(derivedDataDir, 'middle.log') },
      ],
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
      scope: 'children',
    });
    const fileEntry = buildCatalogEntry({
      id: 'file-entry',
      root: 'home',
      path: 'plain-file',
      scope: 'children',
    });

    const result = await findCatalogTargets({
      environment,
      entries: [missingEntry, fileEntry],
    });

    expect(result).toEqual({ targets: [], issues: [] });
  });

  test('a temp entry with an empty path is the temp folder itself', async () => {
    const entry = buildCatalogEntry({ id: 'temp-root', root: 'temp', path: '', scope: 'self' });

    const result = await findCatalogTargets({ environment, entries: [entry] });

    expect(result).toEqual({ targets: [{ entry, path: fixtureRoot.tempDir }], issues: [] });
  });

  test('an absolute entry takes its path as given', async () => {
    const systemLogsDir = join(fixtureRoot.rootDir, 'System/Logs');
    await createFixtureDirectory({ path: systemLogsDir });
    const entry = buildCatalogEntry({
      id: 'system-logs',
      root: 'absolute',
      path: systemLogsDir,
      scope: 'self',
    });

    const result = await findCatalogTargets({ environment, entries: [entry] });

    expect(result).toEqual({ targets: [{ entry, path: systemLogsDir }], issues: [] });
  });

  test('an unreadable children folder gives a permissionDenied issue', async () => {
    const lockedDir = join(fixtureRoot.homeDir, 'Locked');
    await createFixtureDirectory({ path: lockedDir });
    await chmod(lockedDir, 0o000);
    const entry = buildCatalogEntry({
      id: 'locked-folder',
      root: 'home',
      path: 'Locked',
      scope: 'children',
    });

    const result = await findCatalogTargets({ environment, entries: [entry] });

    expect(result).toEqual({
      targets: [],
      issues: [{ path: lockedDir, reason: 'permissionDenied', detail: 'EACCES' }],
    });
  });

  test('a self entry behind an unreadable folder gives a permissionDenied issue', async () => {
    const lockedDir = join(fixtureRoot.homeDir, 'Locked');
    await createFixtureDirectory({ path: lockedDir });
    await chmod(lockedDir, 0o000);
    const entry = buildCatalogEntry({
      id: 'inside-locked',
      root: 'home',
      path: 'Locked/inside',
      scope: 'self',
    });

    const result = await findCatalogTargets({ environment, entries: [entry] });

    expect(result).toEqual({
      targets: [],
      issues: [{ path: join(lockedDir, 'inside'), reason: 'permissionDenied', detail: 'EACCES' }],
    });
  });

  test('a self entry behind a symbolic link loop gives an unexpected issue with its code', async () => {
    const loopPath = join(fixtureRoot.homeDir, 'Loop');
    await symlink(loopPath, loopPath);
    const entry = buildCatalogEntry({
      id: 'inside-loop',
      root: 'home',
      path: 'Loop/inside',
      scope: 'self',
    });

    const result = await findCatalogTargets({ environment, entries: [entry] });

    expect(result).toEqual({
      targets: [],
      issues: [{ path: join(loopPath, 'inside'), reason: 'unexpected', detail: 'ELOOP' }],
    });
  });
});

function buildCatalogEntry(params: {
  id: string;
  root: CatalogRoot;
  path: string;
  scope: 'self' | 'children';
}): CatalogEntry {
  return {
    id: params.id,
    category: 'developer',
    title: 'Fixture entry',
    explanation: 'A fixture entry.',
    regeneration: 'Fixture regeneration.',
    risk: 'safe',
    root: params.root,
    path: params.path,
    scope: params.scope,
    ageRule: 'none',
    ownerBundleId: null,
    removal: { kind: 'delete' },
  };
}
