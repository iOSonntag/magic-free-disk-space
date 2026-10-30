import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadFileText } from '../../src/system/loadFileText.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureRoot,
  deleteFixtureRoot,
} from '../support/fixtureRoot.js';

describe('loadFileText', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  test('returns the text of the file', async () => {
    const filePath = join(fixtureRoot.homeDir, 'version');
    await writeFile(filePath, '3.11.0\n');

    const text = await loadFileText({ path: filePath });

    expect(text).toBe('3.11.0\n');
  });

  test('returns null when the file does not exist', async () => {
    const text = await loadFileText({ path: join(fixtureRoot.homeDir, 'missing') });

    expect(text).toBeNull();
  });

  test('returns null when the path is a folder', async () => {
    const folderPath = join(fixtureRoot.homeDir, 'folder');
    await createFixtureDirectory({ path: folderPath });

    const text = await loadFileText({ path: folderPath });

    expect(text).toBeNull();
  });
});
