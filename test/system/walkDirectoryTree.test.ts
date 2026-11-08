import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EntryPlacement, EntryReads, EntryRef } from '../../src/system/entryReads.js';
import type { TreeEntry, TreeUnreadable } from '../../src/system/walkDirectoryTree.js';
import { walkDirectoryTree } from '../../src/system/walkDirectoryTree.js';
import { buildTestEntryReads } from '../support/entryReadsFixtures.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import {
  buildPathBelowRoot,
  createFixtureRoot,
  deleteFixtureRoot,
} from '../support/fixtureRoot.js';
import { testOnPosix } from '../support/posixOnly.js';

let fixtureRoot: FixtureRoot;
let treeRoot: string;

beforeEach(async () => {
  fixtureRoot = await createFixtureRoot();
  treeRoot = join(fixtureRoot.homeDir, 'tree');
  await mkdir(join(treeRoot, 'a/deep/deeper'), { recursive: true });
  await mkdir(join(treeRoot, 'b'), { recursive: true });
  await writeFile(join(treeRoot, 'a/deep/deeper/leaf.txt'), 'leaf');
  await writeFile(join(treeRoot, 'b/marker.json'), '{}');
  await writeFile(join(treeRoot, 'top.txt'), 'top');
});

afterEach(async () => {
  await deleteFixtureRoot({ fixtureRoot: fixtureRoot });
});

async function collectEntries(params: {
  isStatsNeeded: boolean;
  visit?: (entry: TreeEntry) => 'descend' | 'skip' | 'stop';
  isStopped?: () => boolean;
  /** The reads of `buildTestEntryReads` with none of its options when left out. */
  entryReads?: EntryReads;
}) {
  const entries: TreeEntry[] = [];
  const unreadables: TreeUnreadable[] = [];
  const evictedEntries: EntryRef[] = [];
  const walkEnd = await walkDirectoryTree({
    rootPath: treeRoot,
    isStatsNeeded: params.isStatsNeeded,
    maxConcurrentDirectories: 2,
    isStopped: params.isStopped ?? (() => false),
    entryReads: params.entryReads ?? buildTestEntryReads({ privateBytes: null }),
    visitEntry: (entry) => {
      entries.push(entry);

      return params.visit === undefined ? 'descend' : params.visit(entry);
    },
    onUnreadable: (unreadable) => {
      unreadables.push(unreadable);
    },
    onEvictedEntrySkipped: (entry) => {
      evictedEntries.push(entry);
    },
  });
  const relativePaths = entries
    .map((entry) => buildPathBelowRoot({ rootDir: treeRoot, path: entry.path }))
    .toSorted();

  return {
    walkEnd: walkEnd,
    entries: entries,
    relativePaths: relativePaths,
    unreadables: unreadables,
    evictedEntries: evictedEntries,
  };
}

/**
 * The reads of `buildTestEntryReads` with none of its options, which place the folder at `path`
 * on disk at its first read, at its parent's listing, and as `placementBeforeListing` after.
 */
function buildEntryReadsChangedBeforeListing(params: {
  path: string;
  placementBeforeListing: EntryPlacement;
}): EntryReads {
  const entryReads = buildTestEntryReads({ privateBytes: null });
  let readCount = 0;

  function loadEntryPlacement(entry: EntryRef): EntryPlacement {
    if (entry.path !== params.path) {
      return entryReads.loadEntryPlacement(entry);
    }

    readCount += 1;

    return readCount === 1 ? { kind: 'onDisk' } : params.placementBeforeListing;
  }

  return { ...entryReads, loadEntryPlacement: loadEntryPlacement };
}

