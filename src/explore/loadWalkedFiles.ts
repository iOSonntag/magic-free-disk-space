import type { AbsolutePath } from '../path/parseAbsolutePath.js';
import { parseAbsolutePath } from '../path/parseAbsolutePath.js';
import type { EntryStats } from '../system/loadEntryStats.js';
import { walkDirectoryTree } from '../system/walkDirectoryTree.js';
import type { ExploreProbeRun } from './exploreProbe.js';
import { loadExploreEntryStats } from './loadExploreRead.js';

/** A file of the walk that the caller kept, with the stats it was judged by. */
export type WalkedFile = { path: AbsolutePath; stats: EntryStats };

/** The kept files in path order, and whether every file below the root was judged. */
export type WalkedFiles = { files: WalkedFile[]; isComplete: boolean };

/**
 * Walks the files below `rootPath`, into its subfolders only when `isDescending` and never into a
 * hidden entry, reads the stats of each in path order, and keeps those `isKept` accepts. Past
 * `maxFiles` files, at the run's deadline, or past a folder or a file it cannot read, it judges
 * only some, and the result is incomplete.
 */
export async function loadWalkedFiles(params: {
  run: ExploreProbeRun;
  rootPath: AbsolutePath;
  isDescending: boolean;
  maxFiles: number | null;
  maxConcurrentDirectories: number;
  isKept: (stats: EntryStats) => boolean;
}): Promise<WalkedFiles> {
  const filePaths: string[] = [];
  let isComplete = true;
  const walkEnd = await walkDirectoryTree({
    rootPath: params.rootPath,
    isStatsNeeded: false,
    maxConcurrentDirectories: params.maxConcurrentDirectories,
    isStopped: () => Date.now() >= params.run.deadlineMs,
    entryReads: params.run.platform.entryReads,
    visitEntry: (entry) => {
      if (entry.name.startsWith('.')) {
        return 'skip';
      }

      if (entry.kind === 'directory') {
        return params.isDescending ? 'descend' : 'skip';
      }

      if (entry.kind !== 'file') {
        return 'skip';
      }

      if (params.maxFiles !== null && filePaths.length >= params.maxFiles) {
        return 'stop';
      }

      filePaths.push(entry.path);

      return 'skip';
    },
    onUnreadable: () => {
      isComplete = false;
    },
    onEvictedEntrySkipped: () => {},
  });
  const files: WalkedFile[] = [];

  for (const filePath of filePaths.sort()) {
    if (Date.now() >= params.run.deadlineMs) {
      return { files: files, isComplete: false };
    }

    const stats = await loadExploreEntryStats({
      path: filePath,
      privacyDenialCode: params.run.platform.privacyDenialCode,
    });

    if (stats.kind === 'failed') {
      isComplete = false;

      continue;
    }

    if (stats.value !== null && params.isKept(stats.value)) {
      files.push({
        path: parseWalkedPath({ run: params.run, text: filePath }),
        stats: stats.value,
      });
    }
  }

  return { files: files, isComplete: isComplete && walkEnd === 'completed' };
}

/** A path the walk joined below an absolute root; throws for one that is not absolute, a bug. */
function parseWalkedPath(params: { run: ExploreProbeRun; text: string }): AbsolutePath {
  const path = parseAbsolutePath({ rules: params.run.environment.pathRules, text: params.text });

  if (path.kind === 'failed') {
    throw new Error('A walk below an absolute root joined a path that is not absolute.');
  }

  return path.value;
}
