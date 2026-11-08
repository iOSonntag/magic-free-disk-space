import { join } from 'node:path';
import type { EntryReads, EntryRef } from './entryReads.js';
import { getPlacedFileKind } from './entryReads.js';
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
  /** As the entry reads place it: a link of any kind is `symbolicLink`, whatever lstat says. */
  kind: FileKind;
  /** Read only when the walk asked for stats; their kind is the entry's `kind`. */
  stats: EntryStats | null;
  /** The names in the same folder, such as a marker file beside a project folder. */
  siblingNames: Set<string>;
  /**
   * The code of the read that failed to place the entry, which the walk then reads as on disk;
   * `null` for an entry the reads placed.
   */
  placementFailureCode: string | null;
};

/** `descend` enters a folder (a link never); `stop` ends the whole walk. */
export type TreeEntryVisit = 'descend' | 'skip' | 'stop';

export type TreeWalkEnd = 'completed' | 'stopped';

export type TreeUnreadable = { path: string; failure: DirectoryFailure | FileFailure };

/** Takes each entry a walk left unread because only a cloud store holds its content. */
export type EvictedEntryRecorder = (entry: EntryRef) => void;

/** A folder to read; one kept only in a cloud store is recorded instead of read. */
type PendingDirectory = { path: string; depth: number; isCloudOnly: boolean };

/**
 * Walks the folders below `rootPath`, reading at most `maxConcurrentDirectories` folders at
 * once, and asks `visitEntry` about every entry. Waiting folders are kept as paths, so a wide
 * tree costs memory for its paths only. Returns `stopped` once `visitEntry` returned `stop` or
 * `isStopped` turned true. A vanished entry is left out; an unreadable one goes to `onUnreadable`.
 * `entryReads.loadEntryPlacement` places the root and each entry once, before it is visited:
 * - a link is visited as a `symbolicLink` and never entered, nor is a root that is one;
 * - a cloud-only folder, such as an iCloud placeholder, is visited but never read, and goes to
 *   `onEvictedEntrySkipped` when the visit or the walk's start would enter it; any other
 *   cloud-only entry goes there and is never visited, so the walk downloads nothing;
 * - an entry that cannot be placed is read as one on disk, the root too, and its visit carries
 *   the code of the failed read.
 *
 * A `null` `onEvictedEntrySkipped` records none of them.
 */
export function walkDirectoryTree(params: {
  rootPath: string;
  isStatsNeeded: boolean;
  maxConcurrentDirectories: number;
  isStopped: () => boolean;
  entryReads: EntryReads;
  visitEntry: (entry: TreeEntry) => TreeEntryVisit;
  onUnreadable: (unreadable: TreeUnreadable) => void;
  onEvictedEntrySkipped: EvictedEntryRecorder | null;
}): Promise<TreeWalkEnd> {
  const pendingDirectories: PendingDirectory[] = [];
  let activeCount = 0;
  let isStoppedByVisit = false;

  function recordEvictedEntry(entry: EntryRef): void {
    if (params.onEvictedEntrySkipped !== null) {
      params.onEvictedEntrySkipped(entry);
    }
  }

  function visitPlacedEntry(placed: { entry: TreeEntry; isCloudOnly: boolean }): void {
    const visit = params.visitEntry(placed.entry);

    if (visit === 'stop') {
      isStoppedByVisit = true;

      return;
    }

    if (visit === 'descend' && placed.entry.kind === 'directory') {
      pendingDirectories.push({
        path: placed.entry.path,
        depth: placed.entry.depth,
        isCloudOnly: placed.isCloudOnly,
      });
    }
  }

  async function readDirectory(directory: PendingDirectory): Promise<void> {
    if (isStoppedByVisit || params.isStopped()) {
      isStoppedByVisit = true;

      return;
    }

    // An evicted folder holds nothing on this disk, and reading it would download it.
    if (directory.isCloudOnly) {
      recordEvictedEntry({ path: directory.path, kind: 'directory' });

      return;
    }

    const listing = await loadDirectoryEntries({ path: directory.path });

    if (listing.kind === 'failed') {
      switch (listing.failure.reason) {
        case 'missing':
        case 'notDirectory':
          return;
        case 'permissionDenied':
        case 'inUse':
        case 'unexpected':
          params.onUnreadable({ path: directory.path, failure: listing.failure });

          return;
      }
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

      const placement = params.entryReads.loadEntryPlacement({
        path: treeEntry.path,
        kind: treeEntry.kind,
      });

      switch (placement.kind) {
        case 'onDisk':
          visitPlacedEntry({ entry: treeEntry, isCloudOnly: false });
          break;
        case 'unread':
          visitPlacedEntry({
            entry: { ...treeEntry, placementFailureCode: placement.code },
            isCloudOnly: false,
          });
          break;
        case 'cloudOnly':
          // A folder is visited but never read; any other entry is skipped before its visit,
          // which may read it.
          if (treeEntry.kind === 'directory') {
            visitPlacedEntry({ entry: treeEntry, isCloudOnly: true });
          } else {
            recordEvictedEntry({ path: treeEntry.path, kind: treeEntry.kind });
          }

          break;
        case 'link':
          visitPlacedEntry({ entry: toLinkTreeEntry({ entry: treeEntry }), isCloudOnly: false });
          break;
      }
    }
  }

  // The root is placed as the folder the walk expects; one that is a link is never entered.
  switch (params.entryReads.loadEntryPlacement({ path: params.rootPath, kind: 'directory' }).kind) {
    case 'onDisk':
    case 'unread':
      pendingDirectories.push({ path: params.rootPath, depth: 0, isCloudOnly: false });
      break;
    case 'cloudOnly':
      pendingDirectories.push({ path: params.rootPath, depth: 0, isCloudOnly: true });
      break;
    case 'link':
      break;
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

/** The entry as a link, its stats too, so no visitor reads it as the folder or file lstat says. */
function toLinkTreeEntry(params: { entry: TreeEntry }): TreeEntry {
  const kind = getPlacedFileKind({ kind: params.entry.kind, placement: { kind: 'link' } });

  return {
    ...params.entry,
    kind: kind,
    stats: params.entry.stats === null ? null : { ...params.entry.stats, kind: kind },
  };
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
          placementFailureCode: null,
        };
      }

      const stats = await loadEntryStats({ path: path });

      if (stats.kind === 'failed') {
        switch (stats.failure.reason) {
          case 'missing':
            return null;
          case 'permissionDenied':
          case 'inUse':
          case 'unexpected':
            params.onUnreadable({ path: path, failure: stats.failure });

            return null;
        }
      }

      return {
        path: path,
        name: entry.name,
        depth: depth,
        kind: stats.value.kind,
        stats: stats.value,
        siblingNames: params.siblingNames,
        placementFailureCode: null,
      };
    }),
  );

  return treeEntries.filter((treeEntry) => treeEntry !== null);
}
