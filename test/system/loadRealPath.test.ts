import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { realpath, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { loadRealPath } from '../../src/system/loadRealPath.js';
import { AWAITS_WIN32_PLATFORM } from '../support/awaitsWin32Platform.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureRoot,
  deleteFixtureRoot,
} from '../support/fixtureRoot.js';

/** Skips on Windows a test that needs symbolic links. */
const testOnPosix = test.skipIf(process.platform === 'win32');

describe.skipIf(AWAITS_WIN32_PLATFORM)('loadRealPath', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  testOnPosix('resolves a link to the folder it points to', async () => {
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

  testOnPosix('returns null for a dangling link', async () => {
    const linkPath = join(fixtureRoot.homeDir, 'dangling');
    await symlink(join(fixtureRoot.homeDir, 'missing'), linkPath);

    const resolved = await loadRealPath({ path: linkPath });

    expect(resolved).toBeNull();
  });
});
