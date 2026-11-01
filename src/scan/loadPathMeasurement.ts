import { dirname } from 'node:path';
import type { Result } from '../result.js';
import { hasDatalessFlag } from '../system/hasDatalessFlag.js';
import { loadEntryStats } from '../system/loadEntryStats.js';
import type { FileFailure, FileIdentity } from '../system/loadFileIdentity.js';
import { loadFileIdentity } from '../system/loadFileIdentity.js';
import { walkDirectoryTree } from '../system/walkDirectoryTree.js';

export type Measurement = {
  identity: FileIdentity;
  allocatedBytes: number;
  /** Entries whose stats were read, the root included. A hard link counts once per path. */
  entryCount: number;
  unreadableCount: number;
  isComplete: boolean;
  /** The newest modification time of the entries read, the root included. */
  latestModifiedMs: number;
  /** True when the folder is a mount point or another volume is mounted inside it. */
  holdsOtherVolume: boolean;
};

const MAX_CONCURRENT_DIRECTORIES = 16;

/**
 * Sums the allocated size of a path without following symbolic links or entering another
 * volume mounted inside it, which it notes instead, as it notes a folder that is a mount point.
 * A partial sum from an unreadable entry or a passed deadline is a success with
 * `isComplete: false`.
 */
export async function loadPathMeasurement(params: {
  path: string;
  deadlineMs: number;
}): Promise<Result<Measurement, FileFailure>> {
  const identityResult = await loadFileIdentity({ path: params.path });

  if (identityResult.kind === 'failed') {
    return identityResult;
  }

  const rootStatsResult = await loadEntryStats({ path: params.path });

  if (rootStatsResult.kind === 'failed') {
    return rootStatsResult;
  }

  const rootStats = rootStatsResult.value;

  if (rootStats.kind !== 'directory') {
    return {
      kind: 'succeeded',
      value: {
        identity: identityResult.value,
        allocatedBytes: rootStats.allocatedBytes,
        entryCount: 1,
        unreadableCount: 0,
        isComplete: true,
        latestModifiedMs: rootStats.modifiedMs,
        holdsOtherVolume: false,
      },
    };
  }

  // Keys `dev:ino` of the entries already summed, so a hard link adds its blocks once.
  const measuredEntryKeys = new Set<string>();
  let allocatedBytes = rootStats.allocatedBytes;
  let entryCount = 1;
  let unreadableCount = 0;
  let latestModifiedMs = rootStats.modifiedMs;
  let holdsOtherVolume = await isMountPoint({ path: params.path, dev: rootStats.dev });

  const walkEnd = await walkDirectoryTree({
    rootPath: params.path,
    isStatsNeeded: true,
    maxConcurrentDirectories: MAX_CONCURRENT_DIRECTORIES,
    isStopped: () => Date.now() >= params.deadlineMs,
    isFolderEvicted: hasDatalessFlag,
    visitEntry: (entry) => {
      if (entry.stats === null) {
        return 'skip';
      }

      // A volume mounted inside the tree is another disk, such as a simulator runtime image.
      if (entry.stats.dev !== rootStats.dev) {
        holdsOtherVolume = true;

        return 'skip';
      }

      const entryKey = `${entry.stats.dev}:${entry.stats.ino}`;

      if (!measuredEntryKeys.has(entryKey)) {
        measuredEntryKeys.add(entryKey);
        allocatedBytes += entry.stats.allocatedBytes;
      }

      entryCount += 1;
      latestModifiedMs = Math.max(latestModifiedMs, entry.stats.modifiedMs);

      return 'descend';
    },
    onUnreadable: () => {
      unreadableCount += 1;
    },
    onEvictedFolderSkipped: () => undefined,
  });

  return {
    kind: 'succeeded',
    value: {
      identity: identityResult.value,
      allocatedBytes: allocatedBytes,
      entryCount: entryCount,
      unreadableCount: unreadableCount,
      isComplete: walkEnd === 'completed' && unreadableCount === 0,
      latestModifiedMs: latestModifiedMs,
      holdsOtherVolume: holdsOtherVolume,
    },
  };
}

/** A folder on another volume than its parent is where that volume is mounted; unknown counts. */
async function isMountPoint(params: { path: string; dev: bigint }): Promise<boolean> {
  const parentStats = await loadEntryStats({ path: dirname(params.path) });

  return parentStats.kind === 'failed' || parentStats.value.dev !== params.dev;
}
