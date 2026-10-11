import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { EntryStats } from '../../src/system/loadEntryStats.js';
import { loadEntryStats } from '../../src/system/loadEntryStats.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
  updateModifiedMs,
} from '../support/fixtureRoot.js';

const diskBlockBytes = 512;
const largeFileSizeBytes = 100_000;
const oldModifiedMs = Date.UTC(2020, 0, 1, 0, 0, 0);
const newModifiedMs = Date.UTC(2024, 0, 15, 12, 0, 0);

async function loadEntryStatsOrThrow(params: { path: string }): Promise<EntryStats> {
  const result = await loadEntryStats({ path: params.path });

  if (result.kind === 'failed') {
    throw new Error(`loadEntryStats failed with ${result.failure.reason}`);
  }

  return result.value;
}

describe('loadEntryStats', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  test('reports the allocated bytes of a large file in whole blocks', async () => {
    const filePath = join(fixtureRoot.homeDir, 'large.bin');
    await createFixtureFile({
      path: filePath,
      sizeBytes: largeFileSizeBytes,
      modifiedMs: oldModifiedMs,
    });

    const stats = await loadEntryStatsOrThrow({ path: filePath });

    expect(stats.kind).toBe('file');
    expect(stats.allocatedBytes).toBeGreaterThanOrEqual(largeFileSizeBytes);
    expect(stats.allocatedBytes % diskBlockBytes).toBe(0);
  });

  test('reports the modified time that updateModifiedMs set', async () => {
    const filePath = join(fixtureRoot.homeDir, 'notes.txt');
    await createFixtureFile({ path: filePath, sizeBytes: 10, modifiedMs: oldModifiedMs });
    await updateModifiedMs({ path: filePath, modifiedMs: newModifiedMs });

    const stats = await loadEntryStatsOrThrow({ path: filePath });

    expect(Math.abs(stats.modifiedMs - newModifiedMs)).toBeLessThanOrEqual(1000);
  });

  test('reports a symbolic link itself, not the size of its target', async () => {
    const targetPath = join(fixtureRoot.homeDir, 'large.bin');
    const linkPath = join(fixtureRoot.homeDir, 'link-to-large.bin');
    await createFixtureFile({
      path: targetPath,
      sizeBytes: largeFileSizeBytes,
      modifiedMs: oldModifiedMs,
    });
    await symlink(targetPath, linkPath);

    const stats = await loadEntryStatsOrThrow({ path: linkPath });

    expect(stats.kind).toBe('symbolicLink');
    expect(stats.allocatedBytes).toBeLessThan(largeFileSizeBytes);
  });

  test('fails with missing and ENOENT when the path does not exist', async () => {
    const missingPath = join(fixtureRoot.homeDir, 'missing.bin');

    const result = await loadEntryStats({ path: missingPath });

    expect(result).toEqual({ kind: 'failed', failure: { reason: 'missing', code: 'ENOENT' } });
  });
});
