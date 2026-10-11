import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, link, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Measurement } from '../../src/scan/loadPathMeasurement.js';
import { loadPathMeasurement } from '../../src/scan/loadPathMeasurement.js';
import { loadEntryStats } from '../../src/system/loadEntryStats.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
} from '../support/fixtureRoot.js';

async function loadMeasurementOrThrow(params: {
  path: string;
  deadlineMs: number;
}): Promise<Measurement> {
  const result = await loadPathMeasurement(params);

  if (result.kind === 'failed') {
    throw new Error(`Measurement failed: ${result.failure.reason}`);
  }

  return result.value;
}

async function loadAllocatedBytes(params: { path: string }): Promise<number> {
  const statsResult = await loadEntryStats(params);

  if (statsResult.kind === 'failed') {
    throw new Error(`Stats failed: ${statsResult.failure.reason}`);
  }

  return statsResult.value.allocatedBytes;
}

describe('loadPathMeasurement', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot });
  });

  test('measures a single file', async () => {
    const filePath = join(fixtureRoot.homeDir, 'large.bin');

    await createFixtureFile({ path: filePath, sizeBytes: 100_000, modifiedMs: Date.now() });

    const measurement = await loadMeasurementOrThrow({
      path: filePath,
      deadlineMs: Date.now() + 60_000,
    });

    expect(measurement.identity.kind).toBe('file');
    expect(measurement.allocatedBytes).toBeGreaterThanOrEqual(100_000);
    expect(measurement.allocatedBytes % 512).toBe(0);
    expect(measurement.entryCount).toBe(1);
    expect(measurement.unreadableCount).toBe(0);
    expect(measurement.isComplete).toBe(true);
  });

  test('sums the allocated bytes of every entry in a tree', async () => {
    const treeDirPath = join(fixtureRoot.homeDir, 'tree');
    const smallFilePath = join(treeDirPath, 'small.txt');
    const nestedDirPath = join(treeDirPath, 'nested');
    const largeFilePath = join(nestedDirPath, 'large.bin');

    await createFixtureDirectory({ path: nestedDirPath });
    await createFixtureFile({ path: smallFilePath, sizeBytes: 10, modifiedMs: Date.now() });
    await createFixtureFile({ path: largeFilePath, sizeBytes: 100_000, modifiedMs: Date.now() });

    const entryPaths = [
      fixtureRoot.homeDir,
      treeDirPath,
      smallFilePath,
      nestedDirPath,
      largeFilePath,
    ];
    const entryBytes = await Promise.all(
      entryPaths.map((entryPath) => loadAllocatedBytes({ path: entryPath })),
    );
    const expectedBytes = entryBytes.reduce((sum, bytes) => sum + bytes, 0);

    const measurement = await loadMeasurementOrThrow({
      path: fixtureRoot.homeDir,
      deadlineMs: Date.now() + 60_000,
    });

    expect(measurement.allocatedBytes).toBe(expectedBytes);
    expect(measurement.entryCount).toBe(entryPaths.length);
    expect(measurement.unreadableCount).toBe(0);
    expect(measurement.isComplete).toBe(true);
  });

  test('counts a hard link once', async () => {
    const originalPath = join(fixtureRoot.homeDir, 'original.bin');
    const linkPath = join(fixtureRoot.homeDir, 'link.bin');

    await createFixtureFile({ path: originalPath, sizeBytes: 100_000, modifiedMs: Date.now() });
    await link(originalPath, linkPath);

    const homeBytes = await loadAllocatedBytes({ path: fixtureRoot.homeDir });
    const originalBytes = await loadAllocatedBytes({ path: originalPath });

    const measurement = await loadMeasurementOrThrow({
      path: fixtureRoot.homeDir,
      deadlineMs: Date.now() + 60_000,
    });

    expect(measurement.allocatedBytes).toBe(homeBytes + originalBytes);
    expect(measurement.entryCount).toBe(3);
  });

  test('does not add the size of a symbolic link target outside the folder', async () => {
    const targetPath = join(fixtureRoot.tempDir, 'target.bin');
    const linkPath = join(fixtureRoot.homeDir, 'link.bin');

    await createFixtureFile({ path: targetPath, sizeBytes: 2_000_000, modifiedMs: Date.now() });
    await symlink(targetPath, linkPath);

    const homeBytes = await loadAllocatedBytes({ path: fixtureRoot.homeDir });
    const linkBytes = await loadAllocatedBytes({ path: linkPath });
    const targetBytes = await loadAllocatedBytes({ path: targetPath });

    const measurement = await loadMeasurementOrThrow({
      path: fixtureRoot.homeDir,
      deadlineMs: Date.now() + 60_000,
    });

    expect(measurement.allocatedBytes).toBe(homeBytes + linkBytes);
    expect(measurement.allocatedBytes).toBeLessThan(targetBytes);
  });

  test('reports an unreadable subfolder as incomplete', async () => {
    const lockedDirPath = join(fixtureRoot.homeDir, 'Locked');

    await createFixtureDirectory({ path: lockedDirPath });
    await createFixtureFile({
      path: join(lockedDirPath, 'inside.bin'),
      sizeBytes: 10,
      modifiedMs: Date.now(),
    });
    await chmod(lockedDirPath, 0o000);

    const measurement = await loadMeasurementOrThrow({
      path: fixtureRoot.homeDir,
      deadlineMs: Date.now() + 60_000,
    });

    expect(measurement.unreadableCount).toBe(1);
    expect(measurement.isComplete).toBe(false);
  });

  test('stops at a passed deadline and keeps the root alone', async () => {
    await createFixtureFile({
      path: join(fixtureRoot.homeDir, 'small.bin'),
      sizeBytes: 10,
      modifiedMs: Date.now(),
    });

    const homeBytes = await loadAllocatedBytes({ path: fixtureRoot.homeDir });

    const measurement = await loadMeasurementOrThrow({
      path: fixtureRoot.homeDir,
      deadlineMs: 0,
    });

    expect(measurement.allocatedBytes).toBe(homeBytes);
    expect(measurement.entryCount).toBe(1);
    expect(measurement.isComplete).toBe(false);
  });

  test('fails with the missing reason for a missing root', async () => {
    const result = await loadPathMeasurement({
      path: join(fixtureRoot.homeDir, 'missing'),
      deadlineMs: Date.now() + 60_000,
    });

    expect(result).toEqual({ kind: 'failed', failure: { reason: 'missing', code: 'ENOENT' } });
  });
});
