import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, writeFile } from 'node:fs/promises';
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

    const text = await loadFileText({ path: filePath, maxBytes: 64 });

    expect(text).toEqual({ kind: 'succeeded', value: '3.11.0\n' });
  });

  test('fails as tooLarge when the file holds more than the bound', async () => {
    const filePath = join(fixtureRoot.homeDir, 'version');
    await writeFile(filePath, '3.11.0\n');

    const text = await loadFileText({ path: filePath, maxBytes: 6 });

    expect(text).toEqual({ kind: 'failed', failure: { reason: 'tooLarge', maxBytes: 6 } });
  });

  test('fails as missing when the file does not exist', async () => {
    const text = await loadFileText({ path: join(fixtureRoot.homeDir, 'missing'), maxBytes: 64 });

    expect(text).toEqual({ kind: 'failed', failure: { reason: 'missing', code: 'ENOENT' } });
  });

  test('fails as notFile when the path is a folder', async () => {
    const folderPath = join(fixtureRoot.homeDir, 'folder');
    await createFixtureDirectory({ path: folderPath });

    const text = await loadFileText({ path: folderPath, maxBytes: 64 });

    expect(text).toEqual({ kind: 'failed', failure: { reason: 'notFile' } });
  });

  test('fails as permissionDenied, never as missing, when the file cannot be read', async () => {
    const filePath = join(fixtureRoot.homeDir, 'version');
    await writeFile(filePath, '3.11.0\n');
    await chmod(filePath, 0o000);

    try {
      const text = await loadFileText({ path: filePath, maxBytes: 64 });

      expect(text).toEqual({
        kind: 'failed',
        failure: { reason: 'permissionDenied', code: 'EACCES' },
      });
    } finally {
      await chmod(filePath, 0o600);
    }
  });
});
