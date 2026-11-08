import { afterEach, beforeEach, expect, test } from 'bun:test';
import { chmod, mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEntryPlacement } from '../../../src/platform/darwin/hasDatalessFlag.js';
import type { FixtureRoot } from '../../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../../support/fixtureRoot.js';
import { describeOnPosix } from '../../support/posixOnly.js';

let fixtureRoot: FixtureRoot;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

// A test cannot create an iCloud placeholder; the flag offset was checked against `ls -lO` on one.
describeOnPosix('loadEntryPlacement on macOS', () => {
  test('places a folder and a file on this disk on disk, and a link as a link', async () => {
    const folder = join(fixtureRoot.homeDir, 'local');
    const file = join(folder, 'file.txt');
    const link = join(fixtureRoot.homeDir, 'link');

    await mkdir(folder);
    await writeFile(file, 'on disk');
    await symlink(folder, link);

    expect(loadEntryPlacement({ path: folder, kind: 'directory' })).toEqual({ kind: 'onDisk' });
    expect(loadEntryPlacement({ path: file, kind: 'file' })).toEqual({ kind: 'onDisk' });
    expect(loadEntryPlacement({ path: link, kind: 'symbolicLink' })).toEqual({ kind: 'link' });
  });

  test('cannot place a folder that does not exist, and names ENOENT', () => {
    expect(
      loadEntryPlacement({ path: join(fixtureRoot.homeDir, 'absent'), kind: 'directory' }),
    ).toEqual({ kind: 'unread', code: 'ENOENT' });
  });

  test('cannot place a folder in a folder it may not search, and names EACCES', async () => {
    const lockedFolder = join(fixtureRoot.homeDir, 'locked');
    const folder = join(lockedFolder, 'hidden');

    await mkdir(folder, { recursive: true });
    await chmod(lockedFolder, 0o000);

    try {
      expect(loadEntryPlacement({ path: folder, kind: 'directory' })).toEqual({
        kind: 'unread',
        code: 'EACCES',
      });
    } finally {
      await chmod(lockedFolder, 0o755);
    }
  });
});
