import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  decideEntryPlacement,
  loadEntryPlacement,
} from '../../../src/platform/win32/loadEntryPlacement.js';
import type { FixtureRoot } from '../../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../../support/fixtureRoot.js';
import {
  FILE_ATTRIBUTE_ARCHIVE,
  FILE_ATTRIBUTE_DIRECTORY,
  FILE_ATTRIBUTE_OFFLINE,
  FILE_ATTRIBUTE_PINNED,
  FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS,
  FILE_ATTRIBUTE_RECALL_ON_OPEN,
  FILE_ATTRIBUTE_REPARSE_POINT,
} from '../../support/windowsFileAttributes.js';
import { describeOnWindows } from '../../support/windowsOnly.js';

describe('decideEntryPlacement', () => {
  test('places an entry a read downloads and one an open downloads in the cloud only', () => {
    expect(
      decideEntryPlacement({
        attributes: FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS | FILE_ATTRIBUTE_ARCHIVE,
      }),
    ).toEqual({ kind: 'cloudOnly' });
    expect(
      decideEntryPlacement({
        attributes: FILE_ATTRIBUTE_RECALL_ON_OPEN | FILE_ATTRIBUTE_DIRECTORY,
      }),
    ).toEqual({ kind: 'cloudOnly' });
  });

  test('places a placeholder that shows its reparse point in the cloud only, never as a link', () => {
    expect(
      decideEntryPlacement({
        attributes:
          FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS |
          FILE_ATTRIBUTE_REPARSE_POINT |
          FILE_ATTRIBUTE_ARCHIVE,
      }),
    ).toEqual({ kind: 'cloudOnly' });
  });

  test('places any other entry with a reparse point as a link, folder or file', () => {
    expect(
      decideEntryPlacement({ attributes: FILE_ATTRIBUTE_REPARSE_POINT | FILE_ATTRIBUTE_DIRECTORY }),
    ).toEqual({ kind: 'link' });
    expect(
      decideEntryPlacement({ attributes: FILE_ATTRIBUTE_REPARSE_POINT | FILE_ATTRIBUTE_ARCHIVE }),
    ).toEqual({ kind: 'link' });
  });

  test('places a pinned, an offline, or a plain entry on this PC', () => {
    expect(
      decideEntryPlacement({ attributes: FILE_ATTRIBUTE_PINNED | FILE_ATTRIBUTE_OFFLINE }),
    ).toEqual({ kind: 'onDisk' });
    expect(decideEntryPlacement({ attributes: FILE_ATTRIBUTE_DIRECTORY })).toEqual({
      kind: 'onDisk',
    });
    expect(decideEntryPlacement({ attributes: FILE_ATTRIBUTE_ARCHIVE })).toEqual({
      kind: 'onDisk',
    });
  });
});

describe('loadEntryPlacement', () => {
  test('cannot place a path that is no absolute Windows path, and names EINVAL', () => {
    expect(loadEntryPlacement({ path: 'cache\\folder', kind: 'directory' })).toEqual({
      kind: 'unread',
      code: 'EINVAL',
    });
  });
});

describeOnWindows('loadEntryPlacement on Windows', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  test('places a junction as a link, and a plain folder and a plain file on this PC', async () => {
    const folderPath = join(fixtureRoot.homeDir, 'folder');
    const filePath = join(folderPath, 'file.txt');
    const junctionPath = join(fixtureRoot.homeDir, 'junction');
    await mkdir(folderPath);
    await writeFile(filePath, 'on this PC');
    await symlink(folderPath, junctionPath, 'junction');

    expect(loadEntryPlacement({ path: junctionPath, kind: 'symbolicLink' })).toEqual({
      kind: 'link',
    });
    expect(loadEntryPlacement({ path: folderPath, kind: 'directory' })).toEqual({
      kind: 'onDisk',
    });
    expect(loadEntryPlacement({ path: filePath, kind: 'file' })).toEqual({ kind: 'onDisk' });
  });

  test('cannot place a path whose attributes cannot be read, and names the code of the call', () => {
    // `ERROR_FILE_NOT_FOUND`, which the deletion reads by the name Bun gives it.
    expect(
      loadEntryPlacement({ path: join(fixtureRoot.homeDir, 'missing'), kind: 'file' }),
    ).toEqual({ kind: 'unread', code: 'ENOENT' });
  });
});
