import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, truncate, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EXPLORE_FILE_MAX_BYTES } from '../../src/explore/limits.js';
import {
  loadExploreDirectoryEntries,
  loadExploreDirectoryNames,
  loadExploreEntryStats,
  loadExploreFileText,
} from '../../src/explore/loadExploreRead.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
} from '../support/fixtureRoot.js';

describe('loadExploreRead', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  describe('loadExploreFileText', () => {
    test('returns the text of the file', async () => {
      const filePath = join(fixtureRoot.homeDir, 'config.ini');
      await writeFile(filePath, 'path=/avd\n');

      const read = await loadExploreFileText({ path: filePath });

      expect(read).toEqual({ kind: 'succeeded', value: { kind: 'text', text: 'path=/avd\n' } });
    });

    test('reads a missing file as absent', async () => {
      const read = await loadExploreFileText({ path: join(fixtureRoot.homeDir, 'missing') });

      expect(read).toEqual({ kind: 'succeeded', value: { kind: 'absent' } });
    });

    test('reads a folder where a file is expected as unfit', async () => {
      const folderPath = join(fixtureRoot.homeDir, 'folder');
      await createFixtureDirectory({ path: folderPath });

      const read = await loadExploreFileText({ path: folderPath });

      expect(read).toEqual({ kind: 'succeeded', value: { kind: 'unfit' } });
    });

    test('reads a file over the bound as unfit', async () => {
      const filePath = join(fixtureRoot.homeDir, 'large.json');
      await writeFile(filePath, '');
      await truncate(filePath, EXPLORE_FILE_MAX_BYTES + 1);

      const read = await loadExploreFileText({ path: filePath });

      expect(read).toEqual({ kind: 'succeeded', value: { kind: 'unfit' } });
    });

    test('fails as fileUnreadable at its path when the file cannot be read', async () => {
      const filePath = join(fixtureRoot.homeDir, 'config.ini');
      await writeFile(filePath, 'path=/avd\n');
      await chmod(filePath, 0o000);

      try {
        const read = await loadExploreFileText({ path: filePath });

        expect(read).toEqual({
          kind: 'failed',
          failure: {
            reason: 'fileUnreadable',
            path: filePath,
            failure: { reason: 'permissionDenied', code: 'EACCES' },
          },
        });
      } finally {
        await chmod(filePath, 0o600);
      }
    });
  });

  describe('loadExploreDirectoryNames', () => {
    test('returns the sorted names of the folder', async () => {
      await createFixtureDirectory({ path: join(fixtureRoot.homeDir, 'b') });
      await createFixtureDirectory({ path: join(fixtureRoot.homeDir, 'a') });

      const names = await loadExploreDirectoryNames({ path: fixtureRoot.homeDir });

      expect(names).toEqual({ kind: 'succeeded', value: ['a', 'b'] });
    });

    test('returns null for a missing folder and for a file', async () => {
      const filePath = join(fixtureRoot.homeDir, 'file');
      await writeFile(filePath, '');

      const missing = await loadExploreDirectoryNames({ path: join(fixtureRoot.homeDir, 'gone') });
      const file = await loadExploreDirectoryNames({ path: filePath });

      expect(missing).toEqual({ kind: 'succeeded', value: null });
      expect(file).toEqual({ kind: 'succeeded', value: null });
    });

    test('fails as fileUnreadable at its path when the folder cannot be listed', async () => {
      const folderPath = join(fixtureRoot.homeDir, 'locked');
      await createFixtureDirectory({ path: folderPath });
      await chmod(folderPath, 0o000);

      try {
        const names = await loadExploreDirectoryNames({ path: folderPath });

        expect(names).toEqual({
          kind: 'failed',
          failure: {
            reason: 'fileUnreadable',
            path: folderPath,
            failure: { reason: 'permissionDenied', code: 'EACCES' },
          },
        });
      } finally {
        await chmod(folderPath, 0o700);
      }
    });
  });

  describe('loadExploreDirectoryEntries', () => {
    test('returns the entries with their kinds, and null for a missing folder', async () => {
      await createFixtureDirectory({ path: join(fixtureRoot.homeDir, 'folder') });
      await writeFile(join(fixtureRoot.homeDir, 'file'), '');

      const entries = await loadExploreDirectoryEntries({ path: fixtureRoot.homeDir });
      const missing = await loadExploreDirectoryEntries({
        path: join(fixtureRoot.homeDir, 'gone'),
      });

      expect(entries).toEqual({
        kind: 'succeeded',
        value: [
          { name: 'file', kind: 'file' },
          { name: 'folder', kind: 'directory' },
        ],
      });
      expect(missing).toEqual({ kind: 'succeeded', value: null });
    });
  });

  describe('loadExploreEntryStats', () => {
    test('returns the stats of the entry, and null for a missing one', async () => {
      const filePath = join(fixtureRoot.homeDir, 'config.ini');
      await createFixtureFile({ path: filePath, sizeBytes: 1, modifiedMs: 1_000_000 });

      const stats = await loadExploreEntryStats({ path: filePath });
      const missing = await loadExploreEntryStats({ path: join(fixtureRoot.homeDir, 'gone') });

      expect(stats.kind === 'succeeded' ? stats.value?.modifiedMs : undefined).toBe(1_000_000);
      expect(missing).toEqual({ kind: 'succeeded', value: null });
    });
  });
});
