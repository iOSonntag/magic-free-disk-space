import { hasDatalessFlag } from '../system/hasDatalessFlag.js';
import { loadEntryStats } from '../system/loadEntryStats.js';
import { walkDirectoryTree } from '../system/walkDirectoryTree.js';

export type ActivityProbe = 'recent' | 'quiet' | 'unknown';

const MAX_CONCURRENT_DIRECTORIES = 8;

/**
 * Returns `recent` when any entry, the root included, changed at or after `cutoffMs`, skipping
 * entries named in `excludedNames` at every depth. Returns `unknown` when `maxEntries`, the
 * deadline, or an unreadable entry keeps the walk from deciding.
 */
export async function loadTreeActivity(params: {
  path: string;
  cutoffMs: number;
  excludedNames: string[];
  maxEntries: number;
  deadlineMs: number;
}): Promise<ActivityProbe> {
  const rootStats = await loadEntryStats({ path: params.path });

  if (rootStats.kind === 'failed') {
    return 'unknown';
  }

  if (rootStats.value.modifiedMs >= params.cutoffMs) {
    return 'recent';
  }

  if (rootStats.value.kind !== 'directory') {
    return 'quiet';
  }

  let examinedCount = 1;
  let hasRecentEntry = false;
  let hasUnreadableEntry = false;

  const walkEnd = await walkDirectoryTree({
    rootPath: params.path,
    isStatsNeeded: true,
    maxConcurrentDirectories: MAX_CONCURRENT_DIRECTORIES,
    isStopped: () => Date.now() >= params.deadlineMs,
    isFolderEvicted: hasDatalessFlag,
    visitEntry: (entry) => {
      if (entry.stats === null || params.excludedNames.includes(entry.name)) {
        return 'skip';
      }

      examinedCount += 1;

      if (entry.stats.modifiedMs >= params.cutoffMs) {
        hasRecentEntry = true;

        return 'stop';
      }

      if (examinedCount > params.maxEntries) {
        return 'stop';
      }

      return 'descend';
    },
    onUnreadable: () => {
      hasUnreadableEntry = true;
    },
    onEvictedFolderSkipped: () => undefined,
  });

  if (hasRecentEntry) {
    return 'recent';
  }

  if (walkEnd === 'stopped' || hasUnreadableEntry) {
    return 'unknown';
  }

  return 'quiet';
}
