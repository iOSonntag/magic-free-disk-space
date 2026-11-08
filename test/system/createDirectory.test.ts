import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createDirectory } from '../../src/system/createDirectory.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../support/fixtureRoot.js';
import { testOnPosix } from '../support/posixOnly.js';

describe('createDirectory', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  test('creates the folder and its missing parents, and takes a folder already there as a success', async () => {
    const path = join(fixtureRoot.homeDir, 'parent', 'child');

    const created = await createDirectory({ path: path, ownerOnlyModes: null });
    const createdAgain = await createDirectory({ path: path, ownerOnlyModes: null });

    expect(created).toEqual({ kind: 'succeeded', value: null });
    expect(createdAgain).toEqual({ kind: 'succeeded', value: null });
    expect((await stat(path)).isDirectory()).toBe(true);
  });

  testOnPosix(
    'creates the folder and its parents with the directory mode it is given',
    async () => {
      const parentPath = join(fixtureRoot.homeDir, 'parent');
      const path = join(parentPath, 'child');

      await createDirectory({ path: path, ownerOnlyModes: { directoryMode: 0o700 } });

      expect((await stat(path)).mode & 0o777).toBe(0o700);
      expect((await stat(parentPath)).mode & 0o777).toBe(0o700);
    },
  );

  testOnPosix('fails with the code of the system when a file stands in the way', async () => {
    const filePath = join(fixtureRoot.homeDir, 'file');
    await writeFile(filePath, '');

    const created = await createDirectory({
      path: join(filePath, 'child'),
      ownerOnlyModes: null,
    });

    expect(created).toEqual({ kind: 'failed', failure: { code: 'ENOTDIR' } });
  });
});
