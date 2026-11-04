import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hasRecallAttribute, isEntryEvicted } from '../../../src/platform/win32/isEntryEvicted.js';
import type { FixtureRoot } from '../../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../../support/fixtureRoot.js';

/** `FILE_ATTRIBUTE_DIRECTORY`, which a folder carries whether a cloud store keeps it or not. */
const FILE_ATTRIBUTE_DIRECTORY = 0x10;

describe('hasRecallAttribute', () => {
  test('is true for an entry a read downloads and for one an open downloads', () => {
    expect(hasRecallAttribute({ attributes: 0x400000 | 0x20 })).toBe(true);
    expect(hasRecallAttribute({ attributes: 0x40000 | FILE_ATTRIBUTE_DIRECTORY })).toBe(true);
  });

  test('is false for a pinned, an offline, or a reparse-point entry without a recall bit', () => {
    // FILE_ATTRIBUTE_PINNED, FILE_ATTRIBUTE_OFFLINE, FILE_ATTRIBUTE_REPARSE_POINT.
    expect(hasRecallAttribute({ attributes: 0x80000 | 0x1000 | 0x400 })).toBe(false);
    expect(hasRecallAttribute({ attributes: FILE_ATTRIBUTE_DIRECTORY })).toBe(false);
  });
});

describe.skipIf(process.platform !== 'win32')('isEntryEvicted on Windows', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  test('is false for a file and a folder on the PC', async () => {
    const folderPath = join(fixtureRoot.homeDir, 'folder');
    const filePath = join(folderPath, 'file.txt');
    await mkdir(folderPath);
    await writeFile(filePath, 'on this PC');

    expect(isEntryEvicted({ path: folderPath, kind: 'directory' })).toBe(false);
    expect(isEntryEvicted({ path: filePath, kind: 'file' })).toBe(false);
  });

  test('is false for a path it cannot read', () => {
    expect(isEntryEvicted({ path: join(fixtureRoot.homeDir, 'missing'), kind: 'file' })).toBe(
      false,
    );
  });
});
