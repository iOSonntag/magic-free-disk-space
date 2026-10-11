import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { loadDirectoryNames } from '../../src/system/loadDirectoryNames.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
} from '../support/fixtureRoot.js';

const fixtureModifiedMs = Date.UTC(2024, 0, 15, 12, 0, 0);

describe('loadDirectoryNames', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  test('returns the names of files and folders in sorted order', async () => {
    const folderPath = join(fixtureRoot.homeDir, 'folder');
    await createFixtureDirectory({ path: join(folderPath, 'beta') });
    await createFixtureFile({
      path: join(folderPath, 'zeta.txt'),
      sizeBytes: 10,
      modifiedMs: fixtureModifiedMs,
    });
    await createFixtureFile({
      path: join(folderPath, 'alpha.txt'),
      sizeBytes: 10,
      modifiedMs: fixtureModifiedMs,
    });

    const result = await loadDirectoryNames({ path: folderPath });

    expect(result).toEqual({ kind: 'succeeded', value: ['alpha.txt', 'beta', 'zeta.txt'] });
  });

  test('fails with missing when the folder does not exist', async () => {
    const missingPath = join(fixtureRoot.homeDir, 'missing');

    const result = await loadDirectoryNames({ path: missingPath });

    expect(result).toEqual({ kind: 'failed', failure: { reason: 'missing', code: 'ENOENT' } });
  });

  test('fails with notDirectory when the path is a file', async () => {
    const filePath = join(fixtureRoot.homeDir, 'notes.txt');
    await createFixtureFile({ path: filePath, sizeBytes: 10, modifiedMs: fixtureModifiedMs });

    const result = await loadDirectoryNames({ path: filePath });

    expect(result).toEqual({
      kind: 'failed',
      failure: { reason: 'notDirectory', code: 'ENOTDIR' },
    });
  });

  test('fails with permissionDenied when the folder cannot be read', async () => {
    const lockedFolderPath = join(fixtureRoot.homeDir, 'locked');
    await createFixtureDirectory({ path: lockedFolderPath });
    await chmod(lockedFolderPath, 0o000);

    const result = await loadDirectoryNames({ path: lockedFolderPath });

    expect(result).toEqual({
      kind: 'failed',
      failure: { reason: 'permissionDenied', code: 'EACCES' },
    });
  });
});
