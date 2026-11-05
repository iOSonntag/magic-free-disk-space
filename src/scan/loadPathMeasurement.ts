import { dirname } from 'node:path';
import { createConcurrencyLimit } from '../system/createConcurrencyLimit.js';
import type { EntryReads } from '../system/entryReads.js';
import type { EntryStats } from '../system/loadEntryStats.js';
import { loadEntryStats } from '../system/loadEntryStats.js';
import type { FileIdentity } from '../system/loadFileIdentity.js';
import { walkDirectoryTree } from '../system/walkDirectoryTree.js';
import type { EntryTally, MeasuredEntry } from './tallyMeasuredEntry.js';
import { createEntryTally, getEntryTallyTotals, tallyMeasuredEntry } from './tallyMeasuredEntry.js';

/** One offered path as a decision reads it: its identity and its measurement. */
export type Measurement = {
  identity: FileIdentity;
  /** What deleting the path frees, each block counted once, as `PathMeasurement` counts it. */
  allocatedBytes: number;
  /** Entries whose stats were read, the root included. A hard link counts once per path. */
  entryCount: number;
  unreadableCount: number;
  /** Files whose private size could not be read, so their allocated blocks count instead. */
  privateSizeFallbackCount: number;
  isComplete: boolean;
  /** The newest modification time of the entries read, the root included. */
  latestModifiedMs: number;
  /** True when the folder is a mount point or another volume is mounted inside it. */
  holdsOtherVolume: boolean;
};

/** What deleting every path of one offer frees, as one tally over all their entries. */
export type PathMeasurement = {
  /**
   * Each block once: a file counts its private size, so blocks it shares with a clone count
   * nowhere, and a hard-linked file counts once, only when every one of its links lies in the
   * offer.
   */
  allocatedBytes: number;
  /** Entries whose stats were read, each root included. A hard link counts once per path. */
  entryCount: number;
  unreadableCount: number;
  /** Files whose private size could not be read, so their allocated blocks count instead. */
  privateSizeFallbackCount: number;
  /** False when an entry, a root among them, could not be read or the deadline passed. */
  isComplete: boolean;
  /** The newest modification time of the entries read; `null` when no root could be read. */
  latestModifiedMs: number | null;
  /** True when a path is a mount point or another volume is mounted inside one. */
  holdsOtherVolume: boolean;
};

/** The part of one path in its offer's measurement; its entries go to the shared tally. */
type PathPart = {
  entryCount: number;
  unreadableCount: number;
  isWalkCompleted: boolean;
  latestModifiedMs: number | null;
  holdsOtherVolume: boolean;
};

const MISSING_PATH_PART: PathPart = {
  entryCount: 0,
  unreadableCount: 0,
  isWalkCompleted: true,
  latestModifiedMs: null,
  holdsOtherVolume: false,
};

const UNREADABLE_PATH_PART: PathPart = {
  entryCount: 0,
  unreadableCount: 1,
  isWalkCompleted: true,
  latestModifiedMs: null,
  holdsOtherVolume: false,
};

/** Paths measured at once; a Dart gc set holds thousands of small folders. */
const MAX_CONCURRENT_PATHS = 8;

const MAX_CONCURRENT_DIRECTORIES = 16;

/**
 * Measures the paths of one offer as one tally, so a hard link split across two of them counts
 * once. The paths must not overlap. Follows no symbolic link and enters no other volume mounted
 * inside a path, which it notes instead, as it notes a path that is a mount point. A path that is
 * gone counts 0; one that cannot be read, or a passed deadline, leaves `isComplete` false.
 */
export async function loadPathMeasurement(params: {
  paths: string[];
  deadlineMs: number;
  entryReads: EntryReads;
}): Promise<PathMeasurement> {
  const tally = createEntryTally();
  const runPathPart = createConcurrencyLimit({ maxConcurrent: MAX_CONCURRENT_PATHS });
  const parts = await Promise.all(
    params.paths.map((path) =>
      runPathPart(() =>
        loadPathPart({
          path: path,
          tally: tally,
          deadlineMs: params.deadlineMs,
          entryReads: params.entryReads,
        }),
      ),
    ),
  );
  const totals = getEntryTallyTotals(tally);
  const unreadableCount = parts.reduce((sum, part) => sum + part.unreadableCount, 0);

  return {
    allocatedBytes: totals.countedBytes,
    entryCount: parts.reduce((sum, part) => sum + part.entryCount, 0),
    unreadableCount: unreadableCount,
    privateSizeFallbackCount: totals.privateSizeFallbackCount,
    isComplete: unreadableCount === 0 && parts.every((part) => part.isWalkCompleted),
    latestModifiedMs: findLatestModifiedMs({ parts: parts }),
    holdsOtherVolume: parts.some((part) => part.holdsOtherVolume),
  };
}

