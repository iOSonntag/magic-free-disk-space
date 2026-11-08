import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, link, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { PathMeasurement } from '../../src/scan/loadPathMeasurement.js';
import { getMeasuredFreedBytes, loadPathMeasurement } from '../../src/scan/loadPathMeasurement.js';
import type { EntryReads } from '../../src/system/entryReads.js';
import { buildTestEntryReads, loadEntryAllocatedBytes } from '../support/entryReadsFixtures.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
  updateModifiedMs,
} from '../support/fixtureRoot.js';
import { hostPlatform } from '../support/platformFixtures.js';
import { testOnPosix } from '../support/posixOnly.js';

const FAR_DEADLINE_MS = Number.MAX_SAFE_INTEGER;

async function loadMeasurement(params: {
  paths: string[];
  deadlineMs?: number;
  entryReads?: EntryReads;
}): Promise<PathMeasurement> {
  return loadPathMeasurement({
    paths: params.paths,
    deadlineMs: params.deadlineMs ?? FAR_DEADLINE_MS,
    entryReads: params.entryReads ?? hostPlatform.system.entryReads,
    recordEvictedEntry: null,
  });
}

async function sumAllocatedBytes(paths: string[]): Promise<number> {
  const entryBytes = await Promise.all(
    paths.map((path) => loadEntryAllocatedBytes({ path: path })),
  );

  return entryBytes.reduce((sum, bytes) => sum + bytes, 0);
}

