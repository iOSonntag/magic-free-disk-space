import type { Result } from '../result.js';
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
};

const MAX_CONCURRENT_DIRECTORIES = 16;

/**
 * Sums the allocated size of a path without following symbolic links or entering another
 * volume mounted inside it. A partial sum from an unreadable entry or a passed deadline is a
 * success with `isComplete: false`.
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
      },
    };
  }

  // Keys `dev:ino` of the entries already summed, so a hard link adds its blocks once.
  const measuredEntryKeys = new Set<string>();
  let allocatedBytes = rootStats.allocatedBytes;
  let entryCount = 1;
  let unreadableCount = 0;

  const walkEnd = await walkDirectoryTree({
    rootPath: params.path,
    isStatsNeeded: true,
    maxConcurrentDirectories: MAX_CONCURRENT_DIRECTORIES,
    isStopped: () => Date.now() >= params.deadlineMs,
    visitEntry: (entry) => {
      // A volume mounted inside the tree is another disk, such as a simulator runtime image.
      if (entry.stats === null || entry.stats.dev !== rootStats.dev) {
        return 'skip';
      }

      const entryKey = `${entry.stats.dev}:${entry.stats.ino}`;

      if (!measuredEntryKeys.has(entryKey)) {
        measuredEntryKeys.add(entryKey);
        allocatedBytes += entry.stats.allocatedBytes;
      }

      entryCount += 1;

      return 'descend';
    },
    onUnreadable: () => {
      unreadableCount += 1;
    },
  });

  return {
    kind: 'succeeded',
    value: {
      identity: identityResult.value,
      allocatedBytes: allocatedBytes,
      entryCount: entryCount,
      unreadableCount: unreadableCount,
      isComplete: walkEnd === 'completed' && unreadableCount === 0,
    },
  };
}
