import { afterEach, beforeEach, expect, test } from 'bun:test';
import { chmod, lutimes, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { darwinPlatform } from '../../src/platform/darwin/darwinPlatform.js';
import type { ActivityProbe } from '../../src/scan/loadTreeActivity.js';
import { loadTreeActivity } from '../../src/scan/loadTreeActivity.js';
import type { EntryReads } from '../../src/system/entryReads.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import { buildTestEntryReads } from '../support/entryReadsFixtures.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  createFixtureDirectory,
  createFixtureFile,
  createFixtureRoot,
  deleteFixtureRoot,
  updateModifiedMs,
} from '../support/fixtureRoot.js';
import { testOnPosix } from '../support/posixOnly.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long a test walk may take before its deadline. */
const TEST_WALK_DURATION_MS = 60_000;

const probeTimes = {
  cutoffMs: Date.now() - 30 * DAY_MS,
  oldModifiedMs: Date.now() - 365 * DAY_MS,
  recentModifiedMs: Date.now(),
};

async function updateModifiedMsInOrder(params: {
  paths: string[];
  modifiedMs: number;
}): Promise<void> {
  for (const path of params.paths) {
    await updateModifiedMs({ path: path, modifiedMs: params.modifiedMs });
  }
}

async function loadActivity(params: {
  path: string;
  excludedNames?: string[];
  excludedPaths?: ReadonlySet<string>;
  maxEntries?: number;
  deadlineMs?: number;
  entryReads?: EntryReads;
}): Promise<ActivityProbe> {
  return loadTreeActivity({
    path: params.path,
    cutoffMs: probeTimes.cutoffMs,
    excludedNames: params.excludedNames ?? [],
    excludedPaths: params.excludedPaths ?? new Set(),
    maxEntries: params.maxEntries ?? 10_000,
    deadlineMs: params.deadlineMs ?? Date.now() + TEST_WALK_DURATION_MS,
    entryReads: params.entryReads ?? darwinPlatform.system.entryReads,
  });
}