describe('loadPathMeasurement', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
  });

  test('measures a single file', async () => {
    const filePath = join(fixtureRoot.homeDir, 'large.bin');

    await createFixtureFile({ path: filePath, sizeBytes: 100_000, modifiedMs: 1_700_000_000_000 });

    const measurement = await loadMeasurement({ paths: [filePath] });

    expect(measurement.allocatedBytes).toBeGreaterThanOrEqual(100_000);
    expect(measurement.allocatedBytes % 512).toBe(0);
    expect(measurement.entryCount).toBe(1);
    expect(measurement.unreadableCount).toBe(0);
    expect(measurement.privateSizeFallbackCount).toBe(0);
    expect(measurement.isComplete).toBe(true);
    expect(measurement.latestModifiedMs).toBe(1_700_000_000_000);
    expect(measurement.holdsOtherVolume).toBe(false);
  });

  test('sums every entry of a tree that no clone shares', async () => {
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

    const measurement = await loadMeasurement({ paths: [fixtureRoot.homeDir] });

    expect(measurement.allocatedBytes).toBe(await sumAllocatedBytes(entryPaths));
    expect(measurement.entryCount).toBe(entryPaths.length);
    expect(measurement.unreadableCount).toBe(0);
    expect(measurement.isComplete).toBe(true);
  });

  test('counts each file by the private size the platform reads, and a folder by its blocks', async () => {
    const treeDirPath = join(fixtureRoot.homeDir, 'tree');

    await createFixtureDirectory({ path: treeDirPath });
    await createFixtureFile({
      path: join(treeDirPath, 'a.bin'),
      sizeBytes: 100_000,
      modifiedMs: Date.now(),
    });
    await createFixtureFile({
      path: join(treeDirPath, 'b.bin'),
      sizeBytes: 100_000,
      modifiedMs: Date.now(),
    });

    const measurement = await loadMeasurement({
      paths: [treeDirPath],
      entryReads: buildTestEntryReads({ privateBytes: 1000 }),
    });

    expect(measurement.allocatedBytes).toBe(
      (await loadEntryAllocatedBytes({ path: treeDirPath })) + 2 * 1000,
    );
    expect(measurement.privateSizeFallbackCount).toBe(0);
  });

  test('counts the allocated blocks of each file whose private size cannot be read', async () => {
    const treeDirPath = join(fixtureRoot.homeDir, 'tree');
    const firstFilePath = join(treeDirPath, 'a.bin');
    const secondFilePath = join(treeDirPath, 'b.bin');

    await createFixtureDirectory({ path: treeDirPath });
    await createFixtureFile({ path: firstFilePath, sizeBytes: 100_000, modifiedMs: Date.now() });
    await createFixtureFile({ path: secondFilePath, sizeBytes: 10, modifiedMs: Date.now() });

    const measurement = await loadMeasurement({
      paths: [treeDirPath],
      entryReads: buildTestEntryReads({ privateBytes: null }),
    });

    expect(measurement.allocatedBytes).toBe(
      await sumAllocatedBytes([treeDirPath, firstFilePath, secondFilePath]),
    );
    expect(measurement.privateSizeFallbackCount).toBe(2);
  });

  test('reports the newest modification time in the tree and no other volume', async () => {
    const treeDirPath = join(fixtureRoot.homeDir, 'tree');
    const nestedDirPath = join(treeDirPath, 'nested');
    const newestFilePath = join(nestedDirPath, 'newest.bin');

    await createFixtureDirectory({ path: nestedDirPath });
    await createFixtureFile({
      path: join(treeDirPath, 'old.bin'),
      sizeBytes: 10,
      modifiedMs: 1_600_000_000_000,
    });
    await createFixtureFile({ path: newestFilePath, sizeBytes: 10, modifiedMs: 1_700_000_000_000 });
    await updateModifiedMs({ path: nestedDirPath, modifiedMs: 1_600_000_000_000 });
    await updateModifiedMs({ path: treeDirPath, modifiedMs: 1_600_000_000_000 });

    const measurement = await loadMeasurement({ paths: [treeDirPath] });

    expect(measurement.latestModifiedMs).toBe(1_700_000_000_000);
    expect(measurement.holdsOtherVolume).toBe(false);
  });

  test('counts a hard-linked file once when the path holds both of its links', async () => {
    const originalPath = join(fixtureRoot.homeDir, 'original.bin');
    const linkPath = join(fixtureRoot.homeDir, 'link.bin');

    await createFixtureFile({ path: originalPath, sizeBytes: 100_000, modifiedMs: Date.now() });
    await link(originalPath, linkPath);

    const measurement = await loadMeasurement({ paths: [fixtureRoot.homeDir] });

    expect(measurement.allocatedBytes).toBe(
      await sumAllocatedBytes([fixtureRoot.homeDir, originalPath]),
    );
    expect(measurement.entryCount).toBe(3);
  });

  test('counts nothing of a hard-linked file whose other link lies outside the path', async () => {
    const insideDirPath = join(fixtureRoot.homeDir, 'inside');
    const originalPath = join(insideDirPath, 'original.bin');

    await createFixtureDirectory({ path: insideDirPath });
    await createFixtureFile({ path: originalPath, sizeBytes: 100_000, modifiedMs: Date.now() });
    await link(originalPath, join(fixtureRoot.tempDir, 'outside.bin'));

    const measurement = await loadMeasurement({ paths: [insideDirPath] });

    expect(measurement.allocatedBytes).toBe(await loadEntryAllocatedBytes({ path: insideDirPath }));
    expect(measurement.entryCount).toBe(2);
    expect(measurement.isComplete).toBe(true);
  });

  test('counts once a hard-linked file whose links lie in two paths of one offer', async () => {
    const firstDirPath = join(fixtureRoot.homeDir, 'first');
    const secondDirPath = join(fixtureRoot.homeDir, 'second');
    const originalPath = join(firstDirPath, 'original.bin');

    await createFixtureDirectory({ path: firstDirPath });
    await createFixtureDirectory({ path: secondDirPath });
    await createFixtureFile({ path: originalPath, sizeBytes: 100_000, modifiedMs: Date.now() });
    await link(originalPath, join(secondDirPath, 'link.bin'));

    const firstAlone = await loadMeasurement({ paths: [firstDirPath] });
    const offer = await loadMeasurement({ paths: [firstDirPath, secondDirPath] });

    expect(firstAlone.allocatedBytes).toBe(await loadEntryAllocatedBytes({ path: firstDirPath }));
    expect(offer.allocatedBytes).toBe(
      await sumAllocatedBytes([firstDirPath, secondDirPath, originalPath]),
    );
    expect(offer.entryCount).toBe(4);
  });

  testOnPosix('does not add the size of a symbolic link target outside the folder', async () => {
    const targetPath = join(fixtureRoot.tempDir, 'target.bin');
    const linkPath = join(fixtureRoot.homeDir, 'link.bin');

    await createFixtureFile({ path: targetPath, sizeBytes: 2_000_000, modifiedMs: Date.now() });
    await symlink(targetPath, linkPath);

    const measurement = await loadMeasurement({ paths: [fixtureRoot.homeDir] });

    expect(measurement.allocatedBytes).toBe(
      await sumAllocatedBytes([fixtureRoot.homeDir, linkPath]),
    );
    expect(measurement.allocatedBytes).toBeLessThan(
      await loadEntryAllocatedBytes({ path: targetPath }),
    );
  });

  testOnPosix('reports an unreadable subfolder as incomplete', async () => {
    const lockedDirPath = join(fixtureRoot.homeDir, 'Locked');

    await createFixtureDirectory({ path: lockedDirPath });
    await createFixtureFile({
      path: join(lockedDirPath, 'inside.bin'),
      sizeBytes: 10,
      modifiedMs: Date.now(),
    });
    await chmod(lockedDirPath, 0o000);

    const measurement = await loadMeasurement({ paths: [fixtureRoot.homeDir] });

    expect(measurement.unreadableCount).toBe(1);
    expect(measurement.isComplete).toBe(false);
  });

  testOnPosix('reports a root that cannot be read as incomplete', async () => {
    const lockedDirPath = join(fixtureRoot.homeDir, 'Locked');
    const hiddenFilePath = join(lockedDirPath, 'inside.bin');

    await createFixtureDirectory({ path: lockedDirPath });
    await createFixtureFile({ path: hiddenFilePath, sizeBytes: 10, modifiedMs: Date.now() });
    await chmod(lockedDirPath, 0o000);

    const measurement = await loadMeasurement({ paths: [hiddenFilePath] });

    expect(measurement).toEqual({
      allocatedBytes: 0,
      entryCount: 0,
      unreadableCount: 1,
      privateSizeFallbackCount: 0,
      isComplete: false,
      latestModifiedMs: null,
      holdsOtherVolume: false,
    });
  });

  test('stops at a passed deadline and keeps the root alone', async () => {
    await createFixtureFile({
      path: join(fixtureRoot.homeDir, 'small.bin'),
      sizeBytes: 10,
      modifiedMs: Date.now(),
    });

    const measurement = await loadMeasurement({ paths: [fixtureRoot.homeDir], deadlineMs: 0 });

    expect(measurement.allocatedBytes).toBe(
      await loadEntryAllocatedBytes({ path: fixtureRoot.homeDir }),
    );
    expect(measurement.entryCount).toBe(1);
    expect(measurement.isComplete).toBe(false);
  });

  test('counts a missing path as 0 and reads no modification time', async () => {
    const measurement = await loadMeasurement({ paths: [join(fixtureRoot.homeDir, 'missing')] });

    expect(measurement).toEqual({
      allocatedBytes: 0,
      entryCount: 0,
      unreadableCount: 0,
      privateSizeFallbackCount: 0,
      isComplete: true,
      latestModifiedMs: null,
      holdsOtherVolume: false,
    });
  });

  test('sums the paths that are there beside one that is gone', async () => {
    const firstFilePath = join(fixtureRoot.homeDir, 'first.bin');
    const secondFilePath = join(fixtureRoot.homeDir, 'second.bin');

    await createFixtureFile({
      path: firstFilePath,
      sizeBytes: 100_000,
      modifiedMs: 1_600_000_000_000,
    });
    await createFixtureFile({ path: secondFilePath, sizeBytes: 10, modifiedMs: 1_700_000_000_000 });

    const measurement = await loadMeasurement({
      paths: [firstFilePath, join(fixtureRoot.homeDir, 'gone'), secondFilePath],
    });

    expect(measurement.allocatedBytes).toBe(
      await sumAllocatedBytes([firstFilePath, secondFilePath]),
    );
    expect(measurement.entryCount).toBe(2);
    expect(measurement.isComplete).toBe(true);
    expect(measurement.latestModifiedMs).toBe(1_700_000_000_000);
  });

  // `/dev` is a volume of its own on a POSIX system alone.
  testOnPosix('holds another volume when any path does, a missing one counting false', async () => {
    const filePath = join(fixtureRoot.homeDir, 'example.sha256');
    const missingPath = join(fixtureRoot.homeDir, 'gone');

    await createFixtureFile({ path: filePath, sizeBytes: 64, modifiedMs: 1_700_000_000_000 });

    const plain = await loadMeasurement({ paths: [filePath, missingPath] });
    const mounted = await loadMeasurement({ paths: [filePath, '/dev', missingPath] });

    expect(plain.holdsOtherVolume).toBe(false);
    expect(mounted.holdsOtherVolume).toBe(true);
  });
});

describe('getMeasuredFreedBytes', () => {
  test('is the drop from the size before to the size after', () => {
    expect(
      getMeasuredFreedBytes({
        beforeBytes: 10_000,
        after: { allocatedBytes: 4000, isComplete: true },
      }),
    ).toBe(6000);
  });

  test('is never below 0, as when the path grew meanwhile', () => {
    expect(
      getMeasuredFreedBytes({
        beforeBytes: 4000,
        after: { allocatedBytes: 10_000, isComplete: true },
      }),
    ).toBe(0);
  });

  test('is 0 when the measurement after is incomplete', () => {
    expect(
      getMeasuredFreedBytes({
        beforeBytes: 10_000,
        after: { allocatedBytes: 0, isComplete: false },
      }),
    ).toBe(0);
  });
});
