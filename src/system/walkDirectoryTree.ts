import { join } from 'node:path';
import { hasDatalessFlag } from './hasDatalessFlag.js';
import type { DirectoryEntry } from './loadDirectoryEntries.js';
import { loadDirectoryEntries } from './loadDirectoryEntries.js';
import type { DirectoryFailure } from './loadDirectoryNames.js';
import type { EntryStats } from './loadEntryStats.js';
import { loadEntryStats } from './loadEntryStats.js';
import type { FileFailure, FileKind } from './loadFileIdentity.js';

export type TreeEntry = {
  path: string;
  name: string;
  /** The entries of the root have depth 1. */
  depth: number;
  kind: FileKind;
  /** Read only when the walk asked for stats. */
  stats: EntryStats | null;
  /** The names in the same folder, such as a marker file beside a project folder. */
  siblingNames: Set<string>;
};

/** `descend` enters a folder (a symbolic link never); `stop` ends the whole walk. */
export type TreeEntryVisit = 'descend' | 'skip' | 'stop';

export type TreeWalkEnd = 'completed' | 'stopped';

export type TreeUnreadable = { path: string; failure: DirectoryFailure | FileFailure };

type PendingDirectory = { path: string; depth: number };

/**
 * Walks the folders below `rootPath`, reading at most `maxConcurrentDirectories` folders at
 * once, and asks `visitEntry` about every entry. Waiting folders are kept as paths, so a wide
 * tree costs memory for its paths only. Returns `stopped` once `visitEntry` returned `stop` or
 * `isStopped` turned true. A vanished entry is left out; an unreadable one goes to `onUnreadable`.
 * An evicted iCloud folder is visited but never read, so the walk downloads nothing.
 */
export function walkDirectoryTree(params: {
  rootPath: string;
  isStatsNeeded: boolean;
  maxConcurrentDirectories: number;
  isStopped: () => boolean;
  visitEntry: (entry: TreeEntry) => TreeEntryVisit;
  onUnreadable: (unreadable: TreeUnreadable) => void;
}): Promise<TreeWalkEnd> {
  const pendingDirectories: PendingDirectory[] = [{ path: params.rootPath, depth: 0 }];
  let activeCount = 0;
  let isStoppedByVisit = false;

  async function readDirectory(directory: PendingDirectory): Promise<void> {
    if (isStoppedByVisit || params.isStopped()) {
      isStoppedByVisit = true;

      return;
    }

    // An evicted iCloud folder holds nothing on this disk, and reading it would download it.
    if (hasDatalessFlag({ path: directory.path })) {
      return;
    }

    const listing = await loadDirectoryEntries({ path: directory.path });

    if (listing.kind === 'failed') {
      if (
        listing.failure.reason === 'permissionDenied' ||
        listing.failure.reason === 'unexpected'
      ) {
        params.onUnreadable({ path: directory.path, failure: listing.failure });
      }

      return;
    }

    const siblingNames = new Set(listing.value.map((entry) => entry.name));
    const treeEntries = await loadTreeEntries({
      directory: directory,
      entries: listing.value,
      siblingNames: siblingNames,
      isStatsNeeded: params.isStatsNeeded,
      onUnreadable: params.onUnreadable,
    });

    for (const treeEntry of treeEntries) {
      if (isStoppedByVisit) {
        return;
      }

      const visit = params.visitEntry(treeEntry);

      if (visit === 'stop') {
        isStoppedByVisit = true;

        return;
      }

      if (visit === 'descend' && treeEntry.kind === 'directory') {
        pendingDirectories.push({ path: treeEntry.path, depth: treeEntry.depth });
      }
    }
  }

  return new Promise((resolve, reject) => {
    function startReaders(): void {
      while (
        !isStoppedByVisit &&
        activeCount < params.maxConcurrentDirectories &&
        pendingDirectories.length > 0
      ) {
        const directory = pendingDirectories.pop();

        if (directory === undefined) {
          break;
        }

        activeCount += 1;
        readDirectory(directory).then(finishReader, reject);
      }

      if (activeCount === 0) {
        resolve(isStoppedByVisit ? 'stopped' : 'completed');
      }
    }

    function finishReader(): void {
      activeCount -= 1;
      startReaders();
    }

    startReaders();
  });
}

async function loadTreeEntries(params: {
  directory: PendingDirectory;
  entries: DirectoryEntry[];
  siblingNames: Set<string>;
  isStatsNeeded: boolean;
  onUnreadable: (unreadable: TreeUnreadable) => void;
}): Promise<TreeEntry[]> {
  const depth = params.directory.depth + 1;
  const treeEntries = await Promise.all(
    params.entries.map(async (entry): Promise<TreeEntry | null> => {
      const path = join(params.directory.path, entry.name);

      if (!params.isStatsNeeded) {
        return {
          path: path,
          name: entry.name,
          depth: depth,
          kind: entry.kind,
          stats: null,
          siblingNames: params.siblingNames,
        };
      }

      const stats = await loadEntryStats({ path: path });

      if (stats.kind === 'failed') {
        if (stats.failure.reason !== 'missing') {
          params.onUnreadable({ path: path, failure: stats.failure });
        }

        return null;
      }

      return {
        path: path,
        name: entry.name,
        depth: depth,
        kind: stats.value.kind,
        stats: stats.value,
        siblingNames: params.siblingNames,
      };
    }),
  );

  return treeEntries.filter((treeEntry) => treeEntry !== null);
}