describeAwaitingWin32Platform('loadTreeActivity', () => {
  let fixtureRoot: FixtureRoot;

  beforeEach(async () => {
    fixtureRoot = await createFixtureRoot();
  });

  afterEach(async () => {
    await deleteFixtureRoot({ fixtureRoot });
  });

  test('reports quiet for a tree that changed only before the cutoff', async () => {
    const homeDir = fixtureRoot.homeDir;
    const sourceDirPath = join(homeDir, 'Projects', 'app', 'src');

    await createFixtureDirectory({ path: sourceDirPath });
    await createFixtureFile({
      path: join(sourceDirPath, 'index.ts'),
      sizeBytes: 10,
      modifiedMs: probeTimes.oldModifiedMs,
    });
    await updateModifiedMsInOrder({
      paths: [sourceDirPath, join(homeDir, 'Projects', 'app'), join(homeDir, 'Projects'), homeDir],
      modifiedMs: probeTimes.oldModifiedMs,
    });

    const activity = await loadActivity({ path: homeDir });

    expect(activity).toBe('quiet');
  });

  test('reports recent when a file deep in the tree changed', async () => {
    const homeDir = fixtureRoot.homeDir;
    const deepDirPath = join(homeDir, 'a', 'b', 'c');

    await createFixtureDirectory({ path: deepDirPath });
    await createFixtureFile({
      path: join(deepDirPath, 'new.txt'),
      sizeBytes: 10,
      modifiedMs: probeTimes.recentModifiedMs,
    });
    await updateModifiedMsInOrder({
      paths: [deepDirPath, join(homeDir, 'a', 'b'), join(homeDir, 'a'), homeDir],
      modifiedMs: probeTimes.oldModifiedMs,
    });

    const activity = await loadActivity({ path: homeDir });

    expect(activity).toBe('recent');
  });

  test('skips an excluded name at any depth', async () => {
    const homeDir = fixtureRoot.homeDir;
    const excludedDirPath = join(homeDir, 'x', 'y', 'node_modules');

    await createFixtureDirectory({ path: excludedDirPath });
    await createFixtureFile({
      path: join(excludedDirPath, 'new.js'),
      sizeBytes: 10,
      modifiedMs: probeTimes.recentModifiedMs,
    });
    await updateModifiedMsInOrder({
      paths: [excludedDirPath, join(homeDir, 'x', 'y'), join(homeDir, 'x'), homeDir],
      modifiedMs: probeTimes.oldModifiedMs,
    });

    const excludedActivity = await loadActivity({
      path: homeDir,
      excludedNames: ['node_modules'],
    });
    const includedActivity = await loadActivity({ path: homeDir });

    expect(excludedActivity).toBe('quiet');
    expect(includedActivity).toBe('recent');
  });

  test('skips an excluded path, while a folder of the same name elsewhere counts', async () => {
    const homeDir = fixtureRoot.homeDir;
    const artifactDirPath = join(homeDir, 'app', 'build');
    const sourceBuildDirPath = join(homeDir, 'app', 'src', 'build');

    for (const dirPath of [artifactDirPath, sourceBuildDirPath]) {
      await createFixtureDirectory({ path: dirPath });
    }

    await createFixtureFile({
      path: join(artifactDirPath, 'new.class'),
      sizeBytes: 10,
      modifiedMs: probeTimes.recentModifiedMs,
    });
    await createFixtureFile({
      path: join(sourceBuildDirPath, 'old.ts'),
      sizeBytes: 10,
      modifiedMs: probeTimes.oldModifiedMs,
    });
    await updateModifiedMsInOrder({
      paths: [
        artifactDirPath,
        sourceBuildDirPath,
        join(homeDir, 'app', 'src'),
        join(homeDir, 'app'),
        homeDir,
      ],
      modifiedMs: probeTimes.oldModifiedMs,
    });

    const excludedActivity = await loadActivity({
      path: homeDir,
      excludedPaths: new Set([artifactDirPath]),
    });

    await createFixtureFile({
      path: join(sourceBuildDirPath, 'new.ts'),
      sizeBytes: 10,
      modifiedMs: probeTimes.recentModifiedMs,
    });
    await updateModifiedMsInOrder({
      paths: [sourceBuildDirPath],
      modifiedMs: probeTimes.oldModifiedMs,
    });

    const sameNameActivity = await loadActivity({
      path: homeDir,
      excludedPaths: new Set([artifactDirPath]),
    });

    expect(excludedActivity).toBe('quiet');
    expect(sameNameActivity).toBe('recent');
  });

  test('skips a folder the eviction predicate marks as evicted', async () => {
    const homeDir = fixtureRoot.homeDir;
    const evictedDirPath = join(homeDir, 'a', 'b', 'c');

    await createFixtureDirectory({ path: evictedDirPath });
    await createFixtureFile({
      path: join(evictedDirPath, 'new.txt'),
      sizeBytes: 10,
      modifiedMs: probeTimes.recentModifiedMs,
    });
    await updateModifiedMsInOrder({
      paths: [evictedDirPath, join(homeDir, 'a', 'b'), join(homeDir, 'a'), homeDir],
      modifiedMs: probeTimes.oldModifiedMs,
    });

    const activity = await loadActivity({
      path: homeDir,
      entryReads: buildTestEntryReads({
        privateBytes: null,
        isEntryEvicted: (entry) => entry.path === evictedDirPath,
      }),
    });

    expect(activity).toBe('quiet');
  });

  test('reports recent for a new file in the root folder', async () => {
    const homeDir = fixtureRoot.homeDir;

    await createFixtureFile({
      path: join(homeDir, 'old.txt'),
      sizeBytes: 10,
      modifiedMs: probeTimes.oldModifiedMs,
    });
    await createFixtureFile({
      path: join(homeDir, 'new.txt'),
      sizeBytes: 10,
      modifiedMs: probeTimes.recentModifiedMs,
    });
    await updateModifiedMsInOrder({ paths: [homeDir], modifiedMs: probeTimes.oldModifiedMs });

    const activity = await loadActivity({ path: homeDir });

    expect(activity).toBe('recent');
  });

  test('examines the root folder itself', async () => {
    const homeDir = fixtureRoot.homeDir;

    await createFixtureFile({
      path: join(homeDir, 'old.txt'),
      sizeBytes: 10,
      modifiedMs: probeTimes.oldModifiedMs,
    });
    await updateModifiedMsInOrder({ paths: [homeDir], modifiedMs: probeTimes.recentModifiedMs });

    const activity = await loadActivity({ path: homeDir });

    expect(activity).toBe('recent');
  });

  test('reports unknown when the walk examines more entries than maxEntries', async () => {
    const homeDir = fixtureRoot.homeDir;

    for (const fileName of ['a.txt', 'b.txt', 'c.txt']) {
      await createFixtureFile({
        path: join(homeDir, fileName),
        sizeBytes: 10,
        modifiedMs: probeTimes.oldModifiedMs,
      });
    }
    await updateModifiedMsInOrder({ paths: [homeDir], modifiedMs: probeTimes.oldModifiedMs });

    const activity = await loadActivity({ path: homeDir, maxEntries: 2 });

    expect(activity).toBe('unknown');
  });

  test('reports unknown when the deadline passes before a listing', async () => {
    const homeDir = fixtureRoot.homeDir;
    const subDirPath = join(homeDir, 'sub');

    await createFixtureDirectory({ path: subDirPath });
    await createFixtureFile({
      path: join(subDirPath, 'file.txt'),
      sizeBytes: 10,
      modifiedMs: probeTimes.oldModifiedMs,
    });
    await updateModifiedMsInOrder({
      paths: [subDirPath, homeDir],
      modifiedMs: probeTimes.oldModifiedMs,
    });

    const activity = await loadActivity({ path: homeDir, deadlineMs: 0 });

    expect(activity).toBe('unknown');
  });

  testOnPosix('reports unknown for an unreadable subfolder when nothing is recent', async () => {
    const homeDir = fixtureRoot.homeDir;
    const lockedDirPath = join(homeDir, 'locked');

    await createFixtureDirectory({ path: lockedDirPath });
    await createFixtureFile({
      path: join(lockedDirPath, 'file.txt'),
      sizeBytes: 10,
      modifiedMs: probeTimes.oldModifiedMs,
    });
    await updateModifiedMsInOrder({
      paths: [lockedDirPath, homeDir],
      modifiedMs: probeTimes.oldModifiedMs,
    });
    await chmod(lockedDirPath, 0o000);

    const activity = await loadActivity({ path: homeDir });

    expect(activity).toBe('unknown');
  });

  testOnPosix('does not follow a symbolic link to a recent folder', async () => {
    const homeDir = fixtureRoot.homeDir;
    const elsewhereDirPath = join(fixtureRoot.tempDir, 'elsewhere');
    const linkPath = join(homeDir, 'link');

    await createFixtureDirectory({ path: elsewhereDirPath });
    await createFixtureFile({
      path: join(elsewhereDirPath, 'new.txt'),
      sizeBytes: 10,
      modifiedMs: probeTimes.recentModifiedMs,
    });
    await symlink(elsewhereDirPath, linkPath);
    await lutimes(linkPath, probeTimes.oldModifiedMs / 1000, probeTimes.oldModifiedMs / 1000);
    await updateModifiedMsInOrder({ paths: [homeDir], modifiedMs: probeTimes.oldModifiedMs });

    const activity = await loadActivity({ path: homeDir });

    expect(activity).toBe('quiet');
  });

  test('reports unknown for a missing root', async () => {
    const activity = await loadActivity({ path: join(fixtureRoot.homeDir, 'missing') });

    expect(activity).toBe('unknown');
  });
});
