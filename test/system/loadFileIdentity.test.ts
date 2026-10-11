import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, realpath, symlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { basename, dirname, join } from 'node:path';
import { loadFileIdentity } from '../../src/system/loadFileIdentity.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
} from '../support/fixtureRoot.js';

const fixtureModifiedMs = Date.UTC(2024, 0, 15, 12, 0, 0);

async function loadExpectedRealPath(params: { path: string }): Promise<string> {
  const parentRealPath = await realpath(dirname(params.path));

  return join(parentRealPath, basename(params.path));
}

describe('loadFileIdentity', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  test('reads a socket as other, resolving it through its folder', async () => {
    const socketPath = join(fixtureRoot.rootDir, 's');
    const server = createServer();

    await new Promise<void>((resolve) => {
      server.listen(socketPath, resolve);
    });

    try {
      const identity = await loadFileIdentity({ path: socketPath });

      expect(identity).toMatchObject({
        kind: 'succeeded',
        value: { kind: 'other', realPath: await loadExpectedRealPath({ path: socketPath }) },
      });
    } finally {
      server.close();
    }
  });

  test('reports a file with the real path of its parent folder', async () => {
    const filePath = join(fixtureRoot.homeDir, 'notes.txt');
    await createFixtureFile({ path: filePath, sizeBytes: 10, modifiedMs: fixtureModifiedMs });

    const result = await loadFileIdentity({ path: filePath });
    const expectedRealPath = await loadExpectedRealPath({ path: filePath });

    expect(result).toEqual({
      kind: 'succeeded',
      value: {
        dev: expect.any(BigInt),
        ino: expect.any(BigInt),
        kind: 'file',
        realPath: expectedRealPath,
      },
    });
  });

  test('reports a directory with the real path of its parent folder', async () => {
    const directoryPath = join(fixtureRoot.homeDir, 'folder');
    await createFixtureDirectory({ path: directoryPath });

    const result = await loadFileIdentity({ path: directoryPath });
    const expectedRealPath = await loadExpectedRealPath({ path: directoryPath });

    expect(result).toEqual({
      kind: 'succeeded',
      value: {
        dev: expect.any(BigInt),
        ino: expect.any(BigInt),
        kind: 'directory',
        realPath: expectedRealPath,
      },
    });
  });

  test('reports a symbolic link as itself, with its own name in realPath', async () => {
    const targetPath = join(fixtureRoot.homeDir, 'target.txt');
    const linkPath = join(fixtureRoot.homeDir, 'link-to-target');
    await createFixtureFile({ path: targetPath, sizeBytes: 10, modifiedMs: fixtureModifiedMs });
    await symlink(targetPath, linkPath);

    const result = await loadFileIdentity({ path: linkPath });
    const expectedRealPath = await loadExpectedRealPath({ path: linkPath });

    expect(result).toEqual({
      kind: 'succeeded',
      value: {
        dev: expect.any(BigInt),
        ino: expect.any(BigInt),
        kind: 'symbolicLink',
        realPath: expectedRealPath,
      },
    });
  });

  test('fails with missing and ENOENT when the path does not exist', async () => {
    const missingPath = join(fixtureRoot.homeDir, 'missing.txt');

    const result = await loadFileIdentity({ path: missingPath });

    expect(result).toEqual({ kind: 'failed', failure: { reason: 'missing', code: 'ENOENT' } });
  });

  test('fails with permissionDenied for a child of a folder that cannot be read', async () => {
    const lockedFolderPath = join(fixtureRoot.homeDir, 'locked');
    const childPath = join(lockedFolderPath, 'child.txt');
    await createFixtureDirectory({ path: lockedFolderPath });
    await createFixtureFile({ path: childPath, sizeBytes: 10, modifiedMs: fixtureModifiedMs });
    await chmod(lockedFolderPath, 0o000);

    const result = await loadFileIdentity({ path: childPath });

    expect(result).toEqual({
      kind: 'failed',
      failure: { reason: 'permissionDenied', code: 'EACCES' },
    });
  });
});
