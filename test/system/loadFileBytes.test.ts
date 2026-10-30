import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadFileBytes } from '../../src/system/loadFileBytes.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureRoot,
  deleteFixtureRoot,
} from '../support/fixtureRoot.js';

describe('loadFileBytes', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  test('returns the bytes of the file', async () => {
    const filePath = join(fixtureRoot.homeDir, 'index');
    await writeFile(filePath, new Uint8Array([0x44, 0x49, 0x52, 0x43, 0x00]));

    const bytes = await loadFileBytes({ path: filePath, maxBytes: 5 });

    expect(bytes).toEqual(new Uint8Array([0x44, 0x49, 0x52, 0x43, 0x00]));
  });

  test('returns null when the file holds more than the bound', async () => {
    const filePath = join(fixtureRoot.homeDir, 'index');
    await writeFile(filePath, new Uint8Array(6));

    const bytes = await loadFileBytes({ path: filePath, maxBytes: 5 });

    expect(bytes).toBeNull();
  });

  test('returns null when the file does not exist', async () => {
    const bytes = await loadFileBytes({ path: join(fixtureRoot.homeDir, 'missing'), maxBytes: 5 });

    expect(bytes).toBeNull();
  });

  test('returns null when the path is a folder', async () => {
    const folderPath = join(fixtureRoot.homeDir, 'folder');
    await createFixtureDirectory({ path: folderPath });

    const bytes = await loadFileBytes({ path: folderPath, maxBytes: 5 });

    expect(bytes).toBeNull();
  });
});