/** Adds the path's root and every entry below it on the root's volume to the tally. */
async function loadPathPart(params: {
  path: string;
  tally: EntryTally;
  deadlineMs: number;
  entryReads: EntryReads;
}): Promise<PathPart> {
  const rootStatsResult = await loadEntryStats({ path: params.path });

  if (rootStatsResult.kind === 'failed') {
    return rootStatsResult.failure.reason === 'missing' ? MISSING_PATH_PART : UNREADABLE_PATH_PART;
  }

  const rootStats = rootStatsResult.value;

  tallyMeasuredEntry({
    tally: params.tally,
    entry: loadMeasuredEntry({
      path: params.path,
      stats: rootStats,
      entryReads: params.entryReads,
    }),
  });

  if (rootStats.kind !== 'directory') {
    return {
      entryCount: 1,
      unreadableCount: 0,
      isWalkCompleted: true,
      latestModifiedMs: rootStats.modifiedMs,
      holdsOtherVolume: false,
    };
  }

  let entryCount = 1;
  let unreadableCount = 0;
  let latestModifiedMs = rootStats.modifiedMs;
  let holdsOtherVolume = await isMountPoint({ path: params.path, dev: rootStats.dev });

  const walkEnd = await walkDirectoryTree({
    rootPath: params.path,
    isStatsNeeded: true,
    maxConcurrentDirectories: MAX_CONCURRENT_DIRECTORIES,
    isStopped: () => Date.now() >= params.deadlineMs,
    entryReads: params.entryReads,
    visitEntry: (entry) => {
      if (entry.stats === null) {
        return 'skip';
      }

      // A volume mounted inside the tree is another disk, such as a simulator runtime image.
      if (entry.stats.dev !== rootStats.dev) {
        holdsOtherVolume = true;

        return 'skip';
      }

      tallyMeasuredEntry({
        tally: params.tally,
        entry: loadMeasuredEntry({
          path: entry.path,
          stats: entry.stats,
          entryReads: params.entryReads,
        }),
      });
      entryCount += 1;
      latestModifiedMs = Math.max(latestModifiedMs, entry.stats.modifiedMs);

      return 'descend';
    },
    onUnreadable: () => {
      unreadableCount += 1;
    },
    onEvictedEntrySkipped: () => undefined,
  });

  return {
    entryCount: entryCount,
    unreadableCount: unreadableCount,
    isWalkCompleted: walkEnd === 'completed',
    latestModifiedMs: latestModifiedMs,
    holdsOtherVolume: holdsOtherVolume,
  };
}

/** The entry as the tally counts it, with the private size of anything but a folder. */
function loadMeasuredEntry(params: {
  path: string;
  stats: EntryStats;
  entryReads: EntryReads;
}): MeasuredEntry {
  if (params.stats.kind === 'directory') {
    return { kind: 'directory', allocatedBytes: params.stats.allocatedBytes };
  }

  return {
    kind: 'file',
    dev: params.stats.dev,
    ino: params.stats.ino,
    allocatedBytes: params.stats.allocatedBytes,
    linkCount: params.stats.linkCount,
    privateBytes: params.entryReads.loadPrivateBytes(params.path),
  };
}

function findLatestModifiedMs(params: { parts: PathPart[] }): number | null {
  let latestModifiedMs: number | null = null;

  for (const part of params.parts) {
    if (part.latestModifiedMs === null) {
      continue;
    }

    if (latestModifiedMs === null || part.latestModifiedMs > latestModifiedMs) {
      latestModifiedMs = part.latestModifiedMs;
    }
  }

  return latestModifiedMs;
}

/** A folder on another volume than its parent is where that volume is mounted; unknown counts. */
async function isMountPoint(params: { path: string; dev: bigint }): Promise<boolean> {
  const parentStats = await loadEntryStats({ path: dirname(params.path) });

  return parentStats.kind === 'failed' || parentStats.value.dev !== params.dev;
}

/**
 * The bytes a removal freed: the drop from the size measured before it to the size measured
 * after, never below 0, and 0 when the measurement after is incomplete, since it then misses
 * part of what is left.
 */
export function getMeasuredFreedBytes(params: {
  beforeBytes: number;
  after: { allocatedBytes: number; isComplete: boolean };
}): number {
  if (!params.after.isComplete) {
    return 0;
  }

  return Math.max(0, params.beforeBytes - params.after.allocatedBytes);
}
