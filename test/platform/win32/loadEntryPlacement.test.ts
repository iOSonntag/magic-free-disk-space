import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  decideEntryPlacement,
  loadEntryPlacement,
} from '../../../src/platform/win32/loadEntryPlacement.js';
import type { FixtureRoot } from '../../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../../support/fixtureRoot.js';

/** `FILE_ATTRIBUTE_DIRECTORY`, which a folder carries whether a cloud store keeps it or not. */
const FILE_ATTRIBUTE_DIRECTORY = 0x10;

const FILE_ATTRIBUTE_ARCHIVE = 0x20;

const FILE_ATTRIBUTE_REPARSE_POINT = 0x400;

const FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS = 0x400000;

const FILE_ATTRIBUTE_RECALL_ON_OPEN = 0x40000;

describe('decideEntryPlacement', () => {
  test('places an entry a read downloads and one an open downloads in the cloud only', () => {
    expect(
      decideEntryPlacement({
        attributes: FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS | FILE_ATTRIBUTE_ARCHIVE,
      }),
    ).toBe('cloudOnly');
    expect(
      decideEntryPlacement({
        attributes: FILE_ATTRIBUTE_RECALL_ON_OPEN | FILE_ATTRIBUTE_DIRECTORY,
      }),
    ).toBe('cloudOnly');
  });

  test('places a placeholder that shows its reparse point in the cloud only, never as a link', () => {
    expect(
      decideEntryPlacement({
        attributes:
          FILE_ATTRIBUTE_RECALL_ON_DATA_ACCESS |
          FILE_ATTRIBUTE_REPARSE_POINT |
          FILE_ATTRIBUTE_ARCHIVE,
      }),
    ).toBe('cloudOnly');
  });

  test('places any other entry with a reparse point as a link, folder or file', () => {
    expect(
      decideEntryPlacement({ attributes: FILE_ATTRIBUTE_REPARSE_POINT | FILE_ATTRIBUTE_DIRECTORY }),
    ).toBe('link');
    expect(
      decideEntryPlacement({ attributes: FILE_ATTRIBUTE_REPARSE_POINT | FILE_ATTRIBUTE_ARCHIVE }),
    ).toBe('link');
  });

  test('places a pinned, an offline, or a plain entry on this PC', () => {
    // FILE_ATTRIBUTE_PINNED, FILE_ATTRIBUTE_OFFLINE.
    expect(decideEntryPlacement({ attributes: 0x80000 | 0x1000 })).toBe('onDisk');
    expect(decideEntryPlacement({ attributes: FILE_ATTRIBUTE_DIRECTORY })).toBe('onDisk');
    expect(decideEntryPlacement({ attributes: FILE_ATTRIBUTE_ARCHIVE })).toBe('onDisk');
  });
});

describe.skipIf(process.platform !== 'win32')('loadEntryPlacement on Windows', () => {
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

    expect(loadEntryPlacement({ path: junctionPath, kind: 'symbolicLink' })).toBe('link');
    expect(loadEntryPlacement({ path: folderPath, kind: 'directory' })).toBe('onDisk');
    expect(loadEntryPlacement({ path: filePath, kind: 'file' })).toBe('onDisk');
  });

  test('places a path it cannot read on this PC', () => {
    expect(loadEntryPlacement({ path: join(fixtureRoot.homeDir, 'missing'), kind: 'file' })).toBe(
      'onDisk',
    );
  });
});
