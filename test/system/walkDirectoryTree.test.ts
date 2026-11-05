import { afterEach, beforeEach, expect, test } from 'bun:test';
import { chmod, mkdir, symlink, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { EntryEvictionCheck, EvictionCandidate } from '../../src/system/entryReads.js';
import type { TreeEntry, TreeUnreadable } from '../../src/system/walkDirectoryTree.js';
import { walkDirectoryTree } from '../../src/system/walkDirectoryTree.js';
import { describeAwaitingWin32Platform } from '../support/awaitsWin32Platform.js';
import type { FixtureRoot } from '../support/fixtureRoot.js';
import { createFixtureRoot, deleteFixtureRoot } from '../support/fixtureRoot.js';
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
  isEntryEvicted?: EntryEvictionCheck;
}) {
  const entries: TreeEntry[] = [];
  const unreadables: TreeUnreadable[] = [];
  const evictedEntries: EvictionCandidate[] = [];
  const walkEnd = await walkDirectoryTree({
    rootPath: treeRoot,
    isStatsNeeded: params.isStatsNeeded,
    maxConcurrentDirectories: 2,
    isStopped: params.isStopped ?? (() => false),
    entryReads: {
      isEntryEvicted: params.isEntryEvicted ?? (() => false),
      loadPrivateBytes: () => null,
    },
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
  const relativePaths = entries.map((entry) => relative(treeRoot, entry.path)).toSorted();

  return {
    walkEnd: walkEnd,
    entries: entries,
    relativePaths: relativePaths,
    unreadables: unreadables,
    evictedEntries: evictedEntries,
  };
}

describeAwaitingWin32Platform('walkDirectoryTree', () => {
  test('visits an evicted folder but never reads it, and reports it as skipped', async () => {
    const evictedPath = join(treeRoot, 'b');

    const walk = await collectEntries({
      isStatsNeeded: false,
      isEntryEvicted: (entry) => entry.path === evictedPath,
    });

    expect(walk.walkEnd).toBe('completed');
    expect(walk.relativePaths).toContain('b');
    expect(walk.relativePaths).not.toContain('b/marker.json');
    expect(walk.evictedEntries).toEqual([{ path: evictedPath, kind: 'directory' }]);
    expect(walk.unreadables).toEqual([]);
  });

  test('never visits an evicted file, and reports it as skipped', async () => {
    const evictedPath = join(treeRoot, 'top.txt');

    const walk = await collectEntries({
      isStatsNeeded: true,
      isEntryEvicted: (entry) => entry.path === evictedPath,
    });

    expect(walk.walkEnd).toBe('completed');
    expect(walk.relativePaths).not.toContain('top.txt');
    expect(walk.relativePaths).toContain('b/marker.json');
    expect(walk.evictedEntries).toEqual([{ path: evictedPath, kind: 'file' }]);
    expect(walk.unreadables).toEqual([]);
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
    expect(walk.unreadables.map((unreadable) => relative(treeRoot, unreadable.path))).toEqual([
      'a/deep',
    ]);
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
