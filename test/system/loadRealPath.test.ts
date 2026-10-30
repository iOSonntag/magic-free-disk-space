import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { realpath, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { loadRealPath } from '../../src/system/loadRealPath.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureRoot,
  deleteFixtureRoot,
} from '../support/fixtureRoot.js';

describe('loadRealPath', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  test('resolves a link to the folder it points to', async () => {
    const folderPath = join(fixtureRoot.homeDir, 'folder');
    const linkPath = join(fixtureRoot.homeDir, 'link');
    await createFixtureDirectory({ path: folderPath });
    await symlink(folderPath, linkPath);

    const resolved = await loadRealPath({ path: linkPath });

    expect(resolved).toBe(await realpath(folderPath));
  });

  test('returns null when nothing is there', async () => {
    const resolved = await loadRealPath({ path: join(fixtureRoot.homeDir, 'missing') });

    expect(resolved).toBeNull();
  });

  test('returns null for a dangling link', async () => {
    const linkPath = join(fixtureRoot.homeDir, 'dangling');
    await symlink(join(fixtureRoot.homeDir, 'missing'), linkPath);

    const resolved = await loadRealPath({ path: linkPath });

    expect(resolved).toBeNull();
  });
});