describe('walkDirectoryTree', () => {
  test('visits an evicted folder but never reads it, and reports it as skipped', async () => {
    const evictedPath = join(treeRoot, 'b');

    const walk = await collectEntries({
      isStatsNeeded: false,
      entryReads: buildTestEntryReads({ privateBytes: null, cloudOnlyPaths: [evictedPath] }),
    });

    expect(walk.walkEnd).toBe('completed');
    expect(walk.relativePaths).toContain('b');
    expect(walk.relativePaths).not.toContain('b/marker.json');
    expect(walk.evictedEntries).toEqual([{ path: evictedPath, kind: 'directory' }]);
    expect(walk.unreadables).toEqual([]);
  });

  test('does not report an evicted folder the visitor skips', async () => {
    const evictedPath = join(treeRoot, 'b');

    const walk = await collectEntries({
      isStatsNeeded: false,
      entryReads: buildTestEntryReads({ privateBytes: null, cloudOnlyPaths: [evictedPath] }),
      visit: (entry) => (entry.name === 'b' ? 'skip' : 'descend'),
    });

    expect(walk.relativePaths).toContain('b');
    expect(walk.evictedEntries).toEqual([]);
  });

  test('never visits an evicted file, and reports it as skipped', async () => {
    const evictedPath = join(treeRoot, 'top.txt');

    const walk = await collectEntries({
      isStatsNeeded: true,
      entryReads: buildTestEntryReads({ privateBytes: null, cloudOnlyPaths: [evictedPath] }),
    });

    expect(walk.walkEnd).toBe('completed');
    expect(walk.relativePaths).not.toContain('top.txt');
    expect(walk.relativePaths).toContain('b/marker.json');
    expect(walk.evictedEntries).toEqual([{ path: evictedPath, kind: 'file' }]);
    expect(walk.unreadables).toEqual([]);
  });

  test('reads no evicted root, and reports it as skipped', async () => {
    const walk = await collectEntries({
      isStatsNeeded: false,
      entryReads: buildTestEntryReads({ privateBytes: null, cloudOnlyPaths: [treeRoot] }),
    });

    expect(walk.walkEnd).toBe('completed');
    expect(walk.entries).toEqual([]);
    expect(walk.evictedEntries).toEqual([{ path: treeRoot, kind: 'directory' }]);
  });

  test('visits a folder the entry reads call a link as a link, and never enters it', async () => {
    // As a mounted folder on Windows, which lstat calls a folder and its reparse point a link.
    const linkPath = join(treeRoot, 'a');

    const walk = await collectEntries({
      isStatsNeeded: true,
      entryReads: buildTestEntryReads({ privateBytes: null, linkPaths: [linkPath] }),
    });
    const linkEntry = walk.entries.find((entry) => entry.path === linkPath);

    expect(walk.walkEnd).toBe('completed');
    expect(walk.relativePaths).toEqual(['a', 'b', 'b/marker.json', 'top.txt']);
    expect(linkEntry?.kind).toBe('symbolicLink');
    expect(linkEntry?.stats?.kind).toBe('symbolicLink');
    expect(walk.evictedEntries).toEqual([]);
  });

  test('never enters a root the entry reads call a link', async () => {
    const walk = await collectEntries({
      isStatsNeeded: false,
      entryReads: buildTestEntryReads({ privateBytes: null, linkPaths: [treeRoot] }),
    });

    expect(walk.walkEnd).toBe('completed');
    expect(walk.entries).toEqual([]);
    expect(walk.evictedEntries).toEqual([]);
  });

  test('reads a folder it cannot place as one on disk, and gives its visit the code of the read', async () => {
    const unplacedPath = join(treeRoot, 'b');

    const walk = await collectEntries({
      isStatsNeeded: true,
      entryReads: buildTestEntryReads({
        privateBytes: null,
        unreadCodes: new Map([[unplacedPath, 'EIO']]),
      }),
    });
    const placementFailureCodes = walk.entries.map((entry) => [
      buildPathBelowRoot({ rootDir: treeRoot, path: entry.path }),
      entry.placementFailureCode,
    ]);

    expect(walk.walkEnd).toBe('completed');
    expect(walk.relativePaths).toContain('b/marker.json');
    expect(placementFailureCodes.filter(([, code]) => code !== null)).toEqual([['b', 'EIO']]);
    expect(walk.evictedEntries).toEqual([]);
    expect(walk.unreadables).toEqual([]);
  });

  test('enters a root it cannot place, as one on disk', async () => {
    const walk = await collectEntries({
      isStatsNeeded: false,
      entryReads: buildTestEntryReads({
        privateBytes: null,
        unreadCodes: new Map([[treeRoot, 'EIO']]),
      }),
    });

    expect(walk.walkEnd).toBe('completed');
    expect(walk.relativePaths).toContain('a/deep/deeper/leaf.txt');
  });

  test('places each entry before its visit, and each folder again before its listing, the root once', async () => {
    const placedPaths: string[] = [];
    const entryReads = buildTestEntryReads({ privateBytes: null });

    const walk = await collectEntries({
      isStatsNeeded: true,
      entryReads: {
        ...entryReads,
        loadEntryPlacement: (entry) => {
          placedPaths.push(entry.path);

          return entryReads.loadEntryPlacement(entry);
        },
      },
    });
    const visitedPaths = walk.entries.map((entry) => entry.path);
    const listedFolderPaths = walk.entries
      .filter((entry) => entry.kind === 'directory')
      .map((entry) => entry.path);

    expect(placedPaths.toSorted()).toEqual(
      [treeRoot, ...visitedPaths, ...listedFolderPaths].toSorted(),
    );
  });

  test('never lists a folder evicted after its visit, and reports it as skipped', async () => {
    const folderPath = join(treeRoot, 'b');

    const walk = await collectEntries({
      isStatsNeeded: false,
      entryReads: buildEntryReadsChangedBeforeListing({
        path: folderPath,
        placementBeforeListing: { kind: 'cloudOnly' },
      }),
    });

    expect(walk.walkEnd).toBe('completed');
    expect(walk.relativePaths).toContain('b');
    expect(walk.relativePaths).not.toContain('b/marker.json');
    expect(walk.evictedEntries).toEqual([{ path: folderPath, kind: 'directory' }]);
  });

  test('never lists a folder swapped for a link after its visit', async () => {
    // As a folder replaced by a junction on Windows, whose listing would walk the junction's target.
    const folderPath = join(treeRoot, 'b');

    const walk = await collectEntries({
      isStatsNeeded: true,
      entryReads: buildEntryReadsChangedBeforeListing({
        path: folderPath,
        placementBeforeListing: { kind: 'link' },
      }),
    });

    expect(walk.walkEnd).toBe('completed');
    expect(walk.relativePaths).toContain('b');
    expect(walk.relativePaths).not.toContain('b/marker.json');
    expect(walk.evictedEntries).toEqual([]);
    expect(walk.unreadables).toEqual([]);
  });

  test('walks on without a recorder of the evicted entries', async () => {
    const evictedPath = join(treeRoot, 'b');
    const visitedPaths: string[] = [];

    const walkEnd = await walkDirectoryTree({
      rootPath: treeRoot,
      isStatsNeeded: false,
      maxConcurrentDirectories: 2,
      isStopped: () => false,
      entryReads: buildTestEntryReads({ privateBytes: null, cloudOnlyPaths: [evictedPath] }),
      visitEntry: (entry) => {
        visitedPaths.push(entry.path);

        return 'descend';
      },
      onUnreadable: () => undefined,
      onEvictedEntrySkipped: null,
    });

    expect(walkEnd).toBe('completed');
    expect(visitedPaths).toContain(evictedPath);
    expect(visitedPaths).not.toContain(join(evictedPath, 'marker.json'));
  });

  testOnPosix(
    'visits every entry once, with its depth, never entering a symbolic link',
    async () => {
      await symlink(join(treeRoot, 'a'), join(treeRoot, 'link-to-a'));

      const walk = await collectEntries({ isStatsNeeded: false });

      expect(walk.walkEnd).toBe('completed');
      expect(walk.relativePaths).toEqual([
        'a',
        'a/deep',
        'a/deep/deeper',
        'a/deep/deeper/leaf.txt',
        'b',
        'b/marker.json',
        'link-to-a',
        'top.txt',
      ]);
      expect(walk.entries.find((entry) => entry.name === 'link-to-a')?.kind).toBe('symbolicLink');
      expect(walk.entries.find((entry) => entry.name === 'leaf.txt')?.depth).toBe(4);
    },
  );

  test('reads stats only when asked', async () => {
    const withoutStats = await collectEntries({ isStatsNeeded: false });
    const withStats = await collectEntries({ isStatsNeeded: true });

    expect(withoutStats.entries.every((entry) => entry.stats === null)).toBe(true);
    expect(withStats.entries.every((entry) => entry.stats !== null)).toBe(true);
  });

  test('gives each entry the names of its folder', async () => {
    const walk = await collectEntries({ isStatsNeeded: false });
    const folderB = walk.entries.find((entry) => entry.name === 'b');

    expect(folderB?.siblingNames).toEqual(new Set(['a', 'b', 'top.txt']));
  });

  test('does not enter a folder the visitor skips', async () => {
    const walk = await collectEntries({
      isStatsNeeded: false,
      visit: (entry) => (entry.name === 'a' ? 'skip' : 'descend'),
    });

    expect(walk.relativePaths.some((path) => path.startsWith('a/'))).toBe(false);
  });

  test('ends the walk when the visitor stops it', async () => {
    const walk = await collectEntries({
      isStatsNeeded: false,
      visit: (entry) => (entry.name === 'top.txt' ? 'stop' : 'descend'),
    });

    expect(walk.walkEnd).toBe('stopped');
    expect(walk.relativePaths).not.toContain('a/deep/deeper/leaf.txt');
  });

  test('ends the walk when isStopped turns true', async () => {
    const walk = await collectEntries({ isStatsNeeded: false, isStopped: () => true });

    expect(walk.walkEnd).toBe('stopped');
    expect(walk.entries).toEqual([]);
  });

  testOnPosix('reports an unreadable folder and goes on with the rest', async () => {
    await chmod(join(treeRoot, 'a/deep'), 0o000);

    const walk = await collectEntries({ isStatsNeeded: true });

    expect(walk.walkEnd).toBe('completed');
    expect(
      walk.unreadables.map((unreadable) =>
        buildPathBelowRoot({ rootDir: treeRoot, path: unreadable.path }),
      ),
    ).toEqual(['a/deep']);
    expect(walk.relativePaths).toContain('b/marker.json');
  });

  test('rejects when the visitor throws, since that is a bug', async () => {
    await expect(
      collectEntries({
        isStatsNeeded: false,
        visit: () => {
          throw new Error('visitor bug');
        },
      }),
    ).rejects.toThrow('visitor bug');
  });
});
